// tests/taskfile-prune.test.js — M3: tasks checkpoint 磁盘保留上限测试
// 运行: node backend/tests/taskfile-prune.test.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const tm = require("../taskManager");

let pass = 0, fail = 0;
function check(name, ok, detail = "") {
    if (ok) pass++;
    else { fail++; console.log(`❌ ${name} ${detail}`); }
    console.log(`${ok ? "✅" : "❌"} ${name}${detail ? " — " + detail : ""}`);
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "godan_task_prune_"));

function makeTaskFile(dir, id, mtimeMs, status = "FAILED") {
    const p = path.join(dir, `${id}.json`);
    fs.writeFileSync(p, JSON.stringify({ id, status, steps: [] }));
    fs.utimesSync(p, new Date(mtimeMs), new Date(mtimeMs));
    return p;
}

function countFiles(dir) {
    return fs.readdirSync(dir).filter(f => f.endsWith(".json")).length;
}

console.log("\n========== M3: checkpoint 磁盘保留上限（MAX_TASK_FILES=100）==========");
check("上限常量存在", typeof tm.MAX_TASK_FILES === "number" && tm.MAX_TASK_FILES === 100, `实际 ${tm.MAX_TASK_FILES}`);

// 150 个历史任务文件（全 FINAL）→ 清理到 100，删除最旧 50 个
const dirA = path.join(tmpDir, "over_count");
fs.mkdirSync(dirA, { recursive: true });
for (let i = 0; i < 150; i++) makeTaskFile(dirA, `t_old_${i}`, Date.now() - (150 - i) * 60000);
const r1 = tm.pruneTaskFiles(dirA);
check("150 个清理后 ≤100", countFiles(dirA) <= 100, `剩余 ${countFiles(dirA)}`);
check("删除 50 个", r1.removed === 50, `实际 ${r1.removed}`);
check("保留最新(t_old_149 在)", fs.existsSync(path.join(dirA, "t_old_149.json")));
check("删除最旧(t_old_000 不在)", !fs.existsSync(path.join(dirA, "t_old_000.json")));

// 运行中任务保护: 120 个文件，其中 5 个 RUNNING（最新 mtime）→ RUNNING 全部保留
const dirB = path.join(tmpDir, "with_running");
fs.mkdirSync(dirB, { recursive: true });
for (let i = 0; i < 115; i++) makeTaskFile(dirB, `t_done_${i}`, Date.now() - (120 - i) * 60000);
for (let i = 0; i < 5; i++) makeTaskFile(dirB, `t_run_${i}`, Date.now() - (5 - i) * 1000, "RUNNING");
const r2 = tm.pruneTaskFiles(dirB);
const runningSurvived = [0, 1, 2, 3, 4].every(i => fs.existsSync(path.join(dirB, `t_run_${i}.json`)));
check("RUNNING 任务文件全部保留", runningSurvived);
check("删除 20 个(FINAL 中最旧)", r2.removed === 20, `实际 ${r2.removed}`);
check("总数 ≤100", countFiles(dirB) <= 100, `剩余 ${countFiles(dirB)}`);

// 100 个以内不清理
const dirC = path.join(tmpDir, "under_count");
fs.mkdirSync(dirC, { recursive: true });
for (let i = 0; i < 50; i++) makeTaskFile(dirC, `t_few_${i}`, Date.now() - i * 60000);
const r3 = tm.pruneTaskFiles(dirC);
check("50 个不清理", r3.removed === 0 && countFiles(dirC) === 50, `removed=${r3.removed}`);

// 不存在目录安全
const r4 = tm.pruneTaskFiles(path.join(tmpDir, "nonexistent"));
check("不存在目录安全", r4.removed === 0 && r4.count === 0);

// 损坏文件（JSON 解析失败）不导致崩溃
const dirD = path.join(tmpDir, "corrupt");
fs.mkdirSync(dirD, { recursive: true });
for (let i = 0; i < 105; i++) makeTaskFile(dirD, `t_corrupt_${i}`, Date.now() - (105 - i) * 60000);
fs.writeFileSync(path.join(dirD, "broken.json"), "{{{not json");
const r5 = tm.pruneTaskFiles(dirD);
check("损坏文件不崩溃且清理正常", typeof r5.removed === "number", `removed=${r5.removed}`);

fs.rmSync(tmpDir, { recursive: true, force: true });
console.log(`\n结果: ${pass}/${pass + fail} 通过`);
process.exit(fail > 0 ? 1 : 0);
