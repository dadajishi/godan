import { useEffect, useRef, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:3001";

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
      if (data.reply?.plan?.reply) {
        reply = data.reply.plan.reply;
      } else if (typeof data.reply === "string") {
        reply = data.reply;
      } else if (data.reply?.success === false) {
        reply = `❌ ${data.reply.error || "任务失败"}`;
      } else {
        reply = JSON.stringify(data.reply, null, 2);
      }

      setMessages((m) => [...m, { role: "assistant", content: reply }]);
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
          <div key={i} className={`message ${msg.role} ${msg.error ? "error" : ""}`}>
            <div className="avatar">{msg.role === "user" ? "🧑" : "🐶"}</div>
            <div>
              <small>{msg.role === "user" ? "你" : "狗蛋"}</small>
              <pre>{msg.content}</pre>
            </div>
          </div>
        ))}

        {status && <div className="message thinking"><div className="avatar">🐶</div><div><small>狗蛋</small><pre>{status}</pre></div></div>}
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
