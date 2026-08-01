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


        case "chat":

            return data.content;



        case "listFiles":

            return tools.listFiles();



        case "scanFolder":

            return tools.scanFolder(
                data.path || ""
            );



        case "readFile":

            return tools.readFile(
                data.path
            );



        case "searchCode":

            return tools.searchCode(
                data.keyword
            );



        case "createFile":

            return tools.createFile(
                data.path,
                data.content || ""
            );



        case "writeFile":

            return tools.writeFile(
                data.path,
                data.content || ""
            );



        case "deleteFile":

            return tools.deleteFile(
                data.path
            );



        case "createFolder":

            return tools.createFolder(
                data.path
            );



        case "moveFile":

            return tools.moveFile(
                data.from,
                data.to
            );



        case "analyzeProject":

            return tools.analyzeProject();



        default:

            return aiText;

    }


}



module.exports={
    dispatch
};