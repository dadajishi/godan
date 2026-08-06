import "./styles/godan.css";
import { useEffect, useRef, useState } from "react";
export default function Home() {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: "你好，我是狗蛋 Agent 🐶，有什么可以帮你做的？"
    }
  ]);

  const [input, setInput] = useState("");
  const [status, setStatus] = useState("");
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({
      behavior: "smooth"
    });
  }, [messages, status]);

  async function sendMessage() {
    if (!input.trim()) return;

    const text = input;

    setMessages((m) => [
      ...m,
      {
        role: "user",
        content: text
      }
    ]);

    setInput("");
    setStatus("狗蛋思考中...");

    try {
      const res = await fetch("http://localhost:3001/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: text
        })
      });

      const data = await res.json();

      let reply = "收到 🐶";

      if (data.reply?.plan?.reply) {
        reply = data.reply.plan.reply;
      } else if (typeof data.reply === "string") {
        reply = data.reply;
      } else {
        reply = JSON.stringify(data.reply, null, 2);
      }

      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: reply
        }
      ]);

    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content:
            "连接狗蛋后端失败，请确认 backend 已启动 🐶"
        }
      ]);

      console.error(err);

    } finally {
      setStatus("");
    }
  }

  return (
    <div style={{
      height: "100vh",
      display: "flex",
      flexDirection: "column",
      background: "#111",
      color: "white",
      fontFamily: "system-ui"
    }}>

      <div style={{
        padding: "20px",
        fontSize: "24px",
        fontWeight: "bold"
      }}>
        🐶 Godan AI
      </div>


      <div style={{
        flex: 1,
        overflowY: "auto",
        padding: "20px"
      }}>

        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              marginBottom: "15px",
              padding: "12px",
              borderRadius: "12px",
              background:
                msg.role === "user"
                  ? "#2563eb"
                  : "#222"
            }}
          >
            {msg.content}
          </div>
        ))}

        <div ref={endRef}></div>

      </div>


      <div style={{
        display: "flex",
        padding: "15px",
        gap: "10px"
      }}>

        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              sendMessage();
            }
          }}
          placeholder="输入消息..."
          style={{
            flex: 1,
            padding: "12px",
            borderRadius: "10px",
            border: "none"
          }}
        />


        <button
          onClick={sendMessage}
          style={{
            padding: "12px 20px",
            borderRadius: "10px",
            border: "none",
            cursor: "pointer"
          }}
        >
          发送
        </button>

      </div>


      {
        status &&
        <div style={{
          padding: "10px",
          textAlign: "center",
          opacity: 0.7
        }}>
          {status}
        </div>
      }

    </div>
  );
}
