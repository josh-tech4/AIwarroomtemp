import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowLeft,
  Bot,
  CheckSquare,
  FileText,
  GitCompare,
  History,
  Info,
  RefreshCw,
  Sliders,
  Zap,
} from "lucide-react";
import { apiClient, extractApiError } from "../../api/client";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  LoadingState,
  MetricCard,
} from "../../components/ui";
import type { PaginatedResponse, RunComparisonResponse, SimulationRun } from "../../types/api";
import { formatValue, sourceTypeBadge } from "../../utils/formatters";

const CHART_COLORS = ["#3b82f6", "#06b6d4", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444"];

export function SimulationResults() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();

  const [run, setRun] = useState<SimulationRun | null>(null);
  const [otherRuns, setOtherRuns] = useState<SimulationRun[]>([]);
  const [compareRunId, setCompareRunId] = useState("");
  const [runDiff, setRunDiff] = useState<RunComparisonResponse | null>(null);
  const [comparing, setComparing] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creatingReport, setCreatingReport] = useState(false);
  const [sensitivityDelta, setSensitivityDelta] = useState(0);

  const loadRun = useCallback(async () => {
    if (!runId) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await apiClient.get<SimulationRun>(`/simulation/runs/${runId}/`);
      setRun(resp.data);

      // Load sibling completed runs on same business for FR-020 comparison
      if (resp.data?.business) {
        const listResp = await apiClient
          .get<PaginatedResponse<SimulationRun>>("/simulation/runs/", {
            params: { business: resp.data.business },
          })
          .catch(() => null);
        const candidates = (listResp?.data?.results || []).filter(
          (r) => r.id !== resp.data.id && r.status === "completed"
        );
        setOtherRuns(candidates);
        if (candidates.length > 0) setCompareRunId(candidates[0].id);
      }
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    void loadRun();
  }, [loadRun]);

  const baselineMetrics = useMemo(
    () => (run?.results || []).filter((r) => r.is_baseline),
    [run]
  );
  const scenarioMetrics = useMemo(
    () => (run?.results || []).filter((r) => !r.is_baseline),
    [run]
  );

  // §12.5 One-variable-at-a-time sensitivity preview (non-persistent visual exploration)
  const sensitivityData = useMemo(() => {
    if (!run || run.module !== "idea") return null;
    const getAssump = (k: string) =>
      Number(run.assumptions_used.find((a) => a.key === k)?.value || 0);
    const orders = getAssump("orders_per_month");
    const aov = getAssump("avg_order_value");
    const varCost = getAssump("variable_cost_per_order");
    const fixedCosts = getAssump("fixed_monthly_costs");
    const mkt = getAssump("marketing_spend");
    if (!orders || !aov) return null;

    const points = [-40, -20, -10, 0, 10, 20, 40].map((pct) => {
      const adjOrders = orders * (1 + pct / 100);
      const opResult = adjOrders * (aov - varCost) - fixedCosts - mkt;
      return { shock: `${pct >= 0 ? "+" : ""}${pct}%`, operatingResult: Math.round(opResult) };
    });
    const currentOrders = orders * (1 + sensitivityDelta / 100);
    const currentOpResult = Math.round(currentOrders * (aov - varCost) - fixedCosts - mkt);
    const currentSales = Math.round(currentOrders * aov);
    return { points, currentOrders: Math.round(currentOrders), currentOpResult, currentSales };
  }, [run, sensitivityDelta]);

  const chartData = useMemo(() => {
    if (!run) return [];
    if (run.module === "idea") {
      const findVal = (arr: typeof baselineMetrics, key: string) =>
        Number(arr.find((m) => m.metric_key === key)?.value_numeric || 0);
      return [
        { name: "Gross Sales", Baseline: findVal(baselineMetrics, "baseline_gross_sales"), Scenario: findVal(scenarioMetrics, "gross_sales") },
        { name: "Var. Costs", Baseline: findVal(baselineMetrics, "baseline_variable_costs"), Scenario: findVal(scenarioMetrics, "variable_costs") },
        { name: "Contribution", Baseline: findVal(baselineMetrics, "baseline_contribution"), Scenario: findVal(scenarioMetrics, "contribution") },
        { name: "Op. Result", Baseline: findVal(baselineMetrics, "baseline_operating_result"), Scenario: findVal(scenarioMetrics, "operating_result") },
      ];
    }
    return scenarioMetrics.map((m) => ({ name: m.label, Value: Number(m.value_numeric) }));
  }, [run, baselineMetrics, scenarioMetrics]);

  const handleCompareRuns = async () => {
    if (!run || !compareRunId) return;
    setComparing(true);
    setError(null);
    try {
      const resp = await apiClient.post<RunComparisonResponse>(`/simulation/runs/${run.id}/compare/`, {
        compare_with_run_id: compareRunId,
      });
      setRunDiff(resp.data);
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setComparing(false);
    }
  };

  const handleGenerateReport = async () => {
    if (!run) return;
    setCreatingReport(true);
    try {
      const resp = await apiClient.post<{ id: string }>("/reports/", {
        business: run.business,
        run: run.id,
        title: `${run.scenario_name} – Simulation Report`,
        report_type: run.module === "resilience" ? "resilience_assessment" : "simulation_summary",
      });
      navigate(`/app/reports/${resp.data.id}`);
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setCreatingReport(false);
    }
  };

  if (loading) return <LoadingState label="Loading simulation results..." />;
  if (error) return <Alert variant="error">{error}</Alert>;
  if (!run) return <Alert variant="warning">Simulation run not found.</Alert>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="panel p-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            to={`/app/businesses/${run.business}`}
            className="inline-flex items-center gap-1.5 text-xs text-surface-400 hover:text-white mb-2"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to {run.business_name}
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold text-white">{run.scenario_name}</h1>
            <Badge variant={run.status === "completed" ? "success" : "danger"} dot>
              {run.status}
            </Badge>
            <Badge variant="neutral" className="font-mono text-[10px]">
              {run.engine_key} v{run.engine_version}
            </Badge>
          </div>
          <p className="mt-1 text-[11px] text-surface-500 font-mono">
            RUN {run.id} · {run.currency} · {new Date(run.created_at).toLocaleString()}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link to={`/app/scenarios/${run.scenario}/config`}>
            <Button variant="outline" size="sm">
              <RefreshCw className="h-3.5 w-3.5" /> Edit & Rerun
            </Button>
          </Link>
          <Link to={`/app/simulation/runs/${run.id}/compare`}>
            <Button variant="outline" size="sm">
              <GitCompare className="h-3.5 w-3.5" /> Strategy Matrix
            </Button>
          </Link>
          <Link to={`/app/ai-analyst/${run.id}`}>
            <Button size="sm">
              <Bot className="h-3.5 w-3.5" /> AI Analyst
            </Button>
          </Link>
          <Link to={`/app/decisions?business=${run.business}&run=${run.id}`}>
            <Button variant="secondary" size="sm">
              <CheckSquare className="h-3.5 w-3.5" /> Record Decision
            </Button>
          </Link>
          <Button variant="outline" size="sm" onClick={handleGenerateReport} loading={creatingReport}>
            <FileText className="h-3.5 w-3.5" /> Report
          </Button>
        </div>
      </div>

      <Alert variant="info" title="Model Estimates Notice">
        Figures below are deterministic calculations from your frozen input snapshot and declared assumptions — not guaranteed forecasts.
      </Alert>

      {run.warnings.length > 0 && (
        <Alert variant="warning" title="Model Warnings">
          <ul className="list-disc pl-4 space-y-0.5 mt-0.5">
            {run.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </Alert>
      )}

      {/* Scorecard */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {scenarioMetrics.slice(0, 4).map((m) => (
          <MetricCard
            key={m.id}
            label={m.label}
            value={formatValue(m.value_numeric, m.unit)}
            accent={m.category === "financial" ? "brand" : "accent"}
          />
        ))}
      </div>

      {/* Chart + Metric Table */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title={run.module === "idea" ? "Baseline vs Scenario Comparison" : "Scenario Exposure Metrics"}
            subtitle={`Values in ${run.currency}`}
            icon={<Zap className="h-3.5 w-3.5" />}
          />
          <div className="p-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`} />
                <Tooltip formatter={(value: number) => [value.toLocaleString("en-IN"), ""]} />
                <Legend />
                {run.module === "idea" ? (
                  <>
                    <Bar dataKey="Baseline" fill="#475569" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Scenario" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                  </>
                ) : (
                  <Bar dataKey="Value" radius={[3, 3, 0, 0]}>
                    {chartData.map((_, idx) => (
                      <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="All Scenario Metrics"
            subtitle={`${scenarioMetrics.length} persisted outputs`}
            icon={<Info className="h-3.5 w-3.5" />}
          />
          <div className="divide-y divide-surface-800 max-h-64 overflow-y-auto">
            {scenarioMetrics.map((m) => (
              <div key={m.id} className="flex items-start justify-between gap-4 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-surface-100">{m.label}</p>
                  <p className="text-[11px] font-mono text-surface-500">{m.metric_key}</p>
                  {m.formula_note && <p className="text-[10px] text-surface-500 mt-0.5">{m.formula_note}</p>}
                </div>
                <p className="font-mono text-xs font-semibold text-white whitespace-nowrap">
                  {formatValue(m.value_numeric, m.unit)}
                </p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Baseline Reference */}
      {baselineMetrics.length > 0 && (
        <Card>
          <CardHeader title="Baseline Reference" subtitle="Unmodified baseline values prior to scenario shocks" />
          <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
            {baselineMetrics.map((m) => (
              <div key={m.id} className="rounded border border-surface-800 bg-surface-950/60 p-3">
                <p className="text-[11px] text-surface-400">{m.label}</p>
                <p className="mt-1 font-mono text-sm font-semibold text-white">
                  {formatValue(m.value_numeric, m.unit)}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* FR-020: Compare With Prior Run */}
      {otherRuns.length > 0 && (
        <Card>
          <CardHeader
            title="Compare Against Prior Simulation Run (FR-020)"
            subtitle="Track how changed assumptions alter modeled outputs across historical snapshots"
            icon={<History className="h-3.5 w-3.5" />}
            action={
              <div className="flex items-center gap-2">
                <select
                  value={compareRunId}
                  onChange={(e) => setCompareRunId(e.target.value)}
                  className="field !py-1 !w-auto text-xs"
                >
                  {otherRuns.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.scenario_name} ({new Date(r.created_at).toLocaleDateString()})
                    </option>
                  ))}
                </select>
                <Button size="xs" onClick={handleCompareRuns} loading={comparing}>
                  Compare Runs
                </Button>
              </div>
            }
          />
          {runDiff && (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th>Current ({runDiff.run_a.scenario_name})</th>
                    <th>Prior ({runDiff.run_b.scenario_name})</th>
                    <th>Delta</th>
                  </tr>
                </thead>
                <tbody>
                  {runDiff.metric_diffs.map((d) => (
                    <tr key={d.metric_key}>
                      <td>
                        <p className="text-xs font-medium text-surface-100">{d.label}</p>
                        <p className="text-[10px] font-mono text-surface-500">{d.metric_key}</p>
                      </td>
                      <td className="font-mono text-xs">{formatValue(d.run_a_value, d.unit)}</td>
                      <td className="font-mono text-xs text-surface-400">{formatValue(d.run_b_value, d.unit)}</td>
                      <td className="font-mono text-xs font-semibold">
                        {d.delta !== null ? (
                          <span className={Number(d.delta) > 0 ? "text-success-400" : Number(d.delta) < 0 ? "text-danger-400" : "text-surface-400"}>
                            {Number(d.delta) > 0 ? "+" : ""}{d.delta} {d.pct_change ? `(${d.pct_change}%)` : ""}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* §12.5 Interactive Demand Sensitivity Explorer */}
      {sensitivityData && (
        <Card>
          <CardHeader
            title="One-Variable Sensitivity Explorer (§12.5)"
            subtitle="Interactive visual preview — rerun scenario to persist a new snapshot"
            icon={<Sliders className="h-3.5 w-3.5" />}
          />
          <div className="grid gap-6 p-4 lg:grid-cols-5 items-center">
            <div className="lg:col-span-2 space-y-4">
              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-surface-300">Demand / Orders Shock</span>
                  <span className="font-mono font-semibold text-brand-400">
                    {sensitivityDelta >= 0 ? "+" : ""}{sensitivityDelta}%
                  </span>
                </div>
                <input
                  type="range"
                  min={-50}
                  max={50}
                  step={5}
                  value={sensitivityDelta}
                  onChange={(e) => setSensitivityDelta(Number(e.target.value))}
                  className="studio-slider w-full"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded border border-surface-800 bg-surface-950/60 p-3">
                  <p className="text-[11px] text-surface-400">Est. Sales</p>
                  <p className="mt-1 font-mono text-xs font-semibold text-white">
                    {formatValue(sensitivityData.currentSales, run.currency)}
                  </p>
                </div>
                <div className="rounded border border-surface-800 bg-surface-950/60 p-3">
                  <p className="text-[11px] text-surface-400">Est. Op. Result</p>
                  <p className={`mt-1 font-mono text-xs font-semibold ${sensitivityData.currentOpResult >= 0 ? "text-success-400" : "text-danger-400"}`}>
                    {formatValue(sensitivityData.currentOpResult, run.currency)}
                  </p>
                </div>
              </div>
            </div>
            <div className="lg:col-span-3 h-44">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={sensitivityData.points}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="shock" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`} />
                  <Tooltip formatter={(value: number) => [value.toLocaleString("en-IN"), "Operating Result"]} />
                  <Area type="monotone" dataKey="operatingResult" stroke="#3b82f6" strokeWidth={2} fill="rgba(59,130,246,0.18)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </Card>
      )}

      {/* Frozen Snapshot */}
      <Card>
        <CardHeader
          title="Frozen Input Snapshot — Assumptions Used"
          subtitle="Immutable audit record — later edits to the business profile never mutate this run"
        />
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          {run.assumptions_used.map((a) => {
            const badge = sourceTypeBadge(a.source_type);
            return (
              <div key={a.key} className="rounded border border-surface-800 bg-surface-950/60 p-3">
                <p className="text-[11px] font-mono text-surface-400">{a.key}</p>
                <p className="mt-1 font-mono text-sm font-semibold text-white">
                  {formatValue(a.value, a.unit)}
                </p>
                <span className={`chip border text-[10px] mt-2 ${badge.className}`}>{badge.label}</span>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
