import { NavLink, Outlet } from "react-router-dom";

// 侧栏导航项
const NAV_ITEMS = [
  { to: "/", label: "聊天", icon: "💬" },
  { to: "/projects", label: "项目", icon: "📁" },
  { to: "/settings", label: "设置", icon: "⚙️" },
];

export default function Layout() {
  return (
    <div className="app-shell">
      {/* 侧栏 */}
      <aside className="sidebar glass">
        <div className="brand">
          <b>🐶</b>
          <div>
            <strong>Godan AI</strong>
            <small>AI 应用工坊</small>
          </div>
        </div>

        {/* 导航 */}
        <div className="workflow">
          <small>导航</small>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              style={({ isActive }) => ({
                display: "flex",
                alignItems: "center",
                gap: "10px",
                margin: "6px 0",
                padding: "10px 12px",
                borderRadius: "12px",
                textDecoration: "none",
                color: isActive ? "#f2f4ff" : "#929bb2",
                background: isActive ? "#827cff33" : "transparent",
                fontSize: "13px",
              })}
            >
              <span>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </div>

        {/* 底部状态 */}
        <div className="model">
          <span className="dot" style={{ display: "inline-block", marginRight: "8px", verticalAlign: "middle" }} />
          DeepSeek · 本地运行
        </div>
      </aside>

      {/* 主区 */}
      <main className="console glass">
        <Outlet />
      </main>
    </div>
  );
}
