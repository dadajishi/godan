console.log("⚙️ Dispatcher模块加载");


const Architect = require("./architect");
const Planner = require("./planner");
const Builder = require("./builder");
const PatchBuilder = require("./patchBuilder");
const Reviewer = require("./reviewer");
const Executor = require("./executor");
const repairProject = require("./repair");
const testPage = require("./tester");

const Manager = require("./agents/manager");

const ProjectManager = require("./projectManager");
const fs = require("fs");
const Memory = require("./memory/memory");





async function dispatch(aiResult){


    console.log(
        "⚙️ dispatcher收到:",
        aiResult
    );



    if(!aiResult || !aiResult.task){

        return {
            success:false,
            error:"没有任务"
        };

    }



    const task =
    aiResult.task;



    console.log(
        "🧠 AI任务:",
        task
    );



    try{

    // 修正: Memory.update 移入 try 内，写失败不再拖垮服务
    Memory.update({

        task,

        status:"dispatching",

        errors:[]

    });

        let mode="create";

        let existingProject=null;



        const modifyWords=[

            "修改",
            "增加",
            "添加",
            "优化",
            "升级",
            "改成",
            "加入",
            "支持",
            "夜间",
            "模式"

        ];




        if(
            modifyWords.some(
                w=>task.includes(w)
            )
        ){


            mode="modify";


            console.log(
                "🔍检测到修改任务"
            );



            existingProject =
            ProjectManager.findProject(task);



            if(!existingProject){


                console.log(
                    "⚠️没有找到匹配项目，转创建"
                );

            }




            if(existingProject){


                console.log(
                    "📁找到项目:",
                    existingProject.name
                );



                existingProject.files =
                ProjectManager.readProjectFiles(
                    existingProject.path
                );



            }else{


                console.log(
                    "⚠️没有找到项目，转创建"
                );


                mode="create";


            }



        }




        /*
        Architect
        */


        Memory.update({
            status:"architecting"
        });



        console.log(
            "🏛️进入Architect"
        );



        const architecture =
        await Architect(task);



        architecture.mode =
        mode;



        Memory.update({
            architecture
        });



        console.log(
            "🏛️Architect完成"
        );





        /*
        Planner
        */


        Memory.update({
            status:"planning"
        });



        console.log(
            "🧠进入Planner"
        );



        const plan =
        await Planner(task, architecture);



        Memory.update({
            plan
        });



        console.log(
            "🧠Planner完成"
        );






        /*
        Manager
        */


        console.log(
            "🤖进入ManagerAgent"
        );



        const agentResult =
        await Manager({

            task,

            architecture,

            plan

        });



        console.log(
            "🤖Manager完成"
        );






        let buildResult;



        /*
        ===================
        CREATE
        ===================
        */


        if(mode==="create"){


            console.log(
                "🏗️进入Builder"
            );



            buildResult =
            await Builder({

                task,

                architecture,

                plan,

                agentResult

            });



        }





        /*
        ===================
        MODIFY
        ===================
        */


        else{


            console.log(
                "🩹进入PatchBuilder"
            );



            buildResult =
            await PatchBuilder({
                task,
                existingProject,
                architecture,
                plan
            });

            // 修正: modify 模式必须携带原项目路径，否则 Executor 会新建目录
            if (buildResult && !buildResult.path && existingProject) {
                buildResult.path = existingProject.path;
                buildResult.mode = "modify";
            }



        }






        console.log(
            "🏗️生成完成"
        );


        // 修正: 生成结果校验 — LLM 失败/空输出不再静默通过
        if (!buildResult || !Array.isArray(buildResult.files) || buildResult.files.length === 0) {
            const errMsg = (buildResult && buildResult.error) ? buildResult.error : "生成结果为空（LLM 调用失败或返回异常）";
            console.log(
                "❌生成校验失败:",
                errMsg
            );
            Memory.update({
                status: "error",
                errors: [errMsg]
            });
            return {
                success: false,
                mode,
                error: errMsg
            };
        }





        /*
        Reviewer
        */


        const review =
        await Reviewer(
            buildResult
        );



        console.log(
            "🔍Reviewer:",
            review
        );





        if(!review.pass){


            console.log(
                "⚠️审核未通过"
            );


        }





        /*
        Executor
        */


        console.log(
            "⚙️进入Executor"
        );



        const result =
        await Executor(
            buildResult,
            {
                mode,
                existingProject
            }
        );



        console.log(
            "⚙️Executor:",
            result
        );



        /*
        P1-1: 测试修复闭环
        Executor 已运行 Playwright 测试 (result.test)。
        若失败 → repair 循环（最多 2 轮）：LLM 修复 → 重测
        */
        let repairRounds = 0;
        const MAX_REPAIR_ROUNDS = 2;
        let repairLog = [];

        while (
            result &&
            result.success === true &&
            result.test &&
            result.test.success === false &&
            repairRounds < MAX_REPAIR_ROUNDS
        ) {
            repairRounds++;
            console.log(`🔁 第 ${repairRounds} 轮修复 (测试失败)`);

            const repairResult = await repairProject(
                result.path,
                result.test
            );

            repairLog.push({
                round: repairRounds,
                error: (result.test.errors || []).slice(0, 3),
                repairResult
            });

            if (!repairResult.success || !repairResult.repaired) {
                console.log("⛔ 修复失败，停止重试");
                break;
            }

            // 重测（不重新打开网页）
            try {
                const indexFile = result.path + "/index.html";
                if (fs.existsSync(indexFile)) {
                    result.test = await testPage(indexFile);
                    console.log(`🧪 第 ${repairRounds} 轮修复后测试:`, result.test.success);
                } else {
                    break;
                }
            } catch (err) {
                console.log("❌ 重测失败:", err.message);
                break;
            }
        }

        if (repairRounds > 0) {
            result.repair = {
                rounds: repairRounds,
                fixed: result.test && result.test.success === true,
                log: repairLog
            };
        }



        Memory.update({

            status:"completed",

            result

        });





        return {


            success:
            result.success===true,


            mode,


            architecture,


            plan,


            review,


            result


        };




    }catch(error){


        console.log(
            "❌Dispatcher错误:",
            error.message
        );



        Memory.update({

            status:"error",

            errors:[
                error.message
            ]

        });



        return {

            success:false,

            error:error.message

        };


    }


}




module.exports =
dispatch;