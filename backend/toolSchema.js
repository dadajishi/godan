// toolSchema.js — P4-1 M1/M3: 工具参数 Schema（集中注册 + 调用前验证）
// ============================================================
// 目标: 参数错误在 tools.run 执行前被发现（不浪费一次工具调用 + 一次 LLM 决策）。
// 结构（每个 tool.action）:
//   required:     [k1, k2]                必须全部存在且非空
//   groups:       [{anyOf: [a,b], label}] 每组至少一个存在（别名组，如 path/file/target）
//   atLeastOne:   [[a, b]]                至少一个存在（互斥语义，如 equals/contains）
//   shape:        {k: {keys: [x,y], numKeys: [x], example}}  对象结构校验
//   numeric:      [k]                     参数值必须是数字
//   optional:     [k1, k2]                可选参数（展示给 LLM 用）
//
// 返回 paramError: {success:false, paramError:true, missing:[], allowed:[], error: 说明}
// 原则:
//   - 无 schema 的 action 不验证（向后兼容，绝不因 schema 系统破坏现有工具）
//   - 只拦截"缺失必需参数/结构错误"，不拦截多余参数（LLM 传错参数名由工具自行报错）
//   - 验证在权限判定之前（参数错误不消耗权限判定；DANGEROUS 判定仍由 tools.run 保证）
// ============================================================

const SCHEMAS = {
    filesystem: {
        list: { groups: [{ anyOf: ["path", "target"], label: "目录路径" }], optional: [] },
        read: { groups: [{ anyOf: ["path", "file", "target"], label: "文件路径" }], optional: [] },
        write: { groups: [{ anyOf: ["path", "file", "target"], label: "文件路径" }], optional: ["content"] },
        search: { required: ["keyword"], optional: ["path", "query", "name"] },
        mkdir: { groups: [{ anyOf: ["path", "target"], label: "目录路径" }], optional: [] },
        move: {
            groups: [
                { anyOf: ["src", "path", "target"], label: "源路径" },
                { anyOf: ["dest", "to"], label: "目标路径" }
            ],
            optional: []
        },
        copy: {
            groups: [
                { anyOf: ["src", "path", "target"], label: "源路径" },
                { anyOf: ["dest", "to"], label: "目标路径" }
            ],
            optional: []
        },
        rename: {
            groups: [
                { anyOf: ["src", "path", "target"], label: "源路径" },
                { anyOf: ["dest", "to", "newName"], label: "新名称" }
            ],
            optional: []
        },
        delete: { groups: [{ anyOf: ["path", "file", "target"], label: "目标路径" }], optional: ["recursive"] }
    },
    shell: {
        exec: { required: ["command"], optional: ["cwd", "timeout", "dir"] }
    },
    applications: {
        open: { groups: [{ anyOf: ["name", "app", "target"], label: "应用名" }], optional: ["file", "openFile"] },
        isRunning: { groups: [{ anyOf: ["name", "app", "target"], label: "应用名" }], optional: [] },
        close: { groups: [{ anyOf: ["name", "app", "target"], label: "应用名" }], optional: [] },
        restart: { groups: [{ anyOf: ["name", "app", "target"], label: "应用名" }], optional: ["file"] }
    },
    process: {
        start: { required: ["command"], optional: ["name", "cwd", "cmd"] },
        stop: { groups: [{ anyOf: ["pid", "name"], label: "pid 或 name" }], optional: [] },
        status: { groups: [{ anyOf: ["pid", "name"], label: "pid 或 name" }], optional: [] },
        list: { optional: [] },
        readLog: { groups: [{ anyOf: ["pid", "name"], label: "pid 或 name" }], optional: [] }
    },
    screenshot: {
        capture: { optional: ["bounds", "path", "name", "region"], shape: { bounds: { keys: ["x", "y", "w", "h"], numKeys: ["x", "y", "w", "h"], example: "{x:0, y:0, w:100, h:100}" } } },
        list: { optional: [] },
        analyze: { optional: ["focus", "bounds", "path", "file"], shape: { bounds: { keys: ["x", "y", "w", "h"], numKeys: ["x", "y", "w", "h"], example: "{x:0, y:0, w:100, h:100}" } } }
    },
    keyboard: {
        type: { groups: [{ anyOf: ["text", "content"], label: "要输入的文字" }], optional: [] },
        hotkey: { groups: [{ anyOf: ["keys", "key", "combo"], label: "快捷键" }], optional: [] },
        press: { groups: [{ anyOf: ["key", "keys"], label: "按键名" }], optional: [] }
    },
    mouse: {
        move: { required: ["x", "y"], numeric: ["x", "y"], optional: [] },
        click: { required: ["x", "y"], numeric: ["x", "y"], optional: ["button"] },
        doubleClick: { required: ["x", "y"], numeric: ["x", "y"], optional: [] },
        drag: {
            groups: [{ anyOf: ["from"], label: "起点坐标 {x,y}" }, { anyOf: ["to"], label: "终点坐标 {x,y}" }],
            shape: { from: { keys: ["x", "y"], numKeys: ["x", "y"], example: "{x: 100, y: 200}" }, to: { keys: ["x", "y"], numKeys: ["x", "y"], example: "{x: 300, y: 400}" } },
            optional: []
        },
        scroll: { optional: ["amount", "direction"] }
    },
    window: {
        list: { optional: [] },
        focus: { groups: [{ anyOf: ["name", "app", "target"], label: "应用名" }], optional: [] },
        getBounds: { groups: [{ anyOf: ["name", "app", "target"], label: "应用名" }], optional: [] }
    },
    ui: {
        getTree: { groups: [{ anyOf: ["app", "name"], label: "应用名" }], optional: ["max"] },
        findElement: {
            required: [],
            groups: [{ anyOf: ["app"], label: "应用名" }],
            optional: ["label", "keyword", "role", "index"]
        },
        readValue: { groups: [{ anyOf: ["app"], label: "应用名" }], optional: ["label"] }
    },
    watch: {
        waitFile: { groups: [{ anyOf: ["path", "file"], label: "文件路径" }], optional: ["timeout", "pollInterval", "exists", "notExists", "size"] },
        waitProcess: { groups: [{ anyOf: ["pid", "name"], label: "pid 或 name" }], numeric: ["pid"], optional: ["timeout", "pollInterval", "running", "exited"] },
        waitApp: { groups: [{ anyOf: ["name", "app"], label: "应用名" }], optional: ["timeout", "pollInterval", "running"] },
        waitLog: {
            required: ["contains"],
            groups: [{ anyOf: ["pid", "name"], label: "pid 或 name" }],
            optional: ["timeout", "pollInterval", "match"]
        },
        waitValue: {
            groups: [{ anyOf: ["app"], label: "应用名" }],
            atLeastOne: [["equals", "contains"]],
            optional: ["label", "equals", "contains", "timeout", "pollInterval"]
        },
        waitTree: { groups: [{ anyOf: ["app"], label: "应用名" }], optional: ["role", "label", "exists", "timeout", "pollInterval"] }
    }
};

