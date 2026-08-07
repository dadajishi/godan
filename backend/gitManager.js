// gitManager.js — Godan P1-2: 项目级 Git 版本管理
// 每个生成的项目独立 git 仓库：创建/修改后自动 commit，支持回滚
const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");

console.log("🌿 GitManager模块加载");

// 执行 git 命令（参数数组，shell:false 防注入）
function runGit(projectDir, args) {
    return new Promise((resolve) => {
        execFile("git", args, {
            cwd: projectDir,
            shell: false,
            timeout: 30000
        }, (err, stdout, stderr) => {
            if (err) {
                resolve({ ok: false, error: (stderr || err.message).trim().slice(0, 200) });
            } else {
                resolve({ ok: true, output: stdout.trim() });
            }
        });
    });
}

// 确保项目是 git 仓库（不是则 init）
async function ensureRepo(projectDir) {
    if (!fs.existsSync(projectDir)) return { ok: false, error: "目录不存在" };
    const isRepo = fs.existsSync(path.join(projectDir, ".git"));
    if (isRepo) return { ok: true, initialized: false };

    // 新仓库：init + 配置本地 user（无全局配置也能 commit）
    const init = await runGit(projectDir, ["init", "-q"]);
    if (!init.ok) return init;
    await runGit(projectDir, ["config", "user.name", "Godan AI"]);
    await runGit(projectDir, ["config", "user.email", "godan@local"]);
    return { ok: true, initialized: true };
}

/**
 * 提交项目变更
 * @param {string} projectDir 项目目录
 * @param {string} message 提交信息
 * @returns {Promise<{ok, commit?, initialized?, error?}>}
 */
async function commitProject(projectDir, message) {
    try {
        const repo = await ensureRepo(projectDir);
        if (!repo.ok) return repo;

        // 暂存所有变更
        const add = await runGit(projectDir, ["add", "-A"]);
        if (!add.ok) return add;

        // 检查是否有变更（无变更则不提交）
        const status = await runGit(projectDir, ["status", "--porcelain"]);
        if (!status.ok) return status;
        if (!status.output) {
            return { ok: true, noChanges: true, initialized: repo.initialized };
        }

        const commit = await runGit(projectDir, ["commit", "-q", "-m", message]);
        if (!commit.ok) {
            // 可能是"nothing to commit"竞态，忽略
            if (commit.error.includes("nothing to commit")) {
                return { ok: true, noChanges: true, initialized: repo.initialized };
            }
            return commit;
        }

        // 获取 commit hash
        const log = await runGit(projectDir, ["rev-parse", "--short", "HEAD"]);
        return {
            ok: true,
            commit: log.ok ? log.output : "unknown",
            initialized: repo.initialized
        };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

/**
 * 查看项目提交历史
 * @returns {Promise<{ok, log?, error?}>}
 */
async function history(projectDir, limit = 10) {
    const r = await runGit(projectDir, ["log", `-${limit}`, "--oneline"]);
    if (!r.ok) return r;
    return { ok: true, log: r.output.split("\n").filter(Boolean) };
}

/**
 * 回滚到某次提交
 * @param {string} projectDir 项目目录
 * @param {string} commitRef commit hash
 */
async function rollback(projectDir, commitRef) {
    return runGit(projectDir, ["checkout", commitRef, "--", "."]);
}

module.exports = { ensureRepo, commitProject, history, rollback };
