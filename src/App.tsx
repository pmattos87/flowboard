import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
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
import About from "@/pages/About";
import Inbox from "@/pages/Inbox";
import People from "@/pages/People";
import Settings from "@/pages/Settings";

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
          <Route path="/roadmap" element={<RoadmapPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/people" element={<People />} />
          <Route path="/inbox" element={<Inbox />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/about" element={<About />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <CreateProjectModal />
      <CreateTaskModal />
      <TaskDetailPanel />
      <Toaster theme="dark" position="bottom-right" richColors />
    </HashRouter>
  );
}

export default App;
