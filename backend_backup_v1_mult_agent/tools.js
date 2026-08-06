const fs = require("fs");
const path = require("path");


const ROOT = path.join(
    __dirname,
    ".."
);



// 获取文件列表

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

        path:filePath,

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



// 删除文件

function deleteFile(filePath){

    const fullPath =
    path.join(ROOT,filePath);


    if(fs.existsSync(fullPath)){

        fs.unlinkSync(fullPath);

    }


    return {

        success:true

    };

}



// 扫描目录

function scanFolder(
    folderPath=""
){

    const fullPath =
    path.join(ROOT,folderPath);


    if(!fs.existsSync(fullPath)){

        return {

            success:false,

            error:"目录不存在"

        };

    }


    return {

        success:true,

        files:
        fs.readdirSync(fullPath)

    };

}



// 创建目录

function createFolder(folderPath){

    const fullPath =
    path.join(ROOT,folderPath);


    fs.mkdirSync(
        fullPath,
        {
            recursive:true
        }
    );


    return {

        success:true

    };

}



// 移动文件

function moveFile(
    from,
    to
){

    fs.renameSync(

        path.join(ROOT,from),

        path.join(ROOT,to)

    );


    return {

        success:true

    };

}



// 🔍 搜索代码

function searchCode(keyword){

    const results=[];



    function scan(dir){


        let files=[];


        try{

            files =
            fs.readdirSync(dir);

        }catch(e){

            return;

        }



        for(const file of files){


            if(
                file==="node_modules" ||
                file===".git"
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


            }
            else{


                try{


                    const text =
                    fs.readFileSync(
                        full,
                        "utf8"
                    );



                    if(
                        text.includes(keyword)
                    ){

                        results.push({

                            file:
                            path.relative(
                                ROOT,
                                full
                            ),

                            keyword

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

        results

    };

}



// 🧠 项目分析

function analyzeProject(){


    const project={};



    project.files =
    listFiles();



    const packagePath =
    path.join(
        ROOT,
        "package.json"
    );


    if(fs.existsSync(packagePath)){

        project.package =
        fs.readFileSync(
            packagePath,
            "utf8"
        );

    }



    const src =
    path.join(
        ROOT,
        "src"
    );


    if(fs.existsSync(src)){

        project.src =
        fs.readdirSync(src);

    }



    const backend =
    path.join(
        ROOT,
        "backend"
    );


    if(fs.existsSync(backend)){

        project.backend =
        fs.readdirSync(backend);

    }



    return {

        success:true,

        project

    };

}





module.exports={


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