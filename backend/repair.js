// repair.js — Godan P1-1: 测试失败自动修复
// 输入: 项目路径 + 测试错误 → LLM 分析修复 → 写盘 → 返回修复报告
// 注意: 走统一模型抽象层 llm.js（用户配置的模型），不再直连
const fs = require("fs");
const path = require("path");
const llm = require("./llm");

console.log("🔧 Repair模块加载");

// 扫描项目文件（排除 node_modules / .git / dist）
function scanProject(projectPath) {
    const files = [];
    function scan(dir) {
        let list;
        try { list = fs.readdirSync(dir); } catch (e) { return; }
        for (const name of list) {
            if (name === "node_modules" || name === ".git" || name === "dist") continue;
            const fullPath = path.join(dir, name);
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
                scan(fullPath);
            } else {
                if (stat.size > 200 * 1024) continue; // 跳过超大文件
                files.push({
                    path: path.relative(projectPath, fullPath),
                    content: fs.readFileSync(fullPath, "utf8")
                });
            }
        }
    }
    scan(projectPath);
    return files;
}

/**
 * 修复项目
 * @param {string} projectPath 项目目录
 * @param {object} testResult  测试结果 {success, errors, warnings}
 * @returns {Promise<{success, repaired, files, error?}>}
 */
async function repairProject(projectPath, testResult) {
    console.log("🔧 开始自动修复");
    console.log("错误信息:", testResult.errors);

    const files = scanProject(projectPath);
    if (files.length === 0) {
        return { success: false, error: "项目目录为空或不可读" };
    }

    const prompt = `
你是一个专业的前端代码修复Agent。

一个网页项目在浏览器中运行出错，请分析错误并修复。

【运行错误】
${JSON.stringify(testResult.errors, null, 2)}

【项目文件】
${JSON.stringify(files, null, 2)}

修复要求：
1. 保留原有功能与设计
2. 只修改有问题的文件，未修改的文件不要返回
3. 确保修复后无语法错误、无运行时错误
4. 文件路径使用相对路径（如 index.html、script.js）

只返回 JSON，格式：
{
  "files": [
    {"path": "文件路径", "content": "修复后的完整代码"}
  ],
  "reason": "简要说明修复了什么"
}
`;

    try {
        console.log("🧠 请求LLM修复...");
        const result = await llm.chat({
            system: "你是严格JSON输出的前端修复Agent，只输出JSON。",
            user: prompt,
            temperature: 0.1,
            maxTokens: 8000,
            json: true,
            retries: 1
        });

        if (!result || !Array.isArray(result.files) || result.files.length === 0) {
            throw new Error("AI没有返回修复文件");
        }

        let written = 0;
        for (const file of result.files) {
            // 安全: 修复目标必须在项目目录内
            const target = path.resolve(projectPath, file.path);
            if (!target.startsWith(path.resolve(projectPath) + path.sep)) {
                console.log("⛔ 拒绝越界写入:", file.path);
                continue;
            }
            fs.writeFileSync(target, file.content, "utf8");
            written++;
            console.log("🔧 已修复:", file.path);
        }

        console.log("✅ 自动修复完成, 修复", written, "个文件");
        return {
            success: true,
            repaired: written > 0,
            files: written,
            reason: result.reason || ""
        };
    } catch (err) {
        console.log("❌ Repair失败:", err.message);
        return {
            success: false,
            error: err.message
        };
    }
}

module.exports = repairProject;
