console.log("🔍 Reviewer模块加载");


async function Reviewer(project){

    console.log("🔍 Reviewer检查:", project.title);


    let issues = [];


    // 基础检查
    if(!project.files){
        issues.push("没有生成文件");
    }


    if(project.files){

        const names = project.files.map(
            f=>f.path
        );


        if(!names.includes("index.html")){
            issues.push("缺少入口文件 index.html");
        }


        if(names.includes("script.js")){

            const js = project.files.find(
                f=>f.path==="script.js"
            );


            if(js.content.length < 100){
                issues.push(
                    "JavaScript代码过短，可能功能不完整"
                );
            }
        }


    }



    let result={

        pass: issues.length===0,

        issues,

        suggestion:
            issues.length===0
            ?
            "项目质量通过"
            :
            "需要Builder修改"

    };


    console.log("🔍 Reviewer结果:",result);


    return result;

}


module.exports = Reviewer;