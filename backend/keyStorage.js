// keyStorage.js — Godan v2 Lite D2: API Key 安全存储
// 策略: 优先 macOS Keychain (security 命令)，失败降级为 AES-256-GCM 加密文件 (0600 权限)
// 原则: GET 接口永不回传 key 明文，仅返回脱敏信息 (hasKey/baseUrl/model/keyHint)
const { execFile } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const SERVICE = "com.godan.ai";
const ACCOUNT = "godan-user";
const FALLBACK_DIR = path.join(os.homedir(), ".godan");
const FALLBACK_FILE = path.join(FALLBACK_DIR, "settings.enc");

// ============ 工具 ============

// 派生 AES 密钥（本机绑定：hostname + 用户名 + 固定盐）
function deriveKey() {
    const material = `${os.hostname()}:${os.userInfo().username}:godan-v2-lite`;
    return crypto.scryptSync(material, "godan-salt-v1", 32);
}

// AES-256-GCM 加密 → "iv:authTag:data" (base64)
function encrypt(plainText) {
    const key = deriveKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const enc = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
}

// 解密（任何一步失败即返回 null，不抛异常给上层）
function decrypt(payload) {
    try {
        const [ivB64, tagB64, dataB64] = payload.split(":");
        if (!ivB64 || !tagB64 || !dataB64) return null;
        const key = deriveKey();
        const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
        decipher.setAuthTag(Buffer.from(tagB64, "base64"));
        const dec = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]);
        return dec.toString("utf8");
    } catch (e) {
        return null;
    }
}

// ============ Keychain 封装（execFile 参数数组，无 shell 注入）============

function keychainAdd(jsonStr) {
    return new Promise((resolve, reject) => {
        execFile("security", ["add-generic-password", "-U", "-s", SERVICE, "-a", ACCOUNT, "-w", jsonStr],
            (err) => err ? reject(err) : resolve());
    });
}

function keychainFind() {
    return new Promise((resolve, reject) => {
        execFile("security", ["find-generic-password", "-s", SERVICE, "-a", ACCOUNT, "-w"],
            { maxBuffer: 1024 * 1024 },
            (err, stdout) => err ? reject(err) : resolve(stdout.trim()));
    });
}

function keychainDelete() {
    return new Promise((resolve, reject) => {
        execFile("security", ["delete-generic-password", "-s", SERVICE, "-a", ACCOUNT],
            (err) => err ? reject(err) : resolve());
    });
}

// ============ 公开 API ============

// 保存设置 {apiKey, baseUrl, model} — Keychain 优先，失败降级加密文件
async function save(settings) {
    const json = JSON.stringify({
        apiKey: String(settings.apiKey || ""),
        baseUrl: String(settings.baseUrl || ""),
        model: String(settings.model || "deepseek-chat"),
        savedAt: new Date().toISOString()
    });
    try {
        await keychainAdd(json);
        return { method: "keychain" };
    } catch (e) {
        // 降级: 加密文件
        fs.mkdirSync(FALLBACK_DIR, { recursive: true, mode: 0o700 });
        fs.writeFileSync(FALLBACK_FILE, encrypt(json), { mode: 0o600 });
        return { method: "file" };
    }
}

// 读取完整设置（含明文 key，仅供后端内部调用，绝不进响应）
async function get() {
    let json = null;
    try {
        json = await keychainFind();
    } catch (e) {
        // Keychain 无条目，尝试降级文件
    }
    if (!json && fs.existsSync(FALLBACK_FILE)) {
        json = decrypt(fs.readFileSync(FALLBACK_FILE, "utf8"));
    }
    if (!json) return null;
    try {
        const obj = JSON.parse(json);
        return {
            apiKey: obj.apiKey || "",
            baseUrl: obj.baseUrl || "",
            model: obj.model || "deepseek-chat"
        };
    } catch (e) {
        return null;
    }
}

// 脱敏信息（用于 API 响应，永不包含明文 key）
async function getPublic() {
    const s = await get();
    if (!s || !s.apiKey) {
        return { hasKey: false, baseUrl: "", model: "deepseek-chat", keyHint: "" };
    }
    const k = s.apiKey;
    const keyHint = k.length > 8 ? `${k.slice(0, 4)}****${k.slice(-4)}` : "****";
    return { hasKey: true, baseUrl: s.baseUrl, model: s.model, keyHint };
}

// 清除设置
async function remove() {
    let removed = false;
    try {
        await keychainDelete();
        removed = true;
    } catch (e) {
        // Keychain 无条目
    }
    if (fs.existsSync(FALLBACK_FILE)) {
        fs.unlinkSync(FALLBACK_FILE);
        removed = true;
    }
    return removed;
}

module.exports = { save, get, getPublic, remove };
