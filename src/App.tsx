import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { CreateProjectModal } from "@/components/CreateProjectModal";
import { CreateTaskModal } from "@/components/CreateTaskModal";
import { TaskDetailPanel } from "@/components/TaskDetailPanel";
import {
  DiscoveryBoard,
  SprintPlanningBoard,
  TaskBoard,
  UserStoryBoard,
} from "@/features/boards";
import RoadmapPage from "@/features/roadmap/RoadmapPage";
import ReportsPage from "@/features/reports/ReportsPage";
import Inbox from "@/pages/Inbox";
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
          <Route path="/board/discovery" element={<DiscoveryBoard />} />
          <Route path="/board/user-story" element={<UserStoryBoard />} />
          <Route path="/board/task" element={<TaskBoard />} />
          <Route path="/board/sprint-planning" element={<SprintPlanningBoard />} />
          <Route path="/sprints" element={<Sprints />} />
          <Route path="/roadmap" element={<RoadmapPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/people" element={<People />} />
          <Route path="/inbox" element={<Inbox />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Placeholder title="Not Found" />} />
        </Route>
      </Routes>
      <CreateProjectModal />
      <CreateTaskModal />
      <TaskDetailPanel />
    </HashRouter>
  );
}

export default App;
