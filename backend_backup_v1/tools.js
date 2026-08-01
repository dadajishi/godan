const fs = require("fs");
const path = require("path");


const ROOT = path.join(
    __dirname,
    ".."
);



// 查看项目文件

function listFiles(){

    return fs.readdirSync(ROOT);

}



// 读取文件

function readFile(filePath){

    const fullPath =
    path.join(ROOT,filePath);


    if(!fs.existsSync(fullPath)){

        return {
            success:false,
            error:"文件不存在"
        };

    }


    return {

        success:true,

        content:
        fs.readFileSync(
            fullPath,
            "utf8"
        )

    };

}



// 创建文件

function createFile(
filePath,
content=""
){

    const fullPath =
    path.join(ROOT,filePath);


    fs.writeFileSync(
        fullPath,
        content
    );


    return {
        success:true
    };

}



// 修改文件

function writeFile(
filePath,
content
){

    const fullPath =
    path.join(ROOT,filePath);


    fs.writeFileSync(
        fullPath,
        content
    );


    return {
        success:true
    };

}



// 删除文件

function deleteFile(filePath){


    const fullPath =
    path.join(ROOT,filePath);



    if(!fs.existsSync(fullPath)){

        return {
            success:false,
            error:"文件不存在"
        };

    }


    fs.unlinkSync(fullPath);


    return {
        success:true
    };

}



// 扫描文件夹

function scanFolder(folderPath=""){


    const fullPath =
    path.join(ROOT,folderPath);



    if(!fs.existsSync(fullPath)){

        return {
            success:false,
            error:"文件夹不存在"
        };

    }


    return {

        success:true,

        files:
        fs.readdirSync(fullPath)

    };

}



// 创建文件夹

function createFolder(folderPath){


    const fullPath =
    path.join(ROOT,folderPath);



    if(!fs.existsSync(fullPath)){

        fs.mkdirSync(
            fullPath,
            {
                recursive:true
            }
        );

    }


    return {
        success:true
    };

}



// 移动文件

function moveFile(from,to){


    const source =
    path.join(ROOT,from);


    const target =
    path.join(ROOT,to);



    fs.renameSync(
        source,
        target
    );


    return {
        success:true
    };

}



// =======================
// 🐶 Cursor代码搜索
// =======================


function searchCode(keyword){


    const results=[];



    function scan(dir){


        let files;


        try{

            files =
            fs.readdirSync(dir);

        }catch(e){

            return;

        }



        for(const file of files){


            if(
                file==="node_modules" ||
                file===".git" ||
                file==="dist"
            ){

                continue;

            }



            const full =
            path.join(dir,file);



            let stat;


            try{

                stat =
                fs.statSync(full);

            }catch(e){

                continue;

            }



            if(stat.isDirectory()){


                scan(full);


            }else{


                try{


                    const content =
                    fs.readFileSync(
                        full,
                        "utf8"
                    );


                    if(
                        content.includes(keyword)
                    ){


                        results.push({

                            file:
                            path.relative(
                                ROOT,
                                full
                            )

                        });


                    }


                }catch(e){}



            }


        }


    }



    scan(ROOT);



    return {

        success:true,

        keyword,

        count:
        results.length,

        results

    };


}



// =======================
// 🧠 项目分析
// =======================


function analyzeProject(){


    return {

        success:true,

        project:{

            files:listFiles()

        }

    };

}



// =======================
// 导出全部能力
// =======================


module.exports = {


    listFiles,

    readFile,

    createFile,

    writeFile,

    deleteFile,

    scanFolder,

    createFolder,

    moveFile,

    searchCode,

    analyzeProject

};