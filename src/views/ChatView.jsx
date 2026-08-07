import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { API_BASE } from "../config";

// 建议任务（点击直接填充）
const SUGGESTIONS = [
  "做一个番茄钟网页",
  "做一个待办事项应用",
  "生成一个计算器",
];

export default function ChatView() {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: "你好，我是狗蛋 Agent 🐶，告诉我你想创建或修改什么应用？"
    }
  ]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  async function sendMessage(text) {
    const content = (text ?? input).trim();
    if (!content || sending) return;

    setMessages((m) => [...m, { role: "user", content }]);
    setInput("");
    setStatus("狗蛋思考中…");
    setSending(true);

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 180000);

      const res = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: content }),
        signal: controller.signal
      });
      clearTimeout(timer);

      const data = await res.json();
      let reply = "收到 🐶";
      let previewProject = null;
      if (data.reply?.plan?.reply) {
        reply = data.reply.plan.reply;
      } else if (typeof data.reply === "string") {
        reply = data.reply;
      } else if (data.reply?.success === false) {
        reply = `❌ ${data.reply.error || "任务失败"}`;
      } else {
        reply = JSON.stringify(data.reply, null, 2);
      }

      // D7: 任务成功且有项目产物 → 提供预览入口
      const projName = data.reply?.result?.project;
      if (data.reply?.success === true && projName) {
        previewProject = projName;
        reply = `${reply}\n\n✅ 项目「${projName}」已生成，点击下方按钮预览 →`;
      }

      setMessages((m) => [...m, { role: "assistant", content: reply, previewProject }]);
    } catch (err) {
      const msg = err.name === "AbortError"
        ? "⏱️ 请求超时（超过 180 秒），请确认后端已启动且 API Key 有效"
        : "连接狗蛋后端失败，请确认 backend 已启动 🐶";
      setMessages((m) => [...m, { role: "assistant", content: msg, error: true }]);
      console.error(err);
    } finally {
      setStatus("");
      setSending(false);
    }
  }

  return (
    <>
      <header>
        <div>
          <small>GODAN WORKSPACE</small>
          <h1>AI 应用工坊</h1>
        </div>
        <span className={`live ${sending ? "working" : ""}`}>
          {sending ? "● 生成中" : "● 就绪"}
        </span>
      </header>

      <div className="chat">
        <div className="session">
          <i /> 当前会话 <i />
        </div>

        {messages.map((msg, i) => (
          <div key={i} className={`message ${msg.role} ${msg.error ? "error" : ""} msg-anim`} style={{ animationDelay: `${Math.min(i * 70, 400)}ms` }}>
            <div className={`avatar ${msg.role === "user" ? "" : "dog-avatar"}`}>{msg.role === "user" ? "🧑" : "🐶"}</div>
            <div>
              <small>{msg.role === "user" ? "你" : "狗蛋"}</small>
              <pre>{msg.content}</pre>
              {msg.previewProject && (
                <button
                  onClick={() => navigate(`/preview/${encodeURIComponent(msg.previewProject)}`)}
                  className="preview-btn"
                >
                  👁️ 查看预览
                </button>
              )}
            </div>
          </div>
        ))}

        {status && (
          <div className="message thinking msg-anim">
            <div className="avatar dog-avatar">🐶</div>
            <div>
              <small>狗蛋</small>
              <pre className="thinking-line">
                <span className="typing-dots"><i /><i /><i /></span>
                {status.replace("…", "")}
              </pre>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <footer>
        {!sending && (
          <div className="suggestions">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => sendMessage(s)}>{s}</button>
            ))}
          </div>
        )}
        <div className="composer">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="描述你想创建或修改的应用…"
            rows={1}
            disabled={sending}
          />
          <button onClick={() => sendMessage()} disabled={sending || !input.trim()}>
            ➤
          </button>
        </div>
        <p>支持 Shift+Enter 换行 · 创建 / 修改 / 测试网页应用</p>
      </footer>
    </>
  );
}
