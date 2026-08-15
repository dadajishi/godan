// tests/security-audit.test.js — 完整架构安全审计（发布前）
// 运行: node backend/tests/security-audit.test.js
// 覆盖: S1 shell 三面+包装器 / DANGEROUS 不可绕过 / redact / 工具面 / fail closed / CORS 白名单
const p = require("../permissions");
const tools = require("../tools");

let pass = 0, fail = 0;
const findings = [];
function check(name, ok, detail = "") {
    if (ok) pass++;
    else { fail++; findings.push({ name, detail }); }
    console.log(`${ok ? "✅" : "❌"} ${name}${detail ? " — " + detail : ""}`);
}

console.log("\n========== 1. S1: shell 权限（46+18 用例已独立覆盖，此处抽查）==========");
check("sh -c 递归", p.classifyShell('sh -c "rm file.txt"').level !== "SAFE");
check("pipeline 分段", p.classifyShell('ls /tmp | rm -rf /tmp/x').level !== "SAFE");
check("python -c 静态扫描", p.classifyShell("python3 -c \"import os; os.system('rm -rf /tmp/x')\"").level !== "SAFE");
check("包装器递归", p.classifyShell('command rm file.txt').level !== "SAFE");
check("xargs 递归", p.classifyShell('find /tmp -name x | xargs rm').level !== "SAFE");
check("正向 ls SAFE", p.classifyShell("ls -la /tmp").level === "SAFE");
check("正向 cd SAFE", p.classifyShell("cd /tmp").level === "SAFE");

console.log("\n========== 2. DANGEROUS 不可绕过（autoApprove/confirm/replanner 均不可）==========");
(async () => {
    // autoApprove=true 也不能放行 DANGEROUS
    const r1 = await tools.run("shell", "exec", { command: "sudo rm -rf /tmp/x" }, { autoApprove: true });
    check("DANGEROUS + autoApprove 仍拒绝", r1.blocked === true && r1.level === "DANGEROUS", JSON.stringify({ blocked: r1.blocked, level: r1.level }));
    // confirmOp 无法批准 DANGEROUS（DANGEROUS 根本不会进待确认队列）
    const r2 = await tools.run("shell", "exec", { command: "rm -rf /" });
    check("DANGEROUS 不进待确认队列", r2.blocked === true && !r2.opId, `opId=${r2.opId}`);
    // process.start 命令也过 shell 分类
    const r3 = await tools.run("process", "start", { command: "sudo rm -rf /tmp/x" });
    check("process.start 过 shell 黑名单", r3.blocked === true, `level=${r3.level}`);
    // CONFIRM 正常进队列（功能不破坏）
    const r4 = await tools.run("filesystem", "delete", { path: "/tmp/godan_audit_nonexist.txt" });
    check("CONFIRM 进待确认队列(功能正常)", r4.needConfirm === true && !!r4.opId, `needConfirm=${r4.needConfirm}`);
    if (r4.opId) await tools.confirmOp(r4.opId); // 清理队列

    console.log("\n========== 3. 敏感数据 redact ==========");
    const red = p.redactSensitive({ apiKey: "sk-1234567890", params: { token: "abc", path: "/tmp/x" }, text: "my password is hunter2" });
    check("apiKey 打码", red.apiKey === "[REDACTED]");
    check("token 打码", red.params.token === "[REDACTED]");
    check("密码值打码", red.text === "[REDACTED]" || /hunter2/.test(red.text) === false, JSON.stringify(red.text));
    check("非敏感字段保留", red.params.path === "/tmp/x");

    console.log("\n========== 4. 工具面 fail closed ==========");
    check("未知工具 CONFIRM", p.classify("hacktool", "do", {}).level === "CONFIRM");
    check("未知动作 CONFIRM(fail closed)", p.classify("filesystem", "hackaction", { path: "/tmp/x" }).level === "CONFIRM");
    check("unknown shell 命令 CONFIRM", p.classifyShell("randomcmd123").level === "CONFIRM");
    check("system path 写 DANGEROUS", p.classify("filesystem", "write", { path: "/etc/hosts" }).level === "DANGEROUS");
    check("ssh 配置写 DANGEROUS", p.classify("filesystem", "write", { path: require("os").homedir() + "/.ssh/config" }).level === "DANGEROUS");
    check("dotfile 写 CONFIRM", p.classify("filesystem", "write", { path: require("os").homedir() + "/.bashrc" }).level === "CONFIRM");
    check("keyboard 密码输入 CONFIRM", p.classify("keyboard", "type", { text: "myPassword123" }, { goal: "输入密码登录" }).level === "CONFIRM");
    check("watch 观察 SAFE", p.classify("watch", "waitFile", { path: "/tmp/x" }).level === "SAFE");
    check("windows 观察 SAFE", p.classify("screenshot", "capture", {}).level === "SAFE");

    console.log("\n========== 5. 路径穿越/归一化 ==========");
    check("~ 展开", p.normalize("~/Desktop/x").startsWith(require("os").homedir()));
    check("相对路径解析", p.normalize("/tmp/../etc/hosts") === "/etc/hosts");

    console.log("\n========== 6. CORS 白名单（静态检查 server.js）==========");
    const fs = require("fs");
    const serverSrc = fs.readFileSync(require("path").join(__dirname, "..", "server.js"), "utf8");
    const corsLine = serverSrc.split("\n").find(l => l.includes("allowLocal"));
    check("CORS 限制本地端口", !!corsLine && /517\[3-5\]/.test(corsLine) && /localhost\|127/.test(corsLine), corsLine || "无 allowLocal 行");
    check("CORS 拒绝非白名单", /cb\(new Error\("CORS 拒绝/.test(serverSrc));

    console.log(`\n========== 审计结果: ${pass}/${pass + fail} 通过 ==========`);
    if (fail > 0) {
        console.log("\n⚠️ 发现的问题:");
        for (const f of findings) console.log(`  ❌ ${f.name} — ${f.detail}`);
        process.exit(1);
    }
    console.log("✅ 未发现发布阻塞级安全问题");
    process.exit(0);
})().catch(e => { console.error("❌ 审计异常:", e.message); process.exit(1); });
