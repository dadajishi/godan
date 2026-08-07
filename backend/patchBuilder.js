console.log("PatchBuilder module loaded");

const llm = require("./llm");
const Memory = require("./memory/memory");


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



        // 长期记忆注入：修改时也参考用户偏好
        const memoryText = Memory.memoriesContext(10);
        const memoryBlock = memoryText
            ? `\n\n【用户长期记忆】（修改时参考这些偏好）\n${memoryText}\n`
            : "";

        // P1-3: 项目理解 — 结构化呈现文件清单与完整内容
        const projectMeta = {
            name: existingProject?.name || "",
            type: existingProject?.type || "web_app",
            path: existingProject?.path || ""
        };
        const fileList = (existingProject?.files || []).map(f => f.path).join("\n");
        const fileContents = (existingProject?.files || [])
            .map(f => `===== ${f.path} =====\n${f.content}`)
            .join("\n\n");

        const prompt = `

You are a code modification agent.

Your job is to modify an existing project.


User request:

${task}


Project metadata:

${JSON.stringify(projectMeta, null, 2)}


Project files (${(existingProject?.files || []).length} files):

${fileList}


Full file contents:

${fileContents}


Architecture:

${JSON.stringify(
architecture,
null,
2
)}

${memoryBlock}


Analysis steps (do this before writing code):
1. Read the full file contents above carefully.
2. Identify which files are relevant to the user request.
3. Understand existing functions, variables, and styles before changing them.
4. Make minimal changes that preserve existing behavior.


Rules:

1. Only modify requested parts.
2. Keep existing functions.
3. Return complete files (full content, not partial).
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