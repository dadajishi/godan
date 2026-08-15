// tests/screenshot-limit.test.js — M2: screenshots 数量/磁盘上限自动清理测试
// 运行: node backend/tests/screenshot-limit.test.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const shot = require("../tools/screenshot");

let pass = 0, fail = 0;
function check(name, ok, detail = "") {
    if (ok) pass++;
    else { fail++; console.log(`❌ ${name} ${detail}`); }
    console.log(`${ok ? "✅" : "❌"} ${name}${detail ? " — " + detail : ""}`);
}

// 临时目录（不碰真实截图）
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "godan_shot_limit_"));

function makeFakeShots(dir, n, startTime) {
    fs.mkdirSync(dir, { recursive: true });
    for (let i = 0; i < n; i++) {
        const f = path.join(dir, `shot_${String(i).padStart(4, "0")}.png`);
        fs.writeFileSync(f, "fake");
        fs.utimesSync(f, new Date(startTime + i * 1000), new Date(startTime + i * 1000));
    }
}

function countShots(dir) {
    if (!fs.existsSync(dir)) return 0;
    return fs.readdirSync(dir).filter(f => /\.png$/.test(f)).length;
}

function totalSize(dir) {
    if (!fs.existsSync(dir)) return 0;
    return fs.readdirSync(dir).filter(f => /\.png$/.test(f))
        .reduce((s, f) => s + fs.statSync(path.join(dir, f)).size, 0);
}

console.log("\n========== M2: 截图数量上限（MAX_SCREENSHOTS=200）==========");
check("上限常量存在", typeof shot.MAX_SCREENSHOTS === "number" && shot.MAX_SCREENSHOTS === 200, `实际 ${shot.MAX_SCREENSHOTS}`);
check("磁盘上限常量存在", typeof shot.MAX_SCREENSHOT_MB === "number" && shot.MAX_SCREENSHOT_MB === 500, `实际 ${shot.MAX_SCREENSHOT_MB}`);

// 205 张（超 200）→ 清理到 200，删除最旧 5 张
const dirA = path.join(tmpDir, "over_count");
makeFakeShots(dirA, 205, Date.now() - 3600 * 1000);
const r1 = shot.enforceLimit(dirA);
check("205 张清理后 ≤200", countShots(dirA) <= 200, `剩余 ${countShots(dirA)}`);
check("删除 5 张", r1.removed === 5, `实际 ${r1.removed}`);
check("保留的是最新 200 张(shot_0005 删了)", !fs.existsSync(path.join(dirA, "shot_0000.png")) && fs.existsSync(path.join(dirA, "shot_0204.png")));

// 200 张内不清理
const dirB = path.join(tmpDir, "under_count");
makeFakeShots(dirB, 100, Date.now() - 3600 * 1000);
const r2 = shot.enforceLimit(dirB);
check("100 张不清理", r2.removed === 0 && countShots(dirB) === 100, `removed=${r2.removed}`);

console.log("\n========== M2: 磁盘占用上限（500MB，稀疏文件快速构造）==========");
// 3 个 200MB 稀疏文件 = 600MB 超 500MB → 删除最旧 1 个
const dirC = path.join(tmpDir, "over_disk");
fs.mkdirSync(dirC, { recursive: true });
for (let i = 0; i < 3; i++) {
    const f = path.join(dirC, `big_${i}.png`);
    fs.writeFileSync(f, "x");
    fs.truncateSync(f, 200 * 1024 * 1024); // 稀疏文件 200MB
    fs.utimesSync(f, new Date(Date.now() - (3 - i) * 60000), new Date(Date.now() - (3 - i) * 60000));
}
const r3 = shot.enforceLimit(dirC);
const remainingMB = totalSize(dirC) / 1024 / 1024;
check("600MB 清理后 ≤500MB", remainingMB <= 500 + 1, `剩余 ${Math.round(remainingMB)}MB`);
check("删除了最旧的 big_0", !fs.existsSync(path.join(dirC, "big_0.png")) && fs.existsSync(path.join(dirC, "big_2.png")));

// 不存在的目录安全返回
const r4 = shot.enforceLimit(path.join(tmpDir, "nonexistent"));
check("不存在目录安全", r4.removed === 0 && r4.count === 0);

console.log("\n========== 清理临时目录 ==========");
fs.rmSync(tmpDir, { recursive: true, force: true });
console.log(`\n结果: ${pass}/${pass + fail} 通过`);
process.exit(fail > 0 ? 1 : 0);
