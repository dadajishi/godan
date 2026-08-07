import { HashRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import ChatView from "./views/ChatView.jsx";
import ProjectsView from "./views/ProjectsView.jsx";
import SettingsView from "./views/SettingsView.jsx";
import PreviewView from "./views/PreviewView.jsx";
import FileTreeView from "./views/FileTreeView.jsx";

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<ChatView />} />
          <Route path="/projects" element={<ProjectsView />} />
          <Route path="/settings" element={<SettingsView />} />
          <Route path="/preview/:name" element={<PreviewView />} />
          <Route path="/files/:name" element={<FileTreeView />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}

export default App;
