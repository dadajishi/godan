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

  const pollTimers = useRef(new Map()); // taskId → interval

  // 组件卸载时清理所有轮询
  useEffect(() => {
    return () => {
      pollTimers.current.forEach((t) => clearInterval(t));
      pollTimers.current.clear();
    };
  }, []);

  // 轮询任务状态（每 1.5s），实时更新步骤，完成后停止
  function startPolling(taskId, msgId) {
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/tasks/${taskId}`);
        const data = await res.json();
        if (!data.success || !data.task) return;
        const t = data.task;
        const running = t.status === "running";
        const previewProject = t.result?.result?.project || null;

        setMessages((prev) => prev.map((m) => {
          if (m.id !== msgId) return m;
          if (running) {
            return { ...m, running: true, steps: t.steps, pendingOps: t.pendingOps, content: `🖥️ 任务执行中…（已完成 ${t.steps.length} 步）` };
          }
          return {
            ...m,
            running: false,
            steps: t.steps,
            pendingOps: t.pendingOps,
            previewProject,
            content: t.status === "error" ? `❌ 任务失败: ${t.error}` : (t.reply || "任务完成"),
            error: t.status === "error"
          };
        }));

        if (!running) {
          clearInterval(timer);
          pollTimers.current.delete(taskId);
        }
      } catch (e) { /* 轮询失败静默，下轮重试 */ }
    }, 1500);
    pollTimers.current.set(taskId, timer);
  }

  async function sendMessage(text) {
    const content = (text ?? input).trim();
    if (!content || sending) return;

    setMessages((m) => [...m, { id: "u" + Date.now(), role: "user", content }]);
    setInput("");
    setStatus("狗蛋思考中…");
    setSending(true);

    try {
      // 异步任务模式：立即返回 taskId，后台执行（不再有 180s 超时）
      const res = await fetch(`${API_BASE}/api/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: content })
      });
      const data = await res.json();
      if (!data.success || !data.taskId) {
        setMessages((m) => [...m, { id: "a" + Date.now(), role: "assistant", content: `❌ ${data.error || "任务提交失败"}`, error: true }]);
        return;
      }
      const taskId = data.taskId;
      const msgId = "a" + Date.now();
      setMessages((m) => [...m, { id: msgId, role: "assistant", content: "🖥️ 任务执行中…", running: true, steps: [], pendingOps: [] }]);
      startPolling(taskId, msgId);
    } catch (err) {
      setMessages((m) => [...m, { id: "a" + Date.now(), role: "assistant", content: "连接狗蛋后端失败，请确认 backend 已启动 🐶", error: true }]);
      console.error(err);
    } finally {
      setStatus("");
      setSending(false);
    }
  }

  // 批准执行电脑操作（CONFIRM 级：删除/覆盖/停止等）
  async function confirmOp(opId) {
    if (!opId) return;
    setSending(true);
    try {
      const res = await fetch(`${API_BASE}/api/computer/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opId })
      });
      const data = await res.json();
      const result = data.result || {};
      let text;
      if (result.success) {
        text = `✅ 已执行: ${result.output || "完成"}`;
      } else {
        text = `❌ 执行失败: ${result.error || data.error || "未知错误"}`;
      }
      setMessages((m) => [...m, { role: "assistant", content: text }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", content: `❌ 确认请求失败: ${e.message}`, error: true }]);
    } finally {
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
          <div key={msg.id || i} className={`message ${msg.role} ${msg.error ? "error" : ""} msg-anim`} style={{ animationDelay: `${Math.min(i * 70, 400)}ms` }}>
            <div className={`avatar ${msg.role === "user" ? "" : "dog-avatar"}`}>{msg.role === "user" ? "🧑" : "🐶"}</div>
            <div>
              <small>{msg.role === "user" ? "你" : "狗蛋"}</small>
              <pre>{msg.content}</pre>
              {msg.running && (
                <div style={{ marginTop: "10px", padding: "10px 12px", borderRadius: "10px", background: "#0a0e18aa", border: "1px solid #8980ff44", maxWidth: "620px" }}>
                  <div style={{ fontSize: "11px", fontWeight: 800, color: "#bcb9ff", letterSpacing: ".1em", marginBottom: "6px" }}>
                    <span className="typing-dots"><i /><i /><i /></span> 🛠️ 实时执行中…（{msg.steps?.length || 0} 步）
                  </div>
                  {(msg.steps || []).slice(-6).map((s, si) => (
                    <div key={si} style={{
                      fontSize: "12px", lineHeight: "1.7", color: s.ok ? "#a8e6ce" : s.needConfirm ? "#ffd27d" : s.blocked ? "#ff9fac" : "#ffc2ca",
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"
                    }}>
                      {s.ok ? "✅" : s.needConfirm ? "⏸️" : s.blocked ? "⛔" : "❌"} {s.tool}.{s.action}{s.goal ? `（${s.goal}）` : ""}{s.error ? ` — ${s.error}` : ""}
                    </div>
                  ))}
                </div>
              )}
              {msg.previewProject && (
                <button
                  onClick={() => navigate(`/preview/${encodeURIComponent(msg.previewProject)}`)}
                  className="preview-btn"
                >
                  👁️ 查看预览
                </button>
              )}
              {!msg.running && msg.steps && msg.steps.length > 0 && (
                <div style={{ marginTop: "10px", padding: "10px 12px", borderRadius: "10px", background: "#0a0e18aa", border: "1px solid #ffffff12", maxWidth: "620px" }}>
                  <div style={{ fontSize: "11px", fontWeight: 800, color: "#727c95", letterSpacing: ".1em", marginBottom: "6px" }}>🛠️ 操作步骤（{msg.steps.length}）</div>
                  {msg.steps.map((s, si) => (
                    <div key={si} style={{
                      fontSize: "12px", lineHeight: "1.7", color: s.ok ? "#a8e6ce" : s.needConfirm ? "#ffd27d" : s.blocked ? "#ff9fac" : "#ffc2ca",
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"
                    }} title={`${s.tool}.${s.action}${s.error ? " — " + s.error : ""}`}>
                      {s.ok ? "✅" : s.needConfirm ? "⏸️" : s.blocked ? "⛔" : "❌"} {si + 1}. {s.tool}.{s.action}{s.goal ? `（${s.goal}）` : ""}{s.error ? ` — ${s.error}` : ""}
                    </div>
                  ))}
                </div>
              )}
              {msg.pendingOps && msg.pendingOps.length > 0 && (
                <div style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "8px", alignItems: "flex-start" }}>
                  {msg.pendingOps.map((p) => (
                    <button
                      key={p.opId}
                      onClick={() => confirmOp(p.opId)}
                      className="preview-btn"
                      style={{ background: "linear-gradient(135deg,#ffca6b,#ff8b6b)", marginTop: 0 }}
                    >
                      ⚠️ 批准执行: {p.tool}.{p.action}
                    </button>
                  ))}
                  <small style={{ color: "#6c7690" }}>批准后狗蛋会立即执行该操作（删除/覆盖/停止类）</small>
                </div>
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