// 单值有效性（undefined/null/空字符串视为缺失）
function hasValue(v) {
    return v !== undefined && v !== null && !(typeof v === "string" && !v.trim());
}

/**
 * 验证参数（执行前调用）
 * @returns null（通过）或 {missing, invalid, allowed, message}
 */
function validate(toolName, action, params = {}) {
    const schema = SCHEMAS[toolName] && SCHEMAS[toolName][action];
    if (!schema) return null; // 无 schema → 不验证（兼容）

    const missing = [];
    for (const k of schema.required || []) {
        if (!hasValue(params[k])) missing.push(k);
    }
    for (const g of schema.groups || []) {
        if (!g.anyOf.some(k => hasValue(params[k]))) {
            missing.push(`${g.anyOf.join("/")}${g.label ? `（${g.label}）` : ""}`);
        }
    }
    // M3: 至少一个（互斥语义，如 equals/contains）
    for (const group of schema.atLeastOne || []) {
        if (!group.some(k => hasValue(params[k]))) {
            missing.push(`${group.join("/")} 至少需要其中一个`);
        }
    }

    // M3: 结构 / 类型校验（shape + numeric）
    const invalid = [];
    for (const [k, spec] of Object.entries(schema.shape || {})) {
        if (!hasValue(params[k])) continue; // 缺失由 required/groups 管
        const v = params[k];
        if (typeof v !== "object" || Array.isArray(v)) {
            invalid.push(`${k} 必须是对象，形如 ${spec.example || `{${(spec.keys || []).join(", ")}}`}`);
            continue;
        }
        for (const key of spec.keys || []) {
            if (!hasValue(v[key])) invalid.push(`${k}.${key} 缺失（${k} 应为 ${spec.example || `{${spec.keys.join(", ")}}`}）`);
        }
        for (const nk of spec.numKeys || []) {
            if (hasValue(v[nk]) && typeof v[nk] !== "number") {
                invalid.push(`${k}.${nk} 必须是数字（当前: ${JSON.stringify(v[nk])}）`);
            }
        }
    }
    for (const k of schema.numeric || []) {
        if (hasValue(params[k]) && typeof params[k] !== "number") {
            invalid.push(`${k} 必须是数字（当前: ${JSON.stringify(params[k])}）`);
        }
    }

    if (missing.length === 0 && invalid.length === 0) return null;

    const allowed = [...new Set([
        ...(schema.required || []),
        ...(schema.optional || []),
        ...(schema.groups || []).flatMap(g => g.anyOf),
        ...(schema.atLeastOne || []).flat(),
        ...Object.keys(schema.shape || {})
    ])];
    const problems = [...missing.map(m => `缺少: ${m}`), ...invalid];
    return {
        missing,
        invalid,
        allowed,
        message: `参数错误: ${problems.join("; ")}（可用参数: ${allowed.join(", ")}）`
    };
}

// 给 LLM 的 schema 信息（toolSpec 用）
function schemaInfo(toolName, action) {
    const schema = SCHEMAS[toolName] && SCHEMAS[toolName][action];
    if (!schema) return { required: [], optional: [] };
    const required = [
        ...(schema.required || []),
        ...(schema.groups || []).map(g => `(${g.anyOf.join("|")})`)
    ];
    return { required, optional: schema.optional || [] };
}

module.exports = { validate, schemaInfo, SCHEMAS };
