import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";

const API_BASE = window.godan?.apiBase || import.meta.env.VITE_API_BASE || "http://127.0.0.1:3001";

// 文件类型 → 图标
function fileIcon(name) {
  if (name.endsWith(".html")) return "🌐";
  if (name.endsWith(".css")) return "🎨";
  if (name.endsWith(".js") || name.endsWith(".jsx") || name.endsWith(".ts")) return "⚡";
  if (name.endsWith(".json")) return "📦";
  if (name.endsWith(".png") || name.endsWith(".jpg") || name.endsWith(".svg")) return "🖼️";
  if (name.endsWith(".md")) return "📝";
  return "📄";
}

// 文件树分组：把扁平列表转成树
function buildTree(files) {
  const root = { name: "", children: [], isDir: true };
  const dirMap = { "": root };
  for (const f of files) {
    const parts = f.path.split("/");
    let cur = root;
    let curPath = "";
    for (let i = 0; i < parts.length - 1; i++) {
      curPath = curPath ? curPath + "/" + parts[i] : parts[i];
      if (!dirMap[curPath]) {
        const dir = { name: parts[i], children: [], isDir: true, path: curPath };
        dirMap[curPath] = dir;
        cur.children.push(dir);
      }
      cur = dirMap[curPath];
    }
    cur.children.push({ name: parts[parts.length - 1], isDir: false, path: f.path, size: f.size });
  }
  return root.children;
}

export default function FileTreeView() {
  const { name } = useParams();
  const navigate = useNavigate();
  const [files, setFiles] = useState([]);
  const [tree, setTree] = useState([]);
  const [selected, setSelected] = useState(null); // {path}
  const [content, setContent] = useState("");
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState(null); // {type, text}
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(new Set());

  // 加载文件树
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/projects/${encodeURIComponent(name)}/files`);
        const data = await res.json();
        if (data.success) {
          setFiles(data.files);
          setTree(buildTree(data.files));
          // 默认选中 index.html
          const idx = data.files.find((f) => f.path.endsWith("index.html"));
          if (idx) selectFile(idx.path, data.files);
        } else {
          setStatus({ type: "err", text: data.error || "加载失败" });
        }
      } catch (e) {
        setStatus({ type: "err", text: "无法连接后端" });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  async function selectFile(path, fileList = files) {
    try {
      const res = await fetch(`${API_BASE}/api/projects/${encodeURIComponent(name)}/file?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      if (data.success) {
        setSelected({ path });
        setContent(data.content);
        setDirty(false);
        setStatus(null);
      } else {
        setStatus({ type: "err", text: data.error || "读取失败" });
      }
    } catch (e) {
      setStatus({ type: "err", text: "无法连接后端" });
    }
  }

  async function saveFile() {
    if (!selected || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/projects/${encodeURIComponent(name)}/file?path=${encodeURIComponent(selected.path)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (data.success) {
        setDirty(false);
        setStatus({ type: "ok", text: "✅ 已保存 " + data.path });
        // 刷新文件树（大小可能变化）
        const fres = await fetch(`${API_BASE}/api/projects/${encodeURIComponent(name)}/files`);
        const fdata = await fres.json();
        if (fdata.success) { setFiles(fdata.files); setTree(buildTree(fdata.files)); }
      } else {
        setStatus({ type: "err", text: "❌ " + (data.error || "保存失败") });
      }
    } catch (e) {
      setStatus({ type: "err", text: "无法连接后端" });
    } finally {
      setSaving(false);
    }
  }

  function toggleDir(dir) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(dir.path)) next.delete(dir.path);
      else next.add(dir.path);
      return next;
    });
  }

  function renderNodes(nodes, depth = 0) {
    return nodes.map((node) => (
      <div key={node.path || node.name}>
        {node.isDir ? (
          <>
            <div
              className={`ft-node ft-dir ${expanded.has(node.path) ? "open" : ""}`}
              style={{ paddingLeft: 8 + depth * 16 }}
              onClick={() => toggleDir(node)}
            >
              <span className="ft-arrow">{expanded.has(node.path) ? "▾" : "▸"}</span>
              📁 {node.name}
            </div>
            {expanded.has(node.path) && renderNodes(node.children, depth + 1)}
          </>
        ) : (
          <div
            className={`ft-node ft-file ${selected?.path === node.path ? "active" : ""}`}
            style={{ paddingLeft: 16 + depth * 16 }}
            onClick={() => selectFile(node.path)}
            title={`${node.size} B`}
          >
            {fileIcon(node.name)} {node.name}
          </div>
        )}
      </div>
    ));
  }

  return (
    <>
      <header>
        <div>
          <small>GODAN WORKSPACE</small>
          <h1>📁 {name}</h1>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          {dirty && <span className="live working">● 未保存</span>}
          <button className="preview-btn" onClick={() => navigate(`/preview/${encodeURIComponent(name)}`)}>
            👁️ 预览
          </button>
          <button
            className="preview-btn"
            style={{ background: "linear-gradient(135deg,#ffca6b,#ff8b6b)" }}
            onClick={saveFile}
            disabled={saving || !selected || !dirty}
          >
            {saving ? "保存中…" : "💾 保存"}
          </button>
        </div>
      </header>

      <div className="ft-layout">
        <div className="ft-sidebar">
          <div className="ft-title">文件 ({files.length})</div>
          <div className="ft-tree">
            {tree.length > 0 ? renderNodes(tree) : <p className="ft-empty">暂无文件</p>}
          </div>
        </div>
        <div className="ft-editor">
          {selected ? (
            <>
              <div className="ft-editor-header">
                <span>{fileIcon(selected.path)} {selected.path}</span>
                <span className="ft-status" style={{ color: status?.type === "err" ? "#e74c3c" : status?.type === "ok" ? "#2ecc71" : "#6c7690" }}>
                  {status?.text || `${content.length} 字符`}
                </span>
              </div>
              <textarea
                className="ft-code"
                value={content}
                onChange={(e) => { setContent(e.target.value); setDirty(true); setStatus(null); }}
                spellCheck={false}
                style={{ fontFamily: "'SF Mono', Menlo, Consolas, monospace" }}
              />
            </>
          ) : (
            <div className="ft-empty" style={{ height: "100%", display: "grid", placeItems: "center" }}>
              <p style={{ color: "#5d6785" }}>从左侧选择一个文件开始编辑</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
