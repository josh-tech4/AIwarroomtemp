import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowLeft, Bot, CheckSquare, Medal, Shield, Trophy, Zap } from "lucide-react";
import { apiClient, extractApiError } from "../../api/client";
import { Alert, Badge, Button, Card, CardHeader, LoadingState, SectionHeader } from "../../components/ui";
import type { StrategyComparisonResponse } from "../../types/api";
import { formatValue } from "../../utils/formatters";

const RANK_ICONS = [
  <Trophy key={1} className="h-4 w-4 text-warning-400" />,
  <Medal key={2} className="h-4 w-4 text-surface-300" />,
  <Shield key={3} className="h-4 w-4 text-surface-400" />,
];

export function StrategyComparison() {
  const { runId } = useParams<{ runId: string }>();
  const [data, setData] = useState<StrategyComparisonResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadComparison = useCallback(async () => {
    if (!runId) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await apiClient.get<StrategyComparisonResponse>(`/simulation/runs/${runId}/strategies/`);
      setData(resp.data);
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    void loadComparison();
  }, [loadComparison]);

  const metricKeys = useMemo(() => {
    if (!data?.strategies.length) return [];
    return data.strategies[0].metrics.map((m) => ({
      key: m.metric_key,
      label: m.label,
      unit: m.unit,
    }));
  }, [data]);

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.strategies.map((s) => {
      const getVal = (k: string) => Number(s.metrics.find((m) => m.metric_key === k)?.value_numeric || 0);
      if (data.module === "resilience") {
        return {
          name: s.strategy_name,
          "Recovered Value": getVal("recovered_transaction_value"),
          "Unrecovered Value": getVal("estimated_unrecovered_transaction_value"),
          "Mitigation Cost": getVal("incremental_mitigation_cost"),
        };
      }
      return {
        name: s.strategy_name,
        "Gross Sales": getVal("gross_sales"),
        "Operating Result": getVal("operating_result"),
      };
    });
  }, [data]);

  if (loading) return <LoadingState label="Comparing evaluated strategies..." />;
  if (error) return <Alert variant="error">{error}</Alert>;
  if (!data) return <Alert variant="warning">Comparison data unavailable.</Alert>;

  return (
    <div className="space-y-6">
      <div>
        <Link
          to={`/app/simulation/runs/${runId}`}
          className="inline-flex items-center gap-1.5 text-xs text-surface-400 hover:text-white mb-2"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Run Summary
        </Link>

        <SectionHeader
          tag={`${data.engine_key} v${data.engine_version} · ${data.currency}`}
          title={`Strategy Comparison — ${data.scenario_name}`}
          action={
            <div className="flex items-center gap-2">
              <Link to={`/app/ai-analyst/${runId}`}>
                <Button variant="outline" size="sm">
                  <Bot className="h-3.5 w-3.5" /> Interpret with AI
                </Button>
              </Link>
              <Link to={`/app/decisions?run=${runId}`}>
                <Button size="sm">
                  <CheckSquare className="h-3.5 w-3.5" /> Record Human Decision
                </Button>
              </Link>
            </div>
          }
        />
      </div>

      {data.module === "resilience" && (
        <Alert variant="warning" title="Affected Value vs. Actual Revenue Loss (§7.1)">
          Affected transaction value is gross order exposure during the outage — NOT automatic revenue loss.
          Compare recovered value, unrecovered value, and incremental cost side-by-side before recording a decision.
        </Alert>
      )}

      {/* Ranked Strategy Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.strategies.map((s, i) => (
          <Card
            key={s.strategy_id}
            className={`p-4 flex flex-col justify-between ${
              s.rank === 1 ? "border-warning-500/50" : ""
            }`}
          >
            <div>
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-surface-800">
                <div className="flex items-center gap-2">
                  {RANK_ICONS[i] || null}
                  <Badge variant={s.rank === 1 ? "warning" : "neutral"}>Rank #{s.rank}</Badge>
                </div>
                <span className="font-mono text-[10px] text-surface-500">{s.strategy_key}</span>
              </div>
              <h3 className="mt-3 text-sm font-semibold text-white">{s.strategy_name}</h3>
              {s.description && <p className="mt-1 text-xs text-surface-400">{s.description}</p>}
              <div className="mt-4 space-y-1.5 border-t border-surface-800 pt-3">
                {s.metrics.slice(0, 4).map((m) => (
                  <div key={m.metric_key} className="flex items-center justify-between text-xs">
                    <span className="text-surface-400 truncate">{m.label}</span>
                    <span className="font-mono font-semibold text-white ml-2 shrink-0">
                      {formatValue(m.value_numeric, m.unit)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {s.warnings.length > 0 && (
              <div className="mt-3 pt-2 border-t border-surface-800 space-y-1">
                {s.warnings.slice(0, 2).map((w, wi) => (
                  <p key={wi} className="text-[11px] text-warning-300 flex items-start gap-1">
                    <Zap className="h-3 w-3 shrink-0 mt-0.5" />
                    <span>{w}</span>
                  </p>
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>

      {/* Chart */}
      <Card>
        <CardHeader
          title="Visual Strategy Trade-Off Comparison"
          subtitle={`Identical baseline snapshot across strategies (${data.currency})`}
          icon={<Zap className="h-3.5 w-3.5" />}
        />
        <div className="p-4 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`} />
              <Tooltip formatter={(value: number) => [value.toLocaleString("en-IN"), ""]} />
              <Legend />
              {data.module === "resilience" ? (
                <>
                  <Bar dataKey="Recovered Value" fill="#10b981" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Unrecovered Value" fill="#ef4444" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Mitigation Cost" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                </>
              ) : (
                <>
                  <Bar dataKey="Gross Sales" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Operating Result" fill="#10b981" radius={[3, 3, 0, 0]} />
                </>
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Full Metrics Matrix */}
      <Card>
        <CardHeader
          title="Normalized Strategy Metrics Matrix"
          subtitle="Uniform metric keys evaluated side-by-side"
        />
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Metric</th>
                {data.strategies.map((s) => (
                  <th key={s.strategy_id}>
                    <span className="flex items-center gap-1.5">
                      <span>{s.strategy_name}</span>
                      <Badge variant={s.rank === 1 ? "warning" : "neutral"}>#{s.rank}</Badge>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metricKeys.map((mk) => (
                <tr key={mk.key}>
                  <td>
                    <p className="text-xs font-medium text-surface-100">{mk.label}</p>
                    <p className="text-[10px] font-mono text-surface-500">{mk.key}</p>
                  </td>
                  {data.strategies.map((s) => {
                    const m = s.metrics.find((item) => item.metric_key === mk.key);
                    return (
                      <td key={s.strategy_id} className="font-mono text-xs font-semibold text-white">
                        {formatValue(m?.value_numeric, m?.unit)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
