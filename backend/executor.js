console.log("⚙️ Executor模块加载");


const fs = require("fs");
const path = require("path");
const { exec, spawn } = require("child_process");
const { PROJECTS_DIR } = require("./paths");

const testPage = require("./tester");
const ProjectManager = require("./projectManager");
const { commitProject } = require("./gitManager");



async function execute(input, context){


    console.log(
        "⚙️ Executor收到:",
        input
    );

    // 修正: 接收 mode/existingProject 上下文（原实现丢弃了 dispatcher 传入的这两个参数）
    const ctx = context || {};
    const mode = ctx.mode || "create";
    const existingProject = ctx.existingProject || null;

    // modify 模式校验: 目标项目必须存在
    if (mode === "modify") {
        if (!existingProject || !existingProject.path || !fs.existsSync(existingProject.path)) {
            return {
                success: false,
                error: "修改目标项目不存在或路径无效: " + (existingProject && existingProject.path)
            };
        }
    }

    let data;


    try{

        data =
        typeof input==="string"
        ?
        JSON.parse(input)
        :
        input;


    }catch(e){

        return {
            success:false,
            error:"JSON解析失败"
        };

    }



    let projectDir;
    let projectName;



    if(data.path){


        projectDir=data.path;

        projectName =
        path.basename(projectDir);


    }
    else{


        const title =
        data.title || "Godan_Project";


        projectName =
        title.replace(
            /[^\w\u4e00-\u9fa5-]/g,
            "_"
        );


        projectDir =
        path.join(
            PROJECTS_DIR,
            projectName
        );


        console.log(
            "📁创建新项目:",
            projectDir
        );


    }



    fs.mkdirSync(
        projectDir,
        {
            recursive:true
        }
    );




    if(
        !data.files ||
        !Array.isArray(data.files)
    ){

        return {
            success:false,
            error:"没有files文件列表"
        };

    }




    let indexFile=null;



    for(const file of data.files){


        // 修正: 路径穿越防护 — 拒绝任何逃逸项目目录的路径
        const rawPath = file.path || "";
        const filePath =
        path.join(
            projectDir,
            rawPath
        );

        const projectRoot = path.resolve(projectDir);
        const resolvedFilePath = path.resolve(filePath);
        if(resolvedFilePath !== projectRoot && !resolvedFilePath.startsWith(projectRoot + path.sep)){
            console.log(
                "⛔拦截非法路径:",
                rawPath
            );
            return {
                success:false,
                error:"非法路径被拦截: " + rawPath
            };
        }


        fs.mkdirSync(
            path.dirname(filePath),
            {
                recursive:true
            }
        );


        fs.writeFileSync(
            filePath,
            file.content,
            "utf8"
        );


        console.log(
            "📄写入:",
            filePath
        );



        if(
            file.path.toLowerCase()
            ===
            "index.html"
        ){

            indexFile=filePath;

        }


    }





    /*
    ===========================
    自动识别Electron
    ===========================
    */


    let isElectron=false;


    const packageFile =
    path.join(
        projectDir,
        "package.json"
    );



    if(fs.existsSync(packageFile)){


        try{


            const pkg =
            JSON.parse(
                fs.readFileSync(
                    packageFile,
                    "utf8"
                )
            );


            if(
                pkg.dependencies?.electron ||
                pkg.devDependencies?.electron ||
                pkg.main
            ){

                isElectron=true;

            }


        }catch(e){}



    }





    /*
    ===========================
    Electron启动
    ===========================
    */


    if(isElectron){


        console.log(
            "🖥️检测到Electron项目"
        );


        // 修正: 用 spawn 参数数组替代 shell 字符串拼接，消除命令注入面
        const npmInstall = spawn("npm", ["install"], {
            cwd: projectDir,
            shell: false,
            stdio: "ignore"
        });
        npmInstall.on("error", (err) => {
            console.log("❌npm install 启动失败:", err.message);
        });
        npmInstall.on("close", (code) => {
            if (code === 0) {
                console.log("🚀npm install 完成，启动应用");
                const npmStart = spawn("npm", ["start"], {
                    cwd: projectDir,
                    shell: false,
                    stdio: "ignore",
                    detached: true
                });
                npmStart.on("error", (err) => {
                    console.log("❌Electron启动失败:", err.message);
                });
            } else {
                console.log("❌npm install 失败，退出码:", code);
            }
        });

    }



    /*
    ===========================
    Web启动
    ===========================
    */


    else if(indexFile){


        console.log(
            "🌐启动网页"
        );

        // 修正: 参数数组方式打开文件，避免路径注入；兼容 Windows(open不存在用 start)
        const openCmd = process.platform === "win32" ? "cmd" : "open";
        const openArgs = process.platform === "win32"
            ? ["/c", "start", "", indexFile]
            : [indexFile];
        spawn(openCmd, openArgs, {
            shell: false,
            stdio: "ignore"
        }).on("error", (err) => {
            console.log("❌打开网页失败:", err.message);
        });

    }





    let testResult=null;


    if(indexFile){

        try{

            testResult =
            await testPage(indexFile);


        }catch(err){

            testResult={
                success:false,
                error:err.message
            };

        }

    }




    try{


        ProjectManager.registerProject({

            name:projectName,

            path:projectDir,

            type:
            isElectron
            ?
            "desktop_app"
            :
            "web_app"

        });


    }catch(e){}





    /*
    P1-2: 项目级 Git 版本管理
    写盘成功后自动提交（创建/修改均可回滚）。
    失败不阻断主流程（git 不可用时项目仍可用）。
    */
    let git = null;
    try {
        const gitMsg = mode === "modify"
            ? "修改项目: " + projectName
            : "创建项目: " + projectName;
        git = await commitProject(projectDir, gitMsg);
        if (git && git.ok && git.commit) {
            console.log("🌿 Git提交:", git.commit, git.initialized ? "(新仓库)" : "");
        } else if (git && !git.ok) {
            console.log("⚠️ Git提交跳过:", git.error);
        }
    } catch (e) {
        console.log("⚠️ Git提交异常:", e.message);
        git = null;
    }

    // 将 git 信息合并进返回结果（若提交失败则不阻塞）
    const finalResult = {
        success: true,
        project: projectName,
        path: projectDir,
        type: isElectron ? "desktop_app" : "web_app",
        opened: isElectron || !!indexFile,
        test: testResult,
        git
    };
    return finalResult;

}



module.exports=execute;