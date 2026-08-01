const tools = require("./tools");


async function dispatch(aiText){

    console.log(
        "⚙️ dispatcher收到:",
        aiText
    );


    let data;


    try{

        data = JSON.parse(aiText);

    }catch(e){

        return aiText;

    }



    switch(data.tool){


        // 普通聊天

        case "chat":

            return data.content;



        // 查看项目文件

        case "listFiles":

            return tools.listFiles();



        // 查看文件夹

        case "scanFolder":

            return tools.scanFolder(
                data.path || ""
            );



        // 读取文件

        case "readFile":

            return tools.readFile(
                data.path
            );



        // 搜索代码

        case "searchCode":


            const search =
            tools.searchCode(
                data.keyword
            );


            return {

                success:true,

                type:"code_search",

                message:
                "🐶 找到相关代码",

                keyword:
                data.keyword,

                results:
                search.results

            };



        // 创建文件

        case "createFile":

            return tools.createFile(
                data.path,
                data.content || ""
            );



        // 修改文件

        case "writeFile":

            return tools.writeFile(
                data.path,
                data.content || ""
            );



        // 删除文件

        case "deleteFile":

            return tools.deleteFile(
                data.path
            );



        // 创建文件夹

        case "createFolder":

            return tools.createFolder(
                data.path
            );



        // 移动文件

        case "moveFile":

            return tools.moveFile(
                data.from,
                data.to
            );



        // 项目分析

        case "analyzeProject":

            return tools.analyzeProject();



        default:

            return aiText;


    }

}



module.exports={
    dispatch
};