// tools/filesystem.js — 文件系统工具
// 动作: list / read / write / search / mkdir / move / copy / rename / delete
// 返回统一结构 { success, output, error, exitCode }
// 注意: 权限判定在 tools/index.js 统一处理，本模块只做实际执行 + 基础防御
const fs = require("fs");
const path = require("path");
const os = require("os");
const { normalize } = require("../permissions");

function ok(output, exitCode = 0) {
    return { success: true, output, error: null, exitCode };
}
function fail(error, exitCode = 1) {
    return { success: false, output: null, error: String(error), exitCode };
}

// 目录列表（含类型/大小，排除 node_modules/.git 避免爆炸）
function list(params) {
    try {
        const dir = normalize(params.path || params.target || os.homedir());
        if (!fs.existsSync(dir)) return fail(`目录不存在: ${dir}`);
        if (!fs.statSync(dir).isDirectory()) return fail(`不是目录: ${dir}`);
        const items = fs.readdirSync(dir)
            .filter(n => n !== "node_modules" && n !== ".git")
            .map(n => {
                const full = path.join(dir, n);
                let type = "file", size = 0;
                try {
                    const st = fs.statSync(full);
                    type = st.isDirectory() ? "dir" : "file";
                    size = st.size;
                } catch (e) { /* ignore */ }
                return { name: n, type, size };
            })
            .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1));
        return ok(JSON.stringify(items, null, 2));
    } catch (e) {
        return fail(e.message);
    }
}

function read(params) {
    try {
        const file = normalize(params.path || params.target || params.file);
        if (!fs.existsSync(file)) return fail(`文件不存在: ${file}`);
        if (fs.statSync(file).isDirectory()) return fail(`是目录，请用 list: ${file}`);
        if (fs.statSync(file).size > 500 * 1024) return fail("文件过大(>500KB)，请用 shell 查看");
        return ok(fs.readFileSync(file, "utf8"));
    } catch (e) {
        return fail(e.message);
    }
}

function write(params) {
    try {
        const file = normalize(params.path || params.target || params.file);
        const content = String(params.content ?? "");
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, content, "utf8");
        return ok(`已写入 ${file} (${Buffer.byteLength(content, "utf8")} 字节)`);
    } catch (e) {
        return fail(e.message);
    }
}

// 递归搜索文件名（默认跳过 node_modules/.git/dist）
function search(params) {
    try {
        const root = normalize(params.path || params.target || os.homedir());
        const keyword = String(params.keyword || params.query || params.name || "").toLowerCase();
        if (!keyword) return fail("缺少搜索关键词 (keyword)");
        if (!fs.existsSync(root)) return fail(`目录不存在: ${root}`);

        const hits = [];
        const MAX_RESULTS = 100;
        function scan(dir, depth) {
            if (hits.length >= MAX_RESULTS || depth > 8) return;
            let items;
            try { items = fs.readdirSync(dir, { withFileTypes: true }); }
            catch (e) { return; }
            for (const it of items) {
                if (hits.length >= MAX_RESULTS) return;
                if (["node_modules", ".git", "dist", "Library", ".Trash"].includes(it.name)) continue;
                const full = path.join(dir, it.name);
                if (it.isDirectory()) {
                    if (it.name.toLowerCase().includes(keyword)) {
                        hits.push({ path: full, type: "dir" });
                    }
                    scan(full, depth + 1);
                } else if (it.name.toLowerCase().includes(keyword)) {
                    hits.push({ path: full, type: "file" });
                }
            }
        }
        scan(root, 0);
        if (hits.length === 0) return ok("未找到匹配文件");
        return ok(JSON.stringify(hits, null, 2));
    } catch (e) {
        return fail(e.message);
    }
}

function mkdir(params) {
    try {
        const dir = normalize(params.path || params.target);
        fs.mkdirSync(dir, { recursive: true });
        return ok(`已创建目录 ${dir}`);
    } catch (e) {
        return fail(e.message);
    }
}

function move(params) {
    try {
        const src = normalize(params.src || params.path || params.target);
        const dest = normalize(params.dest || params.to);
        if (!fs.existsSync(src)) return fail(`源不存在: ${src}`);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.renameSync(src, dest);
        return ok(`已移动 ${src} → ${dest}`);
    } catch (e) {
        return fail(e.message);
    }
}

function copy(params) {
    try {
        const src = normalize(params.src || params.path || params.target);
        const dest = normalize(params.dest || params.to);
        if (!fs.existsSync(src)) return fail(`源不存在: ${src}`);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(src, dest);
        return ok(`已复制 ${src} → ${dest}`);
    } catch (e) {
        return fail(e.message);
    }
}

function rename(params) {
    try {
        const src = normalize(params.src || params.path || params.target);
        const dest = normalize(params.dest || params.to || params.newName);
        if (!fs.existsSync(src)) return fail(`源不存在: ${src}`);
        fs.renameSync(src, dest);
        return ok(`已重命名 ${src} → ${dest}`);
    } catch (e) {
        return fail(e.message);
    }
}

// 删除（权限层会要求确认；此实现仅删文件或空目录，目录递归删除仅在明确 recursive 时）
function del(params) {
    try {
        const target = normalize(params.path || params.target || params.file);
        if (!fs.existsSync(target)) return fail(`目标不存在: ${target}`);
        const st = fs.statSync(target);
        if (st.isDirectory()) {
            if (params.recursive) {
                fs.rmSync(target, { recursive: true, force: false });
                return ok(`已删除目录 ${target}`);
            }
            const children = fs.readdirSync(target);
            if (children.length > 0) {
                return fail(`目录非空(${children.length}项)，如需递归删除请加 recursive:true`);
            }
            fs.rmdirSync(target);
            return ok(`已删除空目录 ${target}`);
        }
        fs.unlinkSync(target);
        return ok(`已删除文件 ${target}`);
    } catch (e) {
        return fail(e.message);
    }
}

module.exports = {
    name: "filesystem",
    description: "文件系统操作：查看/读取/创建/搜索/移动/复制/重命名/删除文件与目录",
    actions: { list, read, write, search, mkdir, move, copy, rename, delete: del }
};
