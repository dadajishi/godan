// llm.js — Godan v2 Lite D3: 模型抽象层
// 统一 OpenAI 兼容协议调用，支持任意端点 (DeepSeek / OpenAI / 本地 Ollama /v1 等)
// 配置优先级: 用户设置 (keyStorage) > .env 的 DEEPSEEK_API_KEY
// 特性: JSON 提取（深度计数法，正确处理嵌套）、自动重试、错误归一化
const axios = require("axios");
const keyStorage = require("./keyStorage");

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-chat";
const REQUEST_TIMEOUT = 120000;

// ============ 配置解析 ============

async function getConfig() {
    // 优先用户设置（BYOK）
    try {
        const user = await keyStorage.get();
        if (user && user.apiKey) {
            return {
                apiKey: user.apiKey,
                baseUrl: (user.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, ""),
                model: user.model || DEFAULT_MODEL
            };
        }
    } catch (e) {
        console.log("⚠️ 读取用户设置失败，回退 .env:", e.message);
    }
    // 降级 .env
    return {
        apiKey: process.env.DEEPSEEK_API_KEY || "",
        baseUrl: DEFAULT_BASE_URL,
        model: DEFAULT_MODEL
    };
}

// ============ JSON 提取（深度计数，正确处理字符串与嵌套）============

function extractJson(text) {
    if (typeof text !== "string") return null;
    // 删除 think 块
    text = text.replace(/<think>[\s\S]*?<\/think>/gi, "");
    // 删除 markdown 围栏 / BOM
    text = text.replace(/```[a-z]*/gi, "").replace(/```/g, "").replace(/^\uFEFF/, "").trim();
    const start = text.indexOf("{");
    if (start === -1) return null;
    let depth = 0, inString = false, escape = false;
    for (let i = start; i < text.length; i++) {
        const ch = text[i];
        if (inString) {
            if (escape) escape = false;
            else if (ch === "\\") escape = true;
            else if (ch === '"') inString = false;
            continue;
        }
        if (ch === '"') inString = true;
        else if (ch === "{") depth++;
        else if (ch === "}") {
            depth--;
            if (depth === 0) {
                try {
                    return JSON.parse(text.substring(start, i + 1));
                } catch (e) {
                    return null;
                }
            }
        }
    }
    return null;
}

// ============ 核心 chat ============

/**
 * 统一 LLM 调用
 * @param {object} opts
 *   system: 系统提示词
 *   user:   用户内容
 *   temperature: 采样温度 (默认 0.7)
 *   maxTokens:   输出上限 (默认 4000)
 *   json:   为 true 时返回解析后的对象（解析失败返回 null）
 *   retries: 失败重试次数 (默认 1)
 * @returns {Promise<string|object|null>}
 */
async function chat({ system, user, temperature = 0.7, maxTokens = 4000, json = false, retries = 1 }) {
    const cfg = await getConfig();
    if (!cfg.apiKey) {
        throw new Error("未配置 API Key：请在设置页填写，或在 .env 设置 DEEPSEEK_API_KEY");
    }
    if (!user) {
        throw new Error("user 内容不能为空");
    }

    const url = cfg.baseUrl + "/chat/completions";
    const messages = [];
    if (system) messages.push({ role: "system", content: system });
    messages.push({ role: "user", content: user });

    let lastErr = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const response = await axios.post(url, {
                model: cfg.model,
                messages,
                temperature,
                max_tokens: maxTokens,
                stream: false
            }, {
                headers: {
                    Authorization: `Bearer ${cfg.apiKey}`,
                    "Content-Type": "application/json"
                },
                timeout: REQUEST_TIMEOUT
            });

            const content = (response.data.choices && response.data.choices[0] &&
                response.data.choices[0].message) ? response.data.choices[0].message.content : "";

            if (json) {
                const parsed = extractJson(content);
                if (parsed === null && attempt < retries) {
                    lastErr = new Error("JSON 解析失败");
                    console.log(`⚠️ LLM 返回非 JSON (尝试 ${attempt + 1}/${retries + 1})`);
                    continue;
                }
                return parsed;
            }
            return content;
        } catch (err) {
            lastErr = err;
            console.log(`⚠️ LLM 调用失败 (尝试 ${attempt + 1}/${retries + 1}): ${err.message}`);
            if (attempt < retries) {
                await new Promise(r => setTimeout(r, 800)); // 重试前短暂等待
            }
        }
    }
    throw lastErr || new Error("LLM 调用失败");
}

module.exports = { chat, extractJson, getConfig };
