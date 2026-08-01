const fs = require("fs");
const path = require("path");

async function execute(buildData) {
    try {
        if (typeof buildData === "string") {
            buildData = JSON.parse(buildData);
        }

        const title = buildData.title || "Untitled";

        // 项目目录
        const projectDir = path.join(
            __dirname,
            "../projects",
            title
        );

        // 自动创建项目文件夹
        if (!fs.existsSync(projectDir)) {
            fs.mkdirSync(projectDir, {
                recursive: true
            });
        }

        const results = [];

        for (const file of buildData.files) {

            const filePath = path.join(
                projectDir,
                file.path
            );

            // 创建文件所在目录
            const folder = path.dirname(filePath);

            if (!fs.existsSync(folder)) {
                fs.mkdirSync(folder, {
                    recursive: true
                });
            }

            fs.writeFileSync(
                filePath,
                file.content,
                "utf8"
            );

            results.push({
                file: path.join(title, file.path),
                success: true
            });
        }

        return {
            success: true,
            message: "项目创建完成",
            project: title,
            path: projectDir,
            results
        };

    } catch (error) {

        return {
            success: false,
            error: error.message
        };

    }
}

module.exports = {
    execute
};