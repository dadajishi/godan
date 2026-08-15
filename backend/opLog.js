// opLog.js — 电脑操作日志（JSONL 追加写）
// 记录每次工具调用的：时间/工具/动作/参数(截断)/权限等级/结果
// 文件位置: DATA_ROOT/oplog.jsonl（开发: 项目根；打包: userData）
const fs = require("fs");
const path = require("path");
const { DATA_ROOT } = require("./paths");

const LOG_FILE = path.join(DATA_ROOT, "oplog.jsonl");

function append(entry) {
    try {
        const line = JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n";
        fs.appendFileSync(LOG_FILE, line, "utf8");
    } catch (e) {
        console.log("⚠️ 操作日志写入失败:", e.message);
    }
}

// 截断长字符串/数组，防止日志爆炸
function truncate(obj, maxLen = 300) {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === "string") return obj.length > maxLen ? obj.slice(0, maxLen) + "…" : obj;
    if (Array.isArray(obj)) return obj.slice(0, 20).map(x => truncate(x, maxLen));
    if (typeof obj === "object") {
        const out = {};
        for (const [k, v] of Object.entries(obj)) out[k] = truncate(v, maxLen);
        return out;
    }
    return obj;
}

// 记录一次工具调用
// P3-6: 审计字段 — taskId/opId/decision/reason/rule/resource（权限解释），params 已由调用方 redact
function logToolCall({ tool, action, params, level, taskId, opId, decision, reason, rule, resource, result }) {
    append({
        type: "tool_call",
        tool,
        action,
        params: truncate(params),
        level: level || "SAFE",
        taskId: taskId || null,
        opId: opId || null,
        decision: decision || level || "SAFE",
        reason: reason ? truncate(reason, 200) : null,
        rule: rule || null,
        resource: resource ? truncate(resource, 150) : null,
        result: truncate({
            success: !!result.success,
            exitCode: result.exitCode ?? null,
            error: result.error || null,
            blocked: result.blocked || false,
            needConfirm: result.needConfirm || false
        })
    });
}

// 记录 agent 会话开始/结束
function logSession({ type, task, summary }) {
    append({ type, task: truncate(task, 200), summary: summary ? truncate(summary, 300) : undefined });
}

// 读取最近 N 条日志（倒序）
function recent(limit = 50) {
    try {
        if (!fs.existsSync(LOG_FILE)) return [];
        const lines = fs.readFileSync(LOG_FILE, "utf8").split("\n").filter(Boolean);
        return lines.slice(-limit).map(l => {
            try { return JSON.parse(l); } catch (e) { return { raw: l }; }
        }).reverse();
    } catch (e) {
        return [];
    }
}

module.exports = { logToolCall, logSession, recent, LOG_FILE };
