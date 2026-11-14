import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AIAnalystPanel } from "./pages/ai_analyst/AIAnalystPanel";
import { LoginPage } from "./pages/auth/LoginPage";
import { RegisterPage } from "./pages/auth/RegisterPage";
import { AssumptionsEditor } from "./pages/business/AssumptionsEditor";
import { BusinessOverview } from "./pages/business/BusinessOverview";
import { ComponentsDependencies } from "./pages/business/ComponentsDependencies";
import { CreateBusinessWizard } from "./pages/business/CreateBusinessWizard";
import { WorkspaceDashboard } from "./pages/dashboard/WorkspaceDashboard";
import { DecisionDetailPage } from "./pages/decisions/DecisionDetailPage";
import { DecisionsListPage } from "./pages/decisions/DecisionsListPage";
import { ReportViewPage } from "./pages/reports/ReportViewPage";
import { ReportsListPage } from "./pages/reports/ReportsListPage";
import { ScenarioConfig } from "./pages/scenarios/ScenarioConfig";
import { ScenarioLibrary } from "./pages/scenarios/ScenarioLibrary";
import { SimulationResults } from "./pages/simulation/SimulationResults";
import { StrategyComparison } from "./pages/simulation/StrategyComparison";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/app" element={<AppLayout />}>
          <Route index element={<Navigate to="/app/dashboard" replace />} />
          <Route path="dashboard" element={<WorkspaceDashboard />} />
          <Route path="businesses/new" element={<CreateBusinessWizard />} />
          <Route path="businesses/:businessId" element={<BusinessOverview />} />
          <Route path="businesses/:businessId/assumptions" element={<AssumptionsEditor />} />
          <Route path="businesses/:businessId/components" element={<ComponentsDependencies />} />
          <Route path="scenarios" element={<ScenarioLibrary />} />
          <Route path="scenarios/:scenarioId/config" element={<ScenarioConfig />} />
          <Route path="simulation/runs/:runId" element={<SimulationResults />} />
          <Route path="simulation/runs/:runId/compare" element={<StrategyComparison />} />
          <Route path="ai-analyst/:runId" element={<AIAnalystPanel />} />
          <Route path="decisions" element={<DecisionsListPage />} />
          <Route path="decisions/:decisionId" element={<DecisionDetailPage />} />
          <Route path="reports" element={<ReportsListPage />} />
          <Route path="reports/:reportId" element={<ReportViewPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/app/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}

