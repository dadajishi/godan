console.log("PatchBuilder module loaded");

const llm = require("./llm");


async function PatchBuilder({

    task,
    existingProject,
    architecture,
    plan

}) {

    console.log(
        "PatchBuilder task:",
        task
    );


    try {



        const prompt = `

You are a code modification agent.

Your job is to modify an existing project.


User request:

${task}


Existing project:

${JSON.stringify(
existingProject,
null,
2
)}


Architecture:

${JSON.stringify(
architecture,
null,
2
)}



Rules:

1. Only modify requested parts.
2. Keep existing functions.
3. Return complete files.
4. Return JSON only.
5. No markdown.
6. No explanations.



Output format:

{
"title":"project name",

"files":[
{
"path":"file path",
"content":"complete file content"
}
]

}

`;



          console.log(
            "Sending request to LLM..."
        );


        // D3: 统一走模型抽象层（含 max_tokens，长输出不再截断）
        const result = await llm.chat({
            system: "You are a strict coding agent. Output JSON only.",
            user: prompt,
            temperature: 0.1,
            maxTokens: 8000,
            json: true
        });

        if (!result) {
            throw new Error("LLM 返回非 JSON");
        }




        if(
            !result.files ||
            !Array.isArray(result.files)
        ){

            throw new Error(
                "Missing files array"
            );

        }



        console.log(
            "PatchBuilder finished:",
            result.title
        );


        return result;



    } catch(error) {


        console.log(
            "PatchBuilder error:",
            error.message
        );


        return {

            title:"",
            files:[]

        };


    }


}


module.exports = PatchBuilder;