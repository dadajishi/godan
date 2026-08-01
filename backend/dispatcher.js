console.log("⚙️ Dispatcher模块加载");


const Architect = require("./architect");
const Planner = require("./planner");
const Builder = require("./builder");
const PatchBuilder = require("./patchBuilder");
const Reviewer = require("./reviewer");
const Executor = require("./executor");
const ProjectManager = require("./projectManager");
const CodeAnalyzer = require("./codeAnalyzer");


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



    try{


        let mode = "create";

        let existingProject = null;



        const modifyWords = [
            "修改",
            "增加",
            "添加",
            "优化",
            "升级",
            "改成",
            "加入",
            "支持",
            "调整",
            "修复"
        ];



        /*
        =====================
        判断创建 / 修改
        =====================
        */


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
                    "📁找到已有项目:",
                    existingProject.name
                );



                try{


                    existingProject.files =
                    CodeAnalyzer.analyzeProject(
                        existingProject.path
                    ).files;



                    console.log(
                        "📄项目分析完成:",
                        existingProject.files.length,
                        "个文件"
                    );


                }catch(err){


                    console.log(
                        "⚠️项目分析失败:",
                        err.message
                    );


                }



            }else{


                console.log(
                    "⚠️没有找到项目，切换创建模式"
                );


                mode="create";


            }


        }





        /*
        =====================
        Architect
        =====================
        */


        console.log(
            "🏛️进入Architect"
        );


        const architecture =
        await Architect(task);



        architecture.mode = mode;



        console.log(
            "🏛️Architect:",
            architecture
        );






        /*
        =====================
        Planner
        =====================
        */


        console.log(
            "🧠进入Planner"
        );


        const plan =
        await Planner(task);



        console.log(
            "🧠Planner:",
            plan
        );





        /*
        =====================
        Builder / PatchBuilder
        =====================
        */


        let buildResult;


        if(
            mode==="modify"
            &&
            existingProject
        ){


            console.log(
                "🩹进入PatchBuilder"
            );



            buildResult =
            await PatchBuilder.buildPatch(
                existingProject,
                task
            );



            buildResult.project =
            existingProject.name;


            buildResult.path =
            existingProject.path;



        }else{


            console.log(
                "🏗️进入Builder"
            );


            buildResult =
            await Builder({

                task,

                architecture,

                plan,

                existingProject

            });


        }



        console.log(
            "🏗️生成结果:",
            buildResult
        );





        /*
        =====================
        Reviewer
        =====================
        */


        console.log(
            "🔍进入Reviewer"
        );


        const reviewResult =
        await Reviewer(
            buildResult
        );



        console.log(
            "🔍Reviewer:",
            reviewResult
        );



        if(!reviewResult.pass){


            console.log(
                "⚠️Reviewer未通过"
            );


        }






        /*
        =====================
        Executor
        =====================
        */


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




        return {


            success:
            result.success===true,


            mode,


            architecture,


            plan,


            review:
            reviewResult,


            result


        };




    }catch(error){


        console.log(
            "❌Dispatcher错误:",
            error.message
        );


        return {

            success:false,

            error:error.message

        };


    }



}



module.exports = dispatch;