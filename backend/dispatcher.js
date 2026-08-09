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
const computerAgent = require("./computerAgent");

const ProjectManager = require("./projectManager");
const persona = require("./persona");
const fs = require("fs");
const Memory = require("./memory/memory");





async function dispatch(aiResult, opts){


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

    /*
    =====================
    CHAT 模式（P2 升级）
    用户闲聊/探讨/提问 → 直接返回聊天回复，不进入建应用流程
    =====================
    */
    if (aiResult.tool === "chat") {
        console.log("💬 聊天模式");
        const reply = await persona.chatReply(task);
        const result = {
            success: true,
            mode: "chat",
            plan: {
                title: "聊天",
                type: "chat",
                task,
                reply,
                plan: ["直接回复"]
            }
        };
        console.log("💬 聊天回复:", reply);
        return result;
    }

    /*
    =====================
    COMPUTER 模式（P-电脑操作）
    用户要求操作电脑（打开应用/执行命令/文件操作/管理服务）
    → computerAgent 计划-执行-观察-验证循环
    =====================
    */
    if (aiResult.tool === "computer") {
        console.log("🖥️ 电脑操作模式");
        const result = await computerAgent(task, opts);
        console.log("🖥️ ComputerAgent 结果:", result.success ? "成功" : "失败", "| 步骤:", (result.steps || []).length);
        return result;
    }

    /*
    =====================
    二次校验（防误判）
    brain 判 plan 但消息没有建应用动作词 → 降级为 chat
    =====================
    */
    if (aiResult.tool === "plan" && !hasBuildIntent(task)) {
        console.log("⚠️ plan 但无建应用意图，降级为聊天:", task.slice(0, 50));
        const reply = await persona.chatReply(task);
        const result = {
            success: true,
            mode: "chat",
            plan: {
                title: "聊天",
                type: "chat",
                task,
                reply,
                plan: ["直接回复"]
            }
        };
        return result;
    }



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




// 建应用意图动作词（二次校验用）
const BUILD_VERBS = ["做一个", "做一", "做个", "生成", "帮我建", "帮我做", "写个", "写一个", "开发", "创建", "建个", "建一个", "做成", "改成", "加个", "添加", "增加", "优化", "升级", "实现", "修改", "改一下", "弄一个", "搞一个", "来一个"];

function hasBuildIntent(task) {
    if (!task || typeof task !== "string") return false;
    return BUILD_VERBS.some(v => task.includes(v));
}

module.exports =
dispatch;