console.log("PatchBuilder module loaded");

const axios = require("axios");


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


        const apiKey =
        process.env.DEEPSEEK_API_KEY;


        if (!apiKey) {

            throw new Error(
                "Missing DEEPSEEK_API_KEY"
            );

        }



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
            "Sending request to DeepSeek..."
        );



        const response =
        await axios.post(

            "https://api.deepseek.com/chat/completions",

            {

                model:"deepseek-chat",

                messages:[

                    {
                        role:"system",
                        content:
                        "You are a strict coding agent. Output JSON only."
                    },


                    {
                        role:"user",
                        content:prompt
                    }

                ],


                temperature:0.1

            },


            {

                headers:{

                    Authorization:
                    `Bearer ${apiKey}`,

                    "Content-Type":
                    "application/json"

                },


                timeout:120000

            }

        );



        let content =
        response.data
        .choices[0]
        .message
        .content;



        console.log(
            "DeepSeek output:",
            content.slice(0,300)
        );



        // remove markdown

        content =
        content
        .replace(/```json/g,"")
        .replace(/```/g,"")
        .trim();



        // extract first JSON object

        const start =
        content.indexOf("{");


        if(start === -1){

            throw new Error(
                "No JSON found"
            );

        }


        content =
        content.slice(start);



        let depth = 0;

        let end = -1;



        for(
            let i = 0;
            i < content.length;
            i++
        ){

            if(content[i] === "{")
                depth++;


            if(content[i] === "}"){

                depth--;


                if(depth === 0){

                    end = i;
                    break;

                }

            }

        }



        if(end !== -1){

            content =
            content.slice(
                0,
                end + 1
            );

        }



        const result =
        JSON.parse(content);



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