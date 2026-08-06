console.log("⚙️ Dispatcher模块加载");


const Architect = require("./architect");
const Planner = require("./planner");
const Builder = require("./builder");
const Reviewer = require("./reviewer");
const Executor = require("./executor");
const ProjectManager = require("./projectManager");

const Manager = require("./agents/manager");

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



    const task = aiResult.task;



    console.log(
        "🧠 AI任务:",
        task
    );



    // 初始化共享记忆

    Memory.update({

        task,

        status:"dispatching",

        errors:[]

    });


    console.log(
        "🧠 Memory初始化完成"
    );



    try{


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
            "支持"

        ];



        if(
            modifyWords.some(
                word=>task.includes(word)
            )
        ){


            mode="modify";


            console.log(
                "🔍检测到修改任务"
            );



            existingProject =
            ProjectManager.findProject(task);



            if(existingProject){


                console.log(
                    "📁找到项目:",
                    existingProject.name
                );


                try{

                    existingProject.files =
                    ProjectManager.readProjectFiles(
                        existingProject.path
                    );


                }catch(e){

                    console.log(
                        "⚠️读取失败:",
                        e.message
                    );

                }


            }else{


                console.log(
                    "⚠️没有旧项目，转创建"
                );


                mode="create";


            }


        }





        /*
        ===================
        Architect
        ===================
        */


        Memory.update({

            status:"architecting"

        });



        console.log(
            "🏛️进入Architect"
        );



        const architecture =
        await Architect(task);



        architecture.mode=mode;



        Memory.update({

            architecture

        });



        console.log(
            "🏛️Architect完成"
        );





        /*
        ===================
        Planner
        ===================
        */


        Memory.update({

            status:"planning"

        });



        console.log(
            "🧠进入Planner"
        );



        const plan =
        await Planner(task);



        Memory.update({

            plan

        });



        console.log(
            "🧠Planner完成"
        );






        /*
        ===================
        Multi Agent Manager
        ===================
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
            "🤖Manager完成:",
            agentResult
        );






        /*
        ===================
        Builder
        ===================
        */


        Memory.update({

            status:"building"

        });



        let buildResult;

        let reviewResult;



        for(
            let i=0;
            i<3;
            i++
        ){



            console.log(
                `🏗️Builder 第${i+1}次`
            );



            buildResult =
            await Builder({

                task,

                architecture,

                plan,

                existingProject,

                agentResult

            });



            console.log(
                "🏗️Builder完成"
            );





            /*
            Reviewer
            */


            Memory.update({

                status:"reviewing"

            });



            reviewResult =
            await Reviewer(
                buildResult
            );



            Memory.update({

                review:reviewResult

            });



            console.log(
                "🔍Reviewer:",
                reviewResult
            );



            if(reviewResult.pass){

                console.log(
                    "✅审核通过"
                );

                break;

            }



            console.log(
                "⚠️审核失败，重新Builder"
            );


        }





        /*
        ===================
        Executor
        ===================
        */


        Memory.update({

            status:"executing"

        });



        console.log(
            "⚙️进入Executor"
        );



        const result =
        await Executor(
            buildResult
        );



        console.log(
            "⚙️Executor:",
            result
        );



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


            review:reviewResult,


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



module.exports=dispatch;