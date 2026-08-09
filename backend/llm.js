// llm.js — Godan v2 Lite D3: 模型抽象层
// 统一 OpenAI 兼容协议调用，支持任意端点 (DeepSeek / OpenAI / 本地 Ollama /v1 等)
// 配置优先级: 用户设置 (keyStorage) > .env 的 DEEPSEEK_API_KEY
// 特性: JSON 提取（深度计数法，正确处理嵌套）、自动重试、错误归一化
const axios = require("axios");
const keyStorage = require("./keyStorage");
const usage = require("./usage");

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-chat";
const REQUEST_TIMEOUT = 120000;

// ============ 配置解析 ============

// 视觉模型判定（名字包含视觉能力关键词）
const VISION_MODEL_RE = /(gpt-4o|gpt-4\.1|gpt-4-turbo|claude|qwen2\.5vl|qwen2-vl|llava|gemini|glm-4v|vision|minicpm)/i;
function isVisionModel(model) {
    return VISION_MODEL_RE.test(String(model || ""));
}

// 发现可用的视觉模型配置（优先级：当前配置支持视觉 > Ollama 本地视觉模型 > OPENAI_API_KEY）
async function getVisionConfig() {
    // 1. 当前配置（BYOK / .env）若本身支持视觉
    try {
        const cfg = await getConfig();
        if (cfg && cfg.apiKey && isVisionModel(cfg.model)) {
            return { baseUrl: cfg.baseUrl, model: cfg.model, apiKey: cfg.apiKey, ollamaNative: false };
        }
    } catch (e) { /* 继续探测 */ }

    // 2. Ollama 本地视觉模型（ollama list 自动发现）
    try {
        const { execFile } = require("child_process");
        const models = await new Promise((resolve) => {
            execFile("ollama", ["list"], { timeout: 10000 }, (err, stdout) => {
                if (err) return resolve([]);
                resolve(stdout.split("\n").slice(1).map(l => l.trim().split(/\s+/)[0]).filter(Boolean));
            });
        });
        const vision = models.find(m => VISION_MODEL_RE.test(m));
        if (vision) {
            return { baseUrl: "http://localhost:11434", model: vision, apiKey: "", ollamaNative: true };
        }
    } catch (e) { /* 继续 */ }

    // 3. OPENAI_API_KEY 环境变量
    if (process.env.OPENAI_API_KEY) {
        return { baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", apiKey: process.env.OPENAI_API_KEY, ollamaNative: false };
    }

    return null;
}

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
 *   apiKey/baseUrl/model: 临时覆盖配置（用于测试未保存的 key，优先级最高）
 * @returns {Promise<string|object|null>}
 */
async function chat({ system, user, temperature = 0.7, maxTokens = 4000, json = false, retries = 1, apiKey: overrideKey, baseUrl: overrideBaseUrl, model: overrideModel, images }) {
    // 临时覆盖配置（测试用）优先于已保存配置
    let cfg;
    if (overrideKey) {
        cfg = {
            apiKey: overrideKey,
            baseUrl: (overrideBaseUrl || DEFAULT_BASE_URL).replace(/\/+$/, ""),
            model: overrideModel || DEFAULT_MODEL
        };
    } else {
        cfg = await getConfig();
    }
    if (!cfg.apiKey) {
        throw new Error("未配置 API Key：请在设置页填写，或在 .env 设置 DEEPSEEK_API_KEY");
    }
    if (!user) {
        throw new Error("user 内容不能为空");
    }

    const url = cfg.baseUrl + "/chat/completions";
    const messages = [];
    if (system) messages.push({ role: "system", content: system });
    if (images && images.length) {
        // 多模态: user content 变数组，图片 base64 内联
        const imgParts = images.map(p => {
            const mime = String(p).toLowerCase().endsWith(".jpg") || String(p).toLowerCase().endsWith(".jpeg")
                ? "image/jpeg" : "image/png";
            const b64 = require("fs").readFileSync(p).toString("base64");
            return { type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } };
        });
        messages.push({ role: "user", content: [{ type: "text", text: user }, ...imgParts] });
    } else {
        messages.push({ role: "user", content: user });
    }

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

            // P2-1: 记录用量（tokens 来自 API usage 字段）
            try {
                const u = response.data.usage || {};
                usage.record({
                    model: cfg.model,
                    promptTokens: u.prompt_tokens || 0,
                    completionTokens: u.completion_tokens || 0,
                    durationMs: response.config && response.config.metadata ? 0 : 0,
                    caller: "llm.chat"
                });
            } catch (e) { /* 用量记录失败不影响主流程 */ }

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

// ============ 视觉分析（P3: 屏幕理解）============

/**
 * 视觉分析一张图片
 * @param {object} opts {imagePath, prompt, json?, temperature?}
 * @returns {Promise<string|object|null>}
 */
async function vision({ imagePath, prompt, json = false, temperature = 0.1, maxTokens = 1500 }) {
    if (!imagePath || !require("fs").existsSync(imagePath)) {
        throw new Error("图片不存在: " + imagePath);
    }
    const cfg = await getVisionConfig();
    if (!cfg) {
        throw new Error("没有可用的视觉模型。方案：① 设置页选择支持视觉的模型（OpenAI gpt-4o-mini 等）② 安装本地视觉模型: ollama pull qwen2.5vl:3b");
    }

    const b64 = require("fs").readFileSync(imagePath).toString("base64");

    // Ollama 原生多模态接口（/api/chat 支持 images 字段）
    if (cfg.ollamaNative) {
        const axios = require("axios");
        const url = (cfg.baseUrl || "http://localhost:11434").replace(/\/+$/, "") + "/api/chat";
        const r = await axios.post(url, {
            model: cfg.model,
            messages: [{ role: "user", content: prompt, images: [b64] }],
            stream: false,
            options: {
                temperature,
                // 关键: 截图 base64 会占大量 token，默认 n_ctx=4096 不够，放大到 16k
                num_ctx: 16384
            }
        }, { timeout: 180000 });
        const content = r.data && r.data.message && r.data.message.content;
        if (json) return extractJson(content);
        return content;
    }

    // OpenAI 兼容接口（content 数组内联图片）
    const result = await chat({
        system: "你是屏幕分析助手，严格按照要求输出。",
        user: prompt,
        images: [imagePath],
        temperature,
        maxTokens,
        json,
        retries: 1,
        apiKey: cfg.apiKey,
        baseUrl: cfg.baseUrl,
        model: cfg.model
    });
    return result;
}

module.exports = { chat, extractJson, getConfig, getVisionConfig, isVisionModel, vision };
