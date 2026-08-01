const {
    readFile,
    writeFile,
    createFile
} = require("./tools");



// 狗蛋 Agent v4.1

async function runAgent(message){



    // 读取文件

    if(
        message.includes("读取") ||
        message.includes("打开")
    ){


        const file =
        message
        .replace("读取","")
        .replace("打开","")
        .trim();



        const result =
        readFile(file);



        if(!result.success){

            return "🐶 没找到这个文件";

        }



        return `

🐶 我读取到了：

文件：
${file}


内容：

${result.content}

`;

    }






    // 创建文件


    if(
        message.includes("创建")
    ){


        let text =
        message
        .replace("创建","")
        .trim();



        let parts =
        text.split(" ");



        const file =
        parts[0];



        const content =
        parts
        .slice(1)
        .join(" ");




        const result =
        createFile(
            file,
            content
        );



        if(result.success){

            return `
🐶 创建成功！

文件：
${file}

内容：
${content}
`;

        }


    }







    // 修改文件


    if(
        message.includes("写入") ||
        message.includes("修改")
    ){


        let text =
        message
        .replace("写入","")
        .replace("修改","")
        .trim();



        let parts =
        text.split(" ");



        const file =
        parts[0];


        const content =
        parts
        .slice(1)
        .join(" ");




        const result =
        writeFile(
            file,
            content
        );



        if(result.success){

            return `
🐶 修改完成！

文件：
${file}
`;

        }


    }





    return null;


}



module.exports = {

    runAgent

};