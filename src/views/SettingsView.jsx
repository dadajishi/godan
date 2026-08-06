import { useEffect, useState } from "react";

const API_BASE = window.godan?.apiBase || import.meta.env.VITE_API_BASE || "http://127.0.0.1:3001";

// 预设模型选项（baseUrl + model 组合）
const MODEL_PRESETS = [
  { label: "DeepSeek (deepseek-chat)", baseUrl: "https://api.deepseek.com", model: "deepseek-chat" },
  { label: "DeepSeek 推理 (deepseek-reasoner)", baseUrl: "https://api.deepseek.com", model: "deepseek-reasoner" },
  { label: "OpenAI (gpt-4o-mini)", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  { label: "OpenAI (gpt-4o)", baseUrl: "https://api.openai.com/v1", model: "gpt-4o" },
  { label: "本地 Ollama (qwen3:4b)", baseUrl: "http://localhost:11434/v1", model: "qwen3:4b" },
];

export default function SettingsView() {
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://api.deepseek.com");
  const [model, setModel] = useState("deepseek-chat");
  const [customBaseUrl, setCustomBaseUrl] = useState(false);
  const [hasSaved, setHasSaved] = useState(false);
  const [keyHint, setKeyHint] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null); // {type: "ok"|"err", text}

  // 载入已保存设置
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/settings`);
        const data = await res.json();
        if (data.success) {
          setHasSaved(data.hasKey);
          setKeyHint(data.keyHint || "");
          if (data.baseUrl) setBaseUrl(data.baseUrl);
          if (data.model) setModel(data.model);
        }
      } catch (e) {
        setStatus({ type: "err", text: "无法连接后端，请确认 backend 已启动" });
      }
    })();
  }, []);

  async function testConnection() {
    if (!apiKey.trim()) {
      setStatus({ type: "err", text: "请先输入 API Key" });
      return;
    }
    setLoading(true);
    setStatus({ type: "ok", text: "测试中…" });
    try {
      const res = await fetch(`${API_BASE}/api/settings/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, baseUrl, model })
      });
      const data = await res.json();
      if (data.success) {
        setStatus({ type: "ok", text: `✅ 连接成功：${data.reply}` });
      } else {
        setStatus({ type: "err", text: `❌ 连接失败：${data.error}` });
      }
    } catch (e) {
      setStatus({ type: "err", text: "❌ 请求失败，请确认后端已启动" });
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings() {
    if (!apiKey.trim()) {
      setStatus({ type: "err", text: "API Key 不能为空" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, baseUrl, model })
      });
      const data = await res.json();
      if (data.success) {
        setHasSaved(true);
        setKeyHint(data.keyHint || "");
        setApiKey(""); // 保存后清空输入框（key 已加密存储）
        setStatus({ type: "ok", text: `✅ 已保存（${data.storage === "keychain" ? "钥匙串" : "加密文件"}）` });
      } else {
        setStatus({ type: "err", text: `❌ 保存失败：${data.error}` });
      }
    } catch (e) {
      setStatus({ type: "err", text: "❌ 保存失败，请确认后端已启动" });
    } finally {
      setLoading(false);
    }
  }

  async function clearSettings() {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/settings`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setHasSaved(false);
        setKeyHint("");
        setStatus({ type: "ok", text: "已清除 API Key" });
      }
    } catch (e) {
      setStatus({ type: "err", text: "❌ 清除失败" });
    } finally {
      setLoading(false);
    }
  }

  function applyPreset(e) {
    const preset = MODEL_PRESETS.find((p) => p.label === e.target.value);
    if (preset) {
      setBaseUrl(preset.baseUrl);
      setModel(preset.model);
      setCustomBaseUrl(false);
    }
  }

  // 当前是否命中某个预设（用于下拉回显）
  const activePreset = MODEL_PRESETS.find(
    (p) => p.baseUrl === baseUrl && p.model === model
  );

  const inputStyle = {
    width: "100%",
    padding: "11px 14px",
    borderRadius: "12px",
    border: "1px solid #ffffff18",
    background: "#0a0e18",
    color: "#f2f4ff",
    fontSize: "14px",
    outline: "none",
  };
  const labelStyle = { display: "block", margin: "0 0 6px", color: "#929bb2", fontSize: "12px", fontWeight: 700 };
  const fieldStyle = { marginBottom: "20px" };

  return (
    <>
      <header>
        <div>
          <small>GODAN SETTINGS</small>
          <h1>设置</h1>
        </div>
        <span className={`live ${hasSaved ? "" : "offline"}`}>
          {hasSaved ? "● 已配置" : "● 未配置"}
        </span>
      </header>

      <div className="chat" style={{ maxWidth: "720px", margin: "0 auto" }}>
        <div className="session"><i /> API 配置 <i /></div>

        <div className="glass" style={{ padding: "24px", borderRadius: "18px" }}>
          {/* API Key */}
          <div style={fieldStyle}>
            <label style={labelStyle}>API Key {hasSaved && <span style={{ color: "#47d9a8", marginLeft: "8px" }}>已保存 {keyHint}</span>}</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={hasSaved ? "已配置，输入新 Key 可覆盖" : "粘贴你的 API Key（sk-…）"}
              style={inputStyle}
              autoComplete="off"
            />
            <p style={{ margin: "6px 0 0", color: "#6c7690", fontSize: "11px" }}>
              Key 仅加密存储在本机（macOS 钥匙串），不会上传任何服务器
            </p>
          </div>

          {/* 模型预设 */}
          <div style={fieldStyle}>
            <label style={labelStyle}>模型</label>
            <select
              value={activePreset ? activePreset.label : "__custom__"}
              onChange={applyPreset}
              style={inputStyle}
            >
              {MODEL_PRESETS.map((p) => (
                <option key={p.label} value={p.label}>{p.label}</option>
              ))}
              {!activePreset && <option value="__custom__">自定义（下方手动填写）</option>}
            </select>
          </div>

          {/* baseUrl + model 自定义 */}
          <div style={fieldStyle}>
            <label style={labelStyle}>API 地址 (baseUrl)</label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => { setBaseUrl(e.target.value); setCustomBaseUrl(true); }}
              placeholder="https://api.deepseek.com"
              style={inputStyle}
            />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>模型名称 (model)</label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="deepseek-chat"
              style={inputStyle}
            />
          </div>

          {/* 状态 */}
          {status && (
            <p style={{
              padding: "10px 14px",
              borderRadius: "10px",
              margin: "0 0 16px",
              fontSize: "13px",
              background: status.type === "ok" ? "#47d9aa18" : "#ff718822",
              color: status.type === "ok" ? "#a8e6ce" : "#ffc2ca",
              border: `1px solid ${status.type === "ok" ? "#47d9aa33" : "#ff718866"}`,
            }}>
              {status.text}
            </p>
          )}

          {/* 操作按钮 */}
          <div style={{ display: "flex", gap: "10px" }}>
            <button
              onClick={testConnection}
              disabled={loading}
              style={{
                flex: 1,
                padding: "12px",
                borderRadius: "12px",
                border: "1px solid #8980ff66",
                background: "transparent",
                color: "#c9c3ff",
                fontSize: "14px",
                cursor: "pointer",
              }}
            >
              {loading ? "测试中…" : "测试连接"}
            </button>
            <button
              onClick={saveSettings}
              disabled={loading}
              style={{
                flex: 1,
                padding: "12px",
                borderRadius: "12px",
                border: "0",
                background: "linear-gradient(135deg,#8178ff,#49cac6)",
                color: "#071019",
                fontSize: "14px",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              保存
            </button>
            {hasSaved && (
              <button
                onClick={clearSettings}
                disabled={loading}
                style={{
                  padding: "12px 16px",
                  borderRadius: "12px",
                  border: "1px solid #ff718866",
                  background: "transparent",
                  color: "#ff9fac",
                  fontSize: "14px",
                  cursor: "pointer",
                }}
              >
                清除
              </button>
            )}
          </div>
        </div>

        <div className="session" style={{ marginTop: "30px" }}><i /> 说明 <i /></div>
        <div className="message">
          <div className="avatar">ℹ️</div>
          <div>
            <small>狗蛋</small>
            <pre>1. 去 DeepSeek / OpenAI 官网创建 API Key
2. 粘贴到上方输入框，点「测试连接」验证
3. 点「保存」，Key 将加密存储在本机
4. 保存后即可在聊天页创建/修改应用</pre>
          </div>
        </div>
      </div>
    </>
  );
}
