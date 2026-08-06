console.log("Builder loaded");

const axios = require("axios");

const MODEL_URL = "http://localhost:11434/api/chat";
const REQUEST_TIMEOUT = 120000;
const MAX_ATTEMPTS = 2;


function parseBuildOutput(output){

    if(typeof output !== "string"){
        throw new Error("模型没有返回文本");
    }

    output = output.replace(/<think>[\s\S]*?<\/think>/gi, "");
    output = output.replace(/```json/gi, "");
    output = output.replace(/```/g, "");
    output = output.trim();

    const start = output.indexOf("{");
    const end = output.lastIndexOf("}");

    if(start === -1 || end === -1 || end < start){
        throw new Error("模型输出中没有JSON对象");
    }

    const result = JSON.parse(output.substring(start, end + 1));

    if(!result || typeof result !== "object" || Array.isArray(result)){
        throw new Error("项目结果必须是对象");
    }

    if(typeof result.title !== "string" || !result.title.trim()){
        throw new Error("项目结果缺少title");
    }

    if(!Array.isArray(result.files) || result.files.length === 0){
        throw new Error("项目结果缺少files列表");
    }

    for(const file of result.files){
        if(!file || typeof file.path !== "string" || !file.path.trim()){
            throw new Error("文件缺少path");
        }

        if(typeof file.content !== "string"){
            throw new Error("文件内容必须是字符串");
        }
    }

    return result;
}


async function build(task){

    console.log("Builder task:", task);


    const prompt = `
You are a senior frontend engineer.

Task:
${task}

Return ONLY JSON.

Format:

{
"title":"project name",
"files":[
{
"path":"index.html",
"content":"html code"
},
{
"path":"style.css",
"content":"css code"
},
{
"path":"script.js",
"content":"javascript code"
}
]
}

Rules:
No markdown.
No explanation.
No think tags.
`;



    console.log("Calling Qwen...");


    let lastError;

    for(let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++){

        try{

            const res = await axios.post(
                MODEL_URL,
                {
                    model:"qwen3:4b",
                    messages:[
                        {
                            role:"user",
                            content:prompt
                        }
                    ],
                    stream:false
                },
                {
                    timeout:REQUEST_TIMEOUT
                }
            );

            console.log("Raw output received, attempt:", attempt);

            return parseBuildOutput(
                res.data && res.data.message
                    ? res.data.message.content
                    : ""
            );

        }catch(err){

            lastError = err;

            console.log(
                "Builder attempt failed:",
                attempt,
                err.message
            );
        }
    }

    return {
        error:"builder failed after retry",
        detail:lastError ? lastError.message : "unknown error"
    };

}



module.exports = build;
