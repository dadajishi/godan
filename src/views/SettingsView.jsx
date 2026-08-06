export default function SettingsView() {
  return (
    <>
      <header>
        <div>
          <small>GODAN SETTINGS</small>
          <h1>设置</h1>
        </div>
        <span className="live">● 待开发</span>
      </header>
      <div className="chat">
        <div className="session"><i /> D5 将在此配置 API Key <i /></div>
        <div className="message">
          <div className="avatar">⚙️</div>
          <div>
            <small>狗蛋</small>
            <pre>API Key 设置将在下一步开发（D5），届时可在此输入你的 DeepSeek / OpenAI Key 并选择模型。</pre>
          </div>
        </div>
      </div>
    </>
  );
}
