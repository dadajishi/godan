console.log("⚙️ Dispatcher模块加载");


const Architect = require("./architect");
const Planner = require("./planner");
const Builder = require("./builder");
const PatchBuilder = require("./patchBuilder");
const Reviewer = require("./reviewer");
const Executor = require("./executor");

const Manager = require("./agents/manager");

const ProjectManager = require("./projectManager");
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



    Memory.update({

        task,

        status:"dispatching",

        errors:[]

    });



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
                    "🔍尝试项目模糊匹配"
                );


                const projects =
                ProjectManager.listProjects();



                existingProject =
                projects.find(
                    p=>{

                        const name =
                        p.name;


                        const words =
                        task.split("");



                        return words.some(
                            c =>
                            name.includes(c)
                        );


                    }
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
        await Planner(task);



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

                project:
                existingProject.name,

                files:
                existingProject.files

            });



        }






        console.log(
            "🏗️生成完成"
        );





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
            existingProject,
            mode
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