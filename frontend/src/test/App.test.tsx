import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "../api/client";
import { AppRoutes } from "../App";
import { AIAnalystPanel } from "../pages/ai_analyst/AIAnalystPanel";
import { LoginPage } from "../pages/auth/LoginPage";
import { RegisterPage } from "../pages/auth/RegisterPage";
import { AssumptionsEditor } from "../pages/business/AssumptionsEditor";
import { ComponentsDependencies } from "../pages/business/ComponentsDependencies";
import { ReportViewPage } from "../pages/reports/ReportViewPage";
import { SimulationResults } from "../pages/simulation/SimulationResults";
import { StrategyComparison } from "../pages/simulation/StrategyComparison";
import { useAuthStore } from "../stores/authStore";

// Mock ResizeObserver for Recharts ResponsiveContainer in jsdom
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverMock;

vi.mock("../api/client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../api/client")>();
  return {
    ...mod,
    apiClient: {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    },
  };
});

describe("AI WarRoom Frontend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useAuthStore.setState({
      user: null,
      organizations: [],
      activeOrgId: null,
      isAuthenticated: false,
      isLoading: false,
    });
  });

  it("redirects unauthenticated users to /login on protected routes", async () => {
    render(
      <MemoryRouter initialEntries={["/app/dashboard"]}>
        <AppRoutes />
      </MemoryRouter>
    );

    expect(await screen.findByText(/Sign in to AI WarRoom/i)).toBeInTheDocument();
  });

  it("submits login form and stores tokens", async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.post).mockResolvedValueOnce({
      data: { access: "acc-123", refresh: "ref-456" },
    });
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { id: "u1", email: "founder@example.com", full_name: "Founder", results: [] },
    });

    render(
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/app/dashboard" element={<div>Dashboard Loaded</div>} />
        </Routes>
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText(/Email address/i), "founder@example.com");
    await user.type(screen.getByLabelText(/Password/i), "StrongPass123!");
    await user.click(screen.getByRole("button", { name: /Sign in/i }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith("/auth/login/", {
        email: "founder@example.com",
        password: "StrongPass123!",
      });
    });
    expect(localStorage.getItem("access_token")).toBe("acc-123");
  });

  it("renders simulation results with model estimate disclaimer and frozen assumptions", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: {
        id: "run-1",
        business: "biz-1",
        business_name: "FreshCart Express",
        scenario: "scen-1",
        scenario_name: "Demand -30%",
        module: "idea",
        engine_key: "business_idea_financial_v1",
        engine_version: "1.0.0",
        currency: "INR",
        status: "completed",
        input_snapshot: {},
        assumptions_used: [
          {
            key: "avg_order_value",
            value: "600",
            unit: "INR/order",
            source_type: "user_input",
            confidence: "medium",
          },
        ],
        warnings: ["Sample warning"],
        limitations: [],
        error_message: "",
        started_at: null,
        completed_at: null,
        created_at: "2026-11-10T12:00:00Z",
        results: [
          {
            id: "r1",
            is_baseline: true,
            metric_key: "baseline_gross_sales",
            label: "Estimated Monthly Gross Sales",
            value_numeric: "600000.00",
            unit: "INR/month",
            category: "financial",
            formula_note: "",
          },
          {
            id: "r2",
            is_baseline: false,
            metric_key: "gross_sales",
            label: "Estimated Monthly Gross Sales",
            value_numeric: "420000.00",
            unit: "INR/month",
            category: "financial",
            formula_note: "effective_orders * avg_order_value",
          },
        ],
      },
    });

    render(
      <MemoryRouter initialEntries={["/app/simulation/runs/run-1"]}>
        <Routes>
          <Route path="/app/simulation/runs/:runId" element={<SimulationResults />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText(/Demand -30%/i)).toBeInTheDocument();
    expect(screen.getByText(/not guaranteed forecasts/i)).toBeInTheDocument();
    expect(screen.getAllByText(/avg_order_value/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Sample warning/i)).toBeInTheDocument();
  });

  it("renders strategy comparison distinguishing affected value from revenue loss", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: {
        run_id: "run-2",
        scenario_id: "scen-2",
        scenario_name: "2h Gateway Outage",
        module: "resilience",
        currency: "INR",
        engine_key: "resilience_payment_gateway_outage_v1",
        engine_version: "1.0.0",
        strategies: [
          {
            strategy_id: "s1",
            strategy_key: "failover",
            strategy_name: "Fail Over to Backup Gateway",
            description: "",
            rank: 1,
            warnings: [],
            metrics: [
              {
                metric_key: "recovered_orders",
                label: "Recovered Orders",
                value_numeric: "144.50",
                unit: "orders",
                category: "operational",
                formula_note: "",
              },
            ],
          },
          {
            strategy_id: "s2",
            strategy_key: "wait",
            strategy_name: "Wait for Primary Recovery",
            description: "",
            rank: 2,
            warnings: [],
            metrics: [
              {
                metric_key: "recovered_orders",
                label: "Recovered Orders",
                value_numeric: "42.50",
                unit: "orders",
                category: "operational",
                formula_note: "",
              },
            ],
          },
        ],
      },
    });

    render(
      <MemoryRouter initialEntries={["/app/simulation/runs/run-2/compare"]}>
        <Routes>
          <Route path="/app/simulation/runs/:runId/compare" element={<StrategyComparison />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText(/Strategy Comparison — 2h Gateway Outage/i)).toBeInTheDocument();
    expect(screen.getByText(/NOT automatic revenue loss/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Fail Over to Backup Gateway/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/144.5 orders/i).length).toBeGreaterThan(0);
  });

  it("validates register password mismatch before calling API", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/register"]}>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
        </Routes>
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText(/Full name/i), "Aarav Mehta");
    await user.type(screen.getByLabelText(/Email address/i), "aarav@example.com");
    await user.type(screen.getByLabelText(/^Password \(min 8 chars\)/i), "StrongPass123!");
    await user.type(screen.getByLabelText(/Confirm password/i), "WrongPass999!");
    await user.click(screen.getByRole("button", { name: /Create account/i }));

    expect(await screen.findByText(/Passwords do not match/i)).toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it("renders assumptions editor with provenance badges and metric tab", async () => {
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce({ data: { id: "biz-1", name: "FreshCart", currency: "INR" } })
      .mockResolvedValueOnce({
        data: {
          results: [
            {
              id: "a1",
              business: "biz-1",
              key: "orders_per_month",
              label: "Monthly Orders",
              value_numeric: "3000.0000",
              unit: "orders/month",
              assumption_type: "demand",
              source_type: "illustrative",
              source_reference: "",
              confidence: "medium",
              notes: "",
              valid_from: "2026-11-10T00:00:00Z",
            },
          ],
        },
      })
      .mockResolvedValueOnce({ data: { results: [] } });

    render(
      <MemoryRouter initialEntries={["/app/businesses/biz-1/assumptions"]}>
        <Routes>
          <Route path="/app/businesses/:businessId/assumptions" element={<AssumptionsEditor />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText(/Monthly Orders/i)).toBeInTheDocument();
    const badges = screen.getAllByText(/Illustrative Estimate/i);
    expect(badges.length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Observed Metrics/i })).toBeInTheDocument();
  });

  it("renders AI analyst evidence metric keys and limitations", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: {
        results: [
          {
            id: "ai-1",
            run: "run-1",
            business_id: "biz-1",
            scenario_name: "Demand Drop",
            provider: "mock",
            model_name: "mock-deterministic-v1",
            prompt_version: "v1.0.0",
            status: "completed",
            validation_warnings: [],
            error_message: "",
            created_at: "2026-11-10T12:00:00Z",
            structured_output: {
              executive_summary: "Operating margin turns negative under -30% demand.",
              key_findings: ["Gross sales fall to 420,000 INR/month."],
              strategy_comparison: ["Rank #1 — Reduce Marketing Spend by 25%."],
              recommendations: [
                {
                  title: "Protect cash runway",
                  action: "Cut acquisition spend until repeat orders stabilize.",
                  rationale: "Negative operating result consumes capital.",
                  supporting_evidence: [
                    { metric_key: "operating_result", interpretation: "-44000 INR/month" },
                  ],
                  risks: ["Lower growth pace."],
                  confidence: "medium",
                },
              ],
              missing_information: ["Cohort retention data."],
              limitations: ["Simplified monthly model only."],
              suggested_next_scenarios: ["Test +10% AOV sensitivity."],
            },
          },
        ],
      },
    });

    render(
      <MemoryRouter initialEntries={["/app/ai-analyst/run-1"]}>
        <Routes>
          <Route path="/app/ai-analyst/:runId" element={<AIAnalystPanel />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText(/Protect cash runway/i)).toBeInTheDocument();
    expect(screen.getByText("operating_result")).toBeInTheDocument();
    expect(screen.getByText(/Simplified monthly model only/i)).toBeInTheDocument();
  });

  it("renders report view with disclaimer and linked decisions", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: {
        id: "rep-1",
        business: "biz-1",
        business_name: "FreshCart",
        run: "run-1",
        title: "Q4 Resilience Brief",
        report_type: "resilience_assessment",
        created_at: "2026-11-10T12:00:00Z",
        content: {
          generated_at: "2026-11-10T12:00:00Z",
          disclaimer: "All simulation figures are deterministic model estimates.",
          business: {
            name: "FreshCart",
            stage: "operating",
            industry: "online_grocery",
            location: "Bengaluru",
            currency: "INR",
            data_quality: "reviewed",
            is_demo: true,
          },
          run: null,
          ai_analysis: null,
          decisions: [
            {
              id: "dec-1",
              title: "Enable secondary gateway failover",
              selected_strategy_key: "failover",
              rationale: "Recovers 72% of outage volume.",
              status: "approved",
              actions: [{ title: "Wire Cashfree webhook", owner_name: "Ops Lead", due_date: null, status: "todo" }],
            },
          ],
        },
      },
    });

    render(
      <MemoryRouter initialEntries={["/app/reports/rep-1"]}>
        <Routes>
          <Route path="/app/reports/:reportId" element={<ReportViewPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText(/Q4 Resilience Brief/i)).toBeInTheDocument();
    expect(screen.getByText(/deterministic model estimates/i)).toBeInTheDocument();
    expect(screen.getByText(/Enable secondary gateway failover/i)).toBeInTheDocument();
  });

  it("renders Isometric 3D Spatial Twin with simulation controls and telemetry HUD", async () => {
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce({ data: { id: "biz-1", name: "FreshCart Express", currency: "INR" } })
      .mockResolvedValueOnce({
        data: {
          results: [
            { id: "c1", business: "biz-1", name: "Checkout App", component_type: "website", criticality: "critical", description: "" },
            { id: "c2", business: "biz-1", name: "Primary Payment Gateway", component_type: "payment_gateway", criticality: "critical", description: "" },
            { id: "c3", business: "biz-1", name: "Backup Payment Gateway", component_type: "payment_gateway", criticality: "high", description: "" },
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          results: [
            {
              id: "d1",
              business: "biz-1",
              source_component: "c1",
              source_component_name: "Checkout App",
              target_component: "c2",
              target_component_name: "Primary Payment Gateway",
              relationship_type: "depends_on",
              criticality: "critical",
              fallback_info: "",
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        data: { results: [{ key: "daily_orders", value_numeric: "2400" }, { key: "avg_order_value", value_numeric: "500" }] },
      })
      .mockResolvedValueOnce({ data: { results: [] } })
      .mockResolvedValueOnce({ data: { results: [] } });

    render(
      <MemoryRouter initialEntries={["/app/businesses/biz-1/components"]}>
        <Routes>
          <Route path="/app/businesses/:businessId/components" element={<ComponentsDependencies />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText(/Simulation Controls/i)).toBeInTheDocument();
    expect(screen.getByText(/Service Continuity/i)).toBeInTheDocument();
    expect(screen.getByText(/Unrecovered Exposure/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /2D Flow Studio/i })).toBeInTheDocument();
  });
});

