console.log("🤖 ManagerAgent模块加载");



async function Manager({

    task,

    architecture,

    plan

}){


    console.log(
        "🤖 Manager收到:",
        {
            task,
            architecture,
            plan
        }
    );




    const agents=[];




    /*
    前端任务
    */

    if(

        task.includes("网页")
        ||
        task.includes("页面")
        ||
        task.includes("网站")
        ||
        task.includes("UI")
        ||
        task.includes("界面")
        ||
        task.includes("组件")
        ||
        task.includes("样式")

    ){


        agents.push({

            name:
            "FrontendAgent",

            role:
            "负责HTML/CSS/JavaScript界面开发"


        });


    }





    /*
    后端任务
    */


    if(

        task.includes("接口")
        ||
        task.includes("API")
        ||
        task.includes("服务器")
        ||
        task.includes("数据库")

    ){


        agents.push({

            name:
            "BackendAgent",

            role:
            "负责后端逻辑"


        });


    }





    /*
    AI任务
    */


    if(

        task.includes("AI")
        ||
        task.includes("模型")
        ||
        task.includes("智能")

    ){


        agents.push({

            name:
            "AIAgent",

            role:
            "负责AI能力接入"


        });


    }





    /*
    默认Agent
    */


    if(
        agents.length===0
    ){


        agents.push({

            name:
            "GeneralAgent",

            role:
            "通用开发Agent"


        });


    }





    const result={


        task,


        mode:
        architecture.mode || "create",


        agents,


        instruction:

        architecture.mode==="modify"

        ?

        "修改已有项目，不重新创建"

        :

        "创建新项目"

    };





    console.log(
        "🤖 Manager分配完成:",
        result
    );



    return result;


}





module.exports =
Manager;