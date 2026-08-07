// architect.js — Godan P1-4: 架构设计（LLM 决策 + 规则引擎降级）
// 策略: 优先用 LLM 分析任务并输出结构化架构；LLM 失败时降级为关键词规则
const llm = require("./llm");

console.log("🏛️ Architect模块加载");

// 规则引擎（降级兜底 + 基础类型识别）
function ruleBasedArchitect(task) {
    let architecture = {
        project: task,
        type: "web_app",
        stack: [],
        needsAPI: false,
        dependencies: [],
        risks: [],
        suggestions: []
    };

    const text = task.toLowerCase();

    if (text.includes("桌面") || text.includes("electron") || text.includes("客户端") || text.includes("mac应用") || text.includes("windows软件") || text.includes("桌面软件")) {
        architecture.type = "desktop_app";
        architecture.stack = ["Electron", "HTML", "CSS", "JavaScript"];
        architecture.dependencies.push("electron");
        architecture.suggestions.push("生成electron主进程和渲染进程");
    } else if (text.includes("网页") || text.includes("网站") || text.includes("web") || text.includes("应用") || text.includes("app")) {
        architecture.type = "web_app";
        architecture.stack = ["HTML", "CSS", "JavaScript"];
    }

    if (text.includes("react")) {
        architecture.type = "web_app";
        architecture.stack = ["React", "Vite", "CSS"];
    }

    if (text.includes("游戏") || text.includes("小游戏") || text.includes("模拟器") || text.includes("模拟")) {
        architecture.type = "game";
        architecture.stack.push("Canvas", "JavaScript");
    }

    if (text.includes("3d") || text.includes("三维") || text.includes("星球") || text.includes("宇宙") || text.includes("粒子")) {
        architecture.stack.push("Three.js", "WebGL");
    }

    if (text.includes("天气") || text.includes("地图") || text.includes("新闻") || text.includes("股票") || text.includes("ai") || text.includes("人工智能")) {
        architecture.needsAPI = true;
        architecture.dependencies.push("external API");
        architecture.risks.push("API Key可能缺失");
        architecture.suggestions.push("增加Mock数据模式");
    }

    if (text.includes("后台") || text.includes("服务器") || text.includes("数据库") || text.includes("登录")) {
        architecture.stack.push("Node.js", "Express");
        architecture.needsAPI = true;
    }

    return architecture;
}

// LLM 增强架构设计
async function llmArchitect(task) {
    const prompt = `
你是一个资深软件架构师。分析下面的用户需求，设计应用架构。

需求: ${task}

输出 JSON（只输出 JSON，无其他文字）:
{
  "type": "web_app | desktop_app | game | other",
  "stack": ["技术栈数组，如 HTML/CSS/JavaScript 或 React/Vite 等"],
  "needsAPI": true/false,
  "dependencies": ["需要的外部依赖"],
  "risks": ["可能的风险"],
  "suggestions": ["实现建议"]
}

要求:
1. type 必须从给定枚举中选择
2. stack 给出具体可行的技术栈（纯网页用 HTML/CSS/JavaScript，复杂 UI 用 React 等）
3. 如果需求需要外部数据/服务，needsAPI 为 true
`;

    const result = await llm.chat({
        system: "你是资深软件架构师，只输出 JSON。",
        user: prompt,
        temperature: 0.2,
        maxTokens: 800,
        json: true,
        retries: 1
    });

    if (!result || typeof result !== "object" || !result.type) {
        throw new Error("LLM 架构分析失败");
    }

    return {
        project: task,
        type: ["web_app", "desktop_app", "game", "other"].includes(result.type) ? result.type : "web_app",
        stack: Array.isArray(result.stack) ? result.stack : [],
        needsAPI: !!result.needsAPI,
        dependencies: Array.isArray(result.dependencies) ? result.dependencies : [],
        risks: Array.isArray(result.risks) ? result.risks : [],
        suggestions: Array.isArray(result.suggestions) ? result.suggestions : []
    };
}

async function architect(task) {
    console.log("🏛️ Architect分析:", task);

    // 优先 LLM（更懂需求）；失败降级规则
    try {
        const arch = await llmArchitect(task);
        console.log("🏛️ Architect结果(LLM):", arch);
        return arch;
    } catch (e) {
        console.log("⚠️ LLM架构失败，降级规则引擎:", e.message);
        const arch = ruleBasedArchitect(task);
        console.log("🏛️ Architect结果(规则):", arch);
        return arch;
    }
}

module.exports = architect;
