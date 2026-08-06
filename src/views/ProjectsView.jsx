import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:3001";

function formatSize(bytes) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return (bytes / Math.pow(1024, i)).toFixed(1) + " " + units[i];
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function ProjectsView() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(null);
  const [notice, setNotice] = useState(null);
  const navigate = useNavigate();

  async function loadProjects() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/projects`);
      const data = await res.json();
      if (data.success) {
        setProjects(data.projects);
      } else {
        setError(data.error || "加载失败");
      }
    } catch (e) {
      setError("无法连接后端，请确认 backend 已启动");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadProjects(); }, []);

  async function deleteProject(name) {
    if (!window.confirm(`确定删除项目「${name}」？此操作不可恢复。`)) return;
    setDeleting(name);
    setNotice(null);
    try {
      const res = await fetch(`${API_BASE}/api/projects/${encodeURIComponent(name)}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setNotice({ type: "ok", text: `✅ 已删除「${name}」` });
        loadProjects();
      } else {
        setNotice({ type: "err", text: `❌ 删除失败：${data.error}` });
      }
    } catch (e) {
      setNotice({ type: "err", text: "❌ 删除失败，请确认后端已启动" });
    } finally {
      setDeleting(null);
    }
  }

  function openProject(p) {
    // D7: 优先跳转到应用内预览（web 项目）；desktop 项目走系统打开
    if (p.type === "web_app" && p.exists) {
      navigate(`/preview/${encodeURIComponent(p.name)}`);
    } else {
      try {
        fetch(`${API_BASE}/api/projects/${encodeURIComponent(p.name)}/open`).catch(() => {});
      } catch (e) { /* ignore */ }
    }
  }

  const cardStyle = {
    padding: "18px 20px",
    borderRadius: "16px",
    border: "1px solid #ffffff14",
    background: "#0d1322b0",
    marginBottom: "12px",
    display: "flex",
    alignItems: "center",
    gap: "16px",
  };
  const btnStyle = {
    padding: "8px 14px",
    borderRadius: "10px",
    border: "1px solid #ffffff18",
    background: "transparent",
    color: "#b6bfd3",
    fontSize: "12px",
    cursor: "pointer",
  };
  const delBtn = {
    ...btnStyle,
    border: "1px solid #ff718866",
    color: "#ff9fac",
  };

  return (
    <>
      <header>
        <div>
          <small>GODAN PROJECTS</small>
          <h1>项目列表</h1>
        </div>
        <span className="live">
          ● {loading ? "加载中" : `${projects.length} 个项目`}
        </span>
      </header>

      <div className="chat" style={{ maxWidth: "860px", margin: "0 auto" }}>
        <div className="session"><i /> 你创建的应用 <i /></div>

        {notice && (
          <p style={{
            padding: "10px 14px", borderRadius: "10px", margin: "0 0 16px", fontSize: "13px",
            background: notice.type === "ok" ? "#47d9aa18" : "#ff718822",
            color: notice.type === "ok" ? "#a8e6ce" : "#ffc2ca",
            border: `1px solid ${notice.type === "ok" ? "#47d9aa33" : "#ff718866"}`,
          }}>
            {notice.text}
          </p>
        )}

        {error && (
          <div className="message error">
            <div className="avatar">⚠️</div>
            <div><small>狗蛋</small><pre>{error}</pre></div>
          </div>
        )}

        {loading && !error && (
          <div className="message thinking">
            <div className="avatar">🐶</div>
            <div><small>狗蛋</small><pre>加载项目中…</pre></div>
          </div>
        )}

        {!loading && !error && projects.length === 0 && (
          <div className="message">
            <div className="avatar">📁</div>
            <div>
              <small>狗蛋</small>
              <pre>还没有项目。去聊天页说「做一个番茄钟网页」，创建你的第一个应用吧！</pre>
            </div>
          </div>
        )}

        {projects.map((p) => (
          <div key={p.name} style={cardStyle}>
            <div style={{
              width: "42px", height: "42px", borderRadius: "12px", flex: "none",
              display: "grid", placeItems: "center", fontSize: "20px",
              background: "linear-gradient(135deg,#867cff33,#3cd1cb22)",
              border: "1px solid #827cff44",
            }}>
              {p.type === "desktop_app" ? "🖥️" : "🌐"}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: "14px", color: "#f2f4ff", marginBottom: "4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {p.name}
              </div>
              <div style={{ color: "#6c7690", fontSize: "11px" }}>
                {p.type === "desktop_app" ? "桌面应用" : "网页应用"} · {formatSize(p.size)} · {p.fileCount} 个文件 · 修改于 {formatDate(p.lastModified)}
              </div>
            </div>

            <div style={{ display: "flex", gap: "8px", flex: "none" }}>
              <button style={btnStyle} onClick={() => openProject(p)} disabled={!p.exists}>
                {p.exists ? "打开" : "缺失"}
              </button>
              <button
                style={delBtn}
                onClick={() => deleteProject(p.name)}
                disabled={deleting === p.name}
              >
                {deleting === p.name ? "删除中…" : "删除"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
