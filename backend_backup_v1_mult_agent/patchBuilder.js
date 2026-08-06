const OpenAI = require("openai");

console.log("🩹 PatchBuilder模块加载");


const client = new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL:"https://api.deepseek.com"
});


async function buildPatch(project, request){

    console.log("🩹 PatchBuilder开始:", request);


    const prompt = `
你是一个代码修改Agent。

用户需求:
${request}

已有项目:
${JSON.stringify(project.files,null,2)}

规则:
- 不要重新创建项目
- 只修改必要文件
- 保留已有功能
- 输出JSON

格式:
{
 "files":[
  {
   "path":"",
   "content":""
  }
 ]
}
`;


    try{

        const completion =
        await client.chat.completions.create({

            model:"deepseek-chat",

            messages:[
                {
                    role:"user",
                    content:prompt
                }
            ],

            response_format:{
                type:"json_object"
            }

        });


        return JSON.parse(
            completion.choices[0].message.content
        );


    }catch(err){

        console.log(
            "❌ PatchBuilder错误:",
            err.message
        );

        return {
            files:[]
        };
    }

}


module.exports={
    buildPatch
};