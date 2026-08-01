const tools = require("./tools");


async function dispatch(aiText){

    console.log(
        "⚙️ dispatcher收到:",
        aiText
    );


    let data;


    try{

        data =
        JSON.parse(aiText);

    }catch(e){

        return aiText;

    }



    if(data.tool==="chat"){

        return data.content;

    }



    if(data.tool==="createFile"){

        return tools.createFile(
            data.path,
            data.content
        );

    }



    if(data.tool==="writeFile"){

        return tools.writeFile(
            data.path,
            data.content
        );

    }



    if(data.tool==="readFile"){

        return tools.readFile(
            data.path
        );

    }



    return aiText;

}



module.exports={
    dispatch
};
