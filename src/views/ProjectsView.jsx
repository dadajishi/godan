export default function ProjectsView() {
  return (
    <>
      <header>
        <div>
          <small>GODAN PROJECTS</small>
          <h1>项目列表</h1>
        </div>
        <span className="live">● 待开发</span>
      </header>
      <div className="chat">
        <div className="session"><i /> D6 将在此展示项目列表 <i /></div>
        <div className="message">
          <div className="avatar">📁</div>
          <div>
            <small>狗蛋</small>
            <pre>项目列表功能将在下一步开发（D6），届时可在此查看、打开、删除你创建的应用。</pre>
          </div>
        </div>
      </div>
    </>
  );
}
