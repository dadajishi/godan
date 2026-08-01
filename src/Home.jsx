import { useEffect, useRef, useState } from "react";
import "./styles/godan.css";

const API_URL = "http://localhost:3001/chat";

export default function Home() {
    const [input, setInput] = useState("");
    const [messages, setMessages] = useState([
        { role: "agent", content: "你好，我是 Godan Agent。告诉我你想创建什么，我会规划、生成并执行项目。" }
    ]);
    const [status, setStatus] = useState("ready");
    const endRef = useRef(null);

    useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), [messages, status]);

    async function sendMessage(value = input) {
        const message = value.trim();
        if (!message || status === "working") return;
        setMessages((items) => [...items, { role: "user", content: message }]);
        setInput("");
        setStatus("working");

        try {
            const response = await fetch(API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.reply || "服务暂时不可用");
            const reply = typeof data.reply === "string" ? data.reply : JSON.stringify(data.reply, null, 2);
            setMessages((items) => [...items, { role: "agent", content: reply }]);
            setStatus("ready");
        } catch (error) {
            setMessages((items) => [...items, { role: "agent", content: "无法连接 Godan 后端：" + error.message, error: true }]);
            setStatus("offline");
        }
    }

    const label = status === "working" ? "工作中 · 正在处理" : status === "offline" ? "连接异常 · 请检查后端" : "在线 · 等待任务";

    return (
        <div className="app-shell">
            <aside className="sidebar glass">
                <div className="brand"><b>G</b><div><small>LOCAL AI AGENT</small><strong>Godan</strong></div></div>
                <section className="agent-card"><small>AGENT STATUS</small><i className={"dot " + status}></i><h2>{status === "working" ? "Processing" : status === "offline" ? "Offline" : "Ready"}</h2><p>{label}</p></section>
                <section className="workflow"><small>WORKFLOW</small><p><span>01</span> Planner <b>●</b></p><p><span>02</span> Builder <b>●</b></p><p><span>03</span> Executor <b>●</b></p></section>
                <div className="model">● Qwen3:4B · Local</div>
            </aside>
            <main className="console glass">
                <header><div><small>AGENT CONSOLE</small><h1>让 Godan 开始创造</h1></div><span className={"live " + status}>● {label}</span></header>
                <section className="chat">
                    <div className="session">NEW SESSION <i></i></div>
                    {messages.map((item, index) => <article className={"message " + item.role + (item.error ? " error" : "")} key={index}><div className="avatar">{item.role === "user" ? "You" : "G"}</div><div><small>{item.role === "user" ? "你的需求" : "Godan Agent"}</small><pre>{item.content}</pre></div></article>)}
                    {status === "working" && <article className="message agent"><div className="avatar">G</div><div><small>Godan Agent</small><pre className="thinking">● ● ● 正在分析需求并调用 Agent 工作流…</pre></div></article>}
                    <div ref={endRef}></div>
                </section>
                <footer>
                    <div className="suggestions">{["创建一个天气应用", "做一个个人作品集", "生成待办事项工具"].map((text) => <button key={text} onClick={() => sendMessage(text)} disabled={status === "working"}>{text}</button>)}</div>
                    <div className="composer"><textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendMessage(); } }} placeholder="描述你要创建的应用、页面或任务…" rows="1" disabled={status === "working"} /><button onClick={() => sendMessage()} disabled={!input.trim() || status === "working"}>↑</button></div>
                    <p>Enter 发送 · Shift + Enter 换行 · Godan 使用本地 Agent 服务</p>
                </footer>
            </main>
        </div>
    );
}