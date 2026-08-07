// usage.js — Godan P2-1: LLM 用量统计（成本追踪）
// 记录每次调用的 tokens/模型/耗时/估算成本，持久化到用户数据目录
const fs = require("fs");
const path = require("path");
const { DATA_ROOT } = require("./paths");

console.log("📊 Usage模块加载");

// 模型单价（每百万 tokens 美元，粗略估算）
const MODEL_PRICES = {
    "deepseek-chat": { input: 0.27, output: 1.10 },
    "deepseek-reasoner": { input: 0.55, output: 2.19 },
    "gpt-4o-mini": { input: 0.15, output: 0.60 },
    "gpt-4o": { input: 2.50, output: 10.00 },
    "qwen3:4b": { input: 0, output: 0 }
};

const DEFAULT_PRICE = { input: 1.0, output: 2.0 };

const USAGE_FILE = path.join(DATA_ROOT, "usage.json");

let sessions = []; // 完整历史（从文件加载）
let total = null;  // 累计统计

function loadFile() {
    try {
        if (fs.existsSync(USAGE_FILE)) {
            const d = JSON.parse(fs.readFileSync(USAGE_FILE, "utf8"));
            total = d.total || { calls: 0, tokens: 0, cost: 0, costUsd: 0 };
            sessions = Array.isArray(d.history) ? d.history : [];
        } else {
            total = { calls: 0, tokens: 0, cost: 0, costUsd: 0 };
            sessions = [];
        }
    } catch (e) {
        total = { calls: 0, tokens: 0, cost: 0, costUsd: 0 };
        sessions = [];
    }
}
loadFile();

function saveFile() {
    try {
        fs.writeFileSync(USAGE_FILE, JSON.stringify({ total, history: sessions.slice(-500), updatedAt: new Date().toISOString() }, null, 2), "utf8");
    } catch (e) {
        console.log("⚠️ 用量保存失败:", e.message);
    }
}

function getPrice(model) {
    return MODEL_PRICES[model] || DEFAULT_PRICE;
}

// 估算成本（美元）—— tokens 来自 API 返回的 usage 字段
function estimateCost(model, promptTokens, completionTokens) {
    const p = getPrice(model);
    return (promptTokens * p.input + completionTokens * p.output) / 1e6;
}

/**
 * 记录一次调用
 * @param {object} opts {model, promptTokens, completionTokens, durationMs, caller, ok}
 */
function record({ model = "unknown", promptTokens = 0, completionTokens = 0, durationMs = 0, caller = "", ok = true }) {
    const costUsd = estimateCost(model, promptTokens, completionTokens);

    // 历史记录（持久化保留最近 500 条）
    sessions.push({
        time: new Date().toISOString(),
        model,
        promptTokens,
        completionTokens,
        costUsd: Math.round(costUsd * 1e6) / 1e6,
        durationMs: Math.round(durationMs),
        caller,
        ok
    });
    if (sessions.length > 500) sessions.shift();

    // 累计
    total.calls += 1;
    total.tokens += promptTokens + completionTokens;
    total.costUsd = Math.round((total.costUsd + costUsd) * 1e6) / 1e6;

    saveFile();
    return { costUsd };
}

// 今日统计
function todayStats() {
    const today = new Date().toDateString();
    const todaySessions = sessions.filter(s => {
        try { return new Date(s.time).toDateString() === today; }
        catch (e) { return false; }
    });
    const calls = todaySessions.length;
    const tokens = todaySessions.reduce((a, s) => a + s.promptTokens + s.completionTokens, 0);
    const costUsd = todaySessions.reduce((a, s) => a + s.costUsd, 0);
    return {
        calls,
        tokens,
        costUsd: Math.round(costUsd * 1e6) / 1e6
    };
}

// 汇总视图（API 用）
function summary() {
    return {
        total: total || { calls: 0, tokens: 0, costUsd: 0 },
        today: todayStats(),
        recent: sessions.slice(-10).map(s => ({
            time: s.time,
            model: s.model,
            tokens: s.promptTokens + s.completionTokens,
            costUsd: s.costUsd,
            durationMs: s.durationMs,
            caller: s.caller,
            ok: s.ok
        }))
    };
}

module.exports = { record, summary, todayStats };
