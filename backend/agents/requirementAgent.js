console.log("📋 RequirementAgent加载");

class RequirementAgent {
    async analyze(task = "") {

        console.log("📋 Requirement分析:", task);

        const text = task.toLowerCase();

        const result = {
            frontend: false,
            backend: false,
            database: false,
            auth: false,
            api: false,
            websocket: false,
            payment: false,
            cloud: false,
            crud: false,
            complexity: "low",
            estimateFiles: 3,
            suggestions: []
        };

        // 前端
        if (
            text.includes("网页") ||
            text.includes("页面") ||
            text.includes("web") ||
            text.includes("html") ||
            text.includes("react") ||
            text.includes("vue") ||
            text.includes("app")
        ) {
            result.frontend = true;
        }

        // 后端
        if (
            text.includes("登录") ||
            text.includes("接口") ||
            text.includes("api") ||
            text.includes("node") ||
            text.includes("express")
        ) {
            result.backend = true;
            result.api = true;
        }

        // 数据库
        if (
            text.includes("数据库") ||
            text.includes("sqlite") ||
            text.includes("mysql") ||
            text.includes("postgres") ||
            text.includes("数据持久化")
        ) {
            result.database = true;
        }

        // 登录
        if (
            text.includes("登录") ||
            text.includes("注册") ||
            text.includes("jwt") ||
            text.includes("用户")
        ) {
            result.auth = true;
        }

        // CRUD
        if (
            text.includes("增删改") ||
            text.includes("crud")
        ) {
            result.crud = true;
        }

        // websocket
        if (
            text.includes("聊天") ||
            text.includes("即时通信") ||
            text.includes("websocket")
        ) {
            result.websocket = true;
        }

        // 支付
        if (
            text.includes("支付") ||
            text.includes("支付宝") ||
            text.includes("微信支付") ||
            text.includes("stripe")
        ) {
            result.payment = true;
        }

        // 云同步
        if (
            text.includes("云") ||
            text.includes("supabase") ||
            text.includes("firebase")
        ) {
            result.cloud = true;
        }

        let score = 0;

        Object.keys(result).forEach(key => {
            if (result[key] === true) score++;
        });

        if (score <= 2) {
            result.complexity = "low";
            result.estimateFiles = 3;
        } else if (score <= 5) {
            result.complexity = "medium";
            result.estimateFiles = 10;
        } else {
            result.complexity = "high";
            result.estimateFiles = 25;
        }

        if (result.backend && !result.database) {
            result.suggestions.push("建议增加数据库");
        }

        if (result.auth && !result.backend) {
            result.suggestions.push("登录需要后端支持");
        }

        console.log("📋 Requirement结果:", result);

        return result;
    }
}

module.exports = new RequirementAgent();