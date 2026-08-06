import { useNavigate, useParams } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:3001";
// 预览 iframe 指向后端静态服务（与 API 同源同端口）
const PREVIEW_BASE = API_BASE;

export default function PreviewView() {
  const { name } = useParams();
  const navigate = useNavigate();
  const decoded = decodeURIComponent(name || "");
  const previewUrl = `${PREVIEW_BASE}/preview/${encodeURIComponent(decoded)}/`;

  return (
    <>
      <header>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <button
            onClick={() => navigate(-1)}
            style={{
              padding: "8px 14px",
              borderRadius: "10px",
              border: "1px solid #ffffff18",
              background: "transparent",
              color: "#b6bfd3",
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            ← 返回
          </button>
          <div>
            <small>GODAN PREVIEW</small>
            <h1 style={{ margin: "6px 0 0", fontSize: "25px" }}>{decoded}</h1>
          </div>
        </div>
        <span className="live">● 实时预览</span>
      </header>

      <div style={{ flex: 1, padding: "20px 34px", minHeight: 0, display: "flex", flexDirection: "column" }}>
        <div style={{
          flex: 1,
          borderRadius: "16px",
          overflow: "hidden",
          border: "1px solid #ffffff14",
          background: "#ffffff08",
          display: "flex",
          flexDirection: "column",
        }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "9px 14px",
            borderBottom: "1px solid #ffffff12",
            background: "#0a0e18cc",
          }}>
            <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: "#ff5f57" }} />
            <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: "#febc2e" }} />
            <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: "#28c840" }} />
            <span style={{ marginLeft: "10px", color: "#6c7690", fontSize: "12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {previewUrl}
            </span>
            <span style={{ marginLeft: "auto" }}>
              <button
                onClick={() => { const f = document.getElementById("preview-frame"); if (f) f.src = f.src; }}
                style={{
                  padding: "4px 12px",
                  borderRadius: "8px",
                  border: "1px solid #ffffff18",
                  background: "transparent",
                  color: "#b6bfd3",
                  fontSize: "12px",
                  cursor: "pointer",
                }}
              >
                ↻ 刷新
              </button>
            </span>
          </div>
          <iframe
            id="preview-frame"
            src={previewUrl}
            title="项目预览"
            style={{ flex: 1, border: "0", width: "100%", background: "#fff" }}
            sandbox="allow-scripts allow-modals allow-forms allow-popups"
          />
        </div>
        <p style={{ margin: "10px 2px 0", color: "#6c7690", fontSize: "11px" }}>
          提示：预览为隔离沙箱（sandbox），不支持跨域请求；如需完整测试请在浏览器中打开
        </p>
      </div>
    </>
  );
}
