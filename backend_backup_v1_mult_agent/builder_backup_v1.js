console.log("🏗️ Builder模块加载");

const axios = require("axios");

async function build(task){

    console.log("🏗️ Builder任务:", task);


    const prompt = `
你是高级前端工程师。

任务：
${task}

只输出JSON。

格式：

{
"title":"项目名称",
"files":[
{
"path":"index.html",
"content":"完整HTML代码"
}
]
}

禁止解释。
禁止markdown。
禁止<think>。
`;


    const res = await axios.post(
        "http://localhost:11434/api/chat",
        {
            model:"qwen3:4b",
            messages:[
                {
                    role:"user",
                    content:prompt
                }
            ],
            stream:false
        }
    );


    let output=res.data.message.content;


    console.log("🧠 Builder原始:",output);



    // 去掉Qwen思考标签
    output = output
    .replace(/<think>[\s\S]*?<\/think>/g,"")
    .replace(/<\/think>/g,"")
    .trim();



    // 找JSON
    const start=output.indexOf("{");
    const end=output.lastIndexOf("}");


    if(start!==-1 && end!==-1){
        output=output.substring(start,end+1);
    }


    console.log("🧹 清洗后:",output);



    try{

        const json=JSON.parse(output);

        return json;

    }catch(e){

        console.log("❌ JSON解析失败");

        return {
            error:e.message,
            raw:output
        };
    }

}


module.exports=build;