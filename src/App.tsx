import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { CreateProjectModal } from "@/components/CreateProjectModal";
import People from "@/pages/People";
import Settings from "@/pages/Settings";
import Sprints from "@/pages/Sprints";

function Placeholder({ title }: { title: string }) {
  return (
    <div>
      <h1 className="text-xl font-semibold text-white">{title}</h1>
      <p className="mt-2 text-sm text-gray-500">Coming in a later phase.</p>
    </div>
  );
}

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/board/user-story" replace />} />
          <Route path="/board/discovery" element={<Placeholder title="Discovery Board" />} />
          <Route path="/board/user-story" element={<Placeholder title="User Story Board" />} />
          <Route path="/board/task" element={<Placeholder title="Task Board" />} />
          <Route path="/board/sprint-planning" element={<Placeholder title="Sprint Planning Board" />} />
          <Route path="/sprints" element={<Sprints />} />
          <Route path="/roadmap" element={<Placeholder title="Roadmap" />} />
          <Route path="/reports" element={<Placeholder title="Reports" />} />
          <Route path="/people" element={<People />} />
          <Route path="/inbox" element={<Placeholder title="Inbox" />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Placeholder title="Not Found" />} />
        </Route>
      </Routes>
      <CreateProjectModal />
    </HashRouter>
  );
}

export default App;
