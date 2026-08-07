// memory.js — Godan 记忆模块
// 运行时状态 (status/history) + 长期记忆 (memories: 用户偏好/项目事实)
console.log("🧠 Memory模块加载");

const fs = require("fs");
const path = require("path");
const { MEMORY_FILE } = require("../paths");

const file = MEMORY_FILE;

function read() {
    // 容错: 文件损坏/不存在时返回默认状态
    try {
        const d = JSON.parse(fs.readFileSync(file, "utf8"));
        return {
            status: "unknown",
            errors: [],
            history: [],
            memories: [],
            ...d
        };
    } catch (e) {
        return {
            status: "unknown",
            errors: [],
            history: [],
            memories: []
        };
    }
}

function write(data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function update(obj) {
    const state = read();
    const newState = { ...state, ...obj };
    write(newState);
    return newState;
}

function addHistory(item) {
    const state = read();
    state.history.push(item);
    if (state.history.length > 200) state.history = state.history.slice(-200);
    write(state);
}

/* ================= 长期记忆 ================= */

// 添加一条长期记忆（去重: 相同内容不重复添加）
function addMemory({ content, source = "user", category = "general" }) {
    const state = read();
    const text = String(content || "").trim();
    if (!text) return { ok: false, error: "记忆内容为空" };
    if (text.length > 200) return { ok: false, error: "记忆内容过长(>200字符)" };

    const exists = state.memories.some(m => m.content === text);
    if (exists) return { ok: false, error: "该记忆已存在" };

    const memory = {
        id: "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        content: text,
        source,
        category,
        createdAt: new Date().toISOString()
    };
    state.memories.push(memory);
    if (state.memories.length > 100) state.memories = state.memories.slice(-100);
    write(state);
    return { ok: true, memory };
}

function getMemories(limit = 30) {
    const state = read();
    return (state.memories || []).slice(-limit).reverse(); // 最新的在前
}

function removeMemory(id) {
    const state = read();
    const before = (state.memories || []).length;
    state.memories = (state.memories || []).filter(m => m.id !== id);
    write(state);
    return { ok: state.memories.length < before, removed: before - state.memories.length };
}

function clearMemories() {
    const state = read();
    const n = (state.memories || []).length;
    state.memories = [];
    write(state);
    return { ok: true, cleared: n };
}

// 记忆注入文本（给 LLM 的上下文）
function memoriesContext(limit = 10) {
    const mems = getMemories(limit);
    if (mems.length === 0) return "";
    return mems.map(m => `- ${m.content}`).join("\n");
}

module.exports = {
    read,
    write,
    update,
    addHistory,
    addMemory,
    getMemories,
    removeMemory,
    clearMemories,
    memoriesContext
};
