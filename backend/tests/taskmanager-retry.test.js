// tests/taskmanager-retry.test.js — M1: retryTask 最大重试次数边界测试
// 运行: node backend/tests/taskmanager-retry.test.js
const tm = require("../taskManager");

let pass = 0, fail = 0;
function check(name, ok, detail = "") {
    if (ok) pass++;
    else { fail++; console.log(`❌ ${name} ${detail}`); }
    console.log(`${ok ? "✅" : "❌"} ${name}${detail ? " — " + detail : ""}`);
}

console.log("\n========== M1: retryTask 最大重试次数（MAX_RETRIES=5）==========");

// canRetry 纯逻辑边界测试
check("attempts=1 FAILED 可重试", tm.canRetry({ status: "FAILED", attempts: 1 }).ok === true);
check("attempts=2 FAILED 可重试(第1次重试后)", tm.canRetry({ status: "FAILED", attempts: 2 }).ok === true);
check("attempts=5 FAILED 可重试(第4次重试后)", tm.canRetry({ status: "FAILED", attempts: 5 }).ok === true);
check("attempts=6 FAILED 拒绝(已达5次上限)", tm.canRetry({ status: "FAILED", attempts: 6 }).ok === false);
check("attempts=7 FAILED 拒绝(超上限)", tm.canRetry({ status: "FAILED", attempts: 7 }).ok === false);
check("拒绝原因明确", /最大重试次数/.test(tm.canRetry({ status: "FAILED", attempts: 6 }).error || ""));
check("SUCCESS 拒绝", tm.canRetry({ status: "SUCCESS", attempts: 1 }).ok === false);
check("RUNNING 拒绝", tm.canRetry({ status: "RUNNING", attempts: 1 }).ok === false);
check("CANCELLED 可重试", tm.canRetry({ status: "CANCELLED", attempts: 1 }).ok === true);
check("不存在的任务拒绝", tm.canRetry(null).ok === false);

// MAX_RETRIES 常量存在且为 5
check("MAX_RETRIES = 5", tm.MAX_RETRIES === 5, `实际 ${tm.MAX_RETRIES}`);

console.log(`\n结果: ${pass}/${pass + fail} 通过`);
process.exit(fail > 0 ? 1 : 0);
