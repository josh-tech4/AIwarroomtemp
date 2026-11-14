import React, { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, CheckCircle2, CheckSquare, Plus, ShieldAlert, XCircle } from "lucide-react";
import { apiClient, extractApiError } from "../../api/client";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  LoadingState,
  SectionHeader,
} from "../../components/ui";
import type {
  AIAnalysis,
  BusinessProfile,
  Decision,
  PaginatedResponse,
  SimulationRun,
  StrategyComparisonResponse,
} from "../../types/api";
import { formatValue } from "../../utils/formatters";

export function DecisionsListPage() {
  const [searchParams] = useSearchParams();
  const initialBiz = searchParams.get("business") || "";
  const initialRun = searchParams.get("run") || "";

  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [businesses, setBusinesses] = useState<BusinessProfile[]>([]);
  const [runs, setRuns] = useState<SimulationRun[]>([]);
  const [strategyData, setStrategyData] = useState<StrategyComparisonResponse | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);

  const [businessId, setBusinessId] = useState(initialBiz);
  const [runId, setRunId] = useState(initialRun);
  const [title, setTitle] = useState("");
  const [strategyKey, setStrategyKey] = useState("");
  const [rationale, setRationale] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dResp, bResp, rResp] = await Promise.all([
        apiClient.get<PaginatedResponse<Decision>>("/decisions/"),
        apiClient.get<PaginatedResponse<BusinessProfile>>("/businesses/"),
        apiClient.get<PaginatedResponse<SimulationRun>>("/simulation/runs/"),
      ]);
      setDecisions(dResp.data.results || []);
      const bList = bResp.data.results || [];
      setBusinesses(bList);
      setRuns((rResp.data.results || []).filter((r) => r.status === "completed"));
      if (!businessId && bList.length > 0) setBusinessId(bList[0].id);
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Spec §13.7: Show evidence, strategies, and AI limitations before user records decision
  useEffect(() => {
    if (!runId) {
      setStrategyData(null);
      setAiAnalysis(null);
      return;
    }
    let cancelled = false;
    Promise.all([
      apiClient.get<StrategyComparisonResponse>(`/simulation/runs/${runId}/strategies/`).catch(() => null),
      apiClient.get<AIAnalysis>(`/simulation-runs/${runId}/analysis/`).catch(() => null),
    ]).then(([sResp, aResp]) => {
      if (cancelled) return;
      if (sResp?.data) {
        setStrategyData(sResp.data);
        if (!strategyKey && sResp.data.strategies.length > 0) {
          setStrategyKey(sResp.data.strategies[0].strategy_key);
        }
      }
      if (aResp?.data) setAiAnalysis(aResp.data);
    });
    return () => {
      cancelled = true;
    };
  }, [runId, strategyKey]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId) return;
    setSaving(true);
    setError(null);
    try {
      await apiClient.post("/decisions/", {
        business: businessId,
        run: runId || null,
        title,
        selected_strategy_key: strategyKey,
        rationale,
      });
      setTitle("");
      setStrategyKey("");
      setRationale("");
      await loadData();
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleStatusAction = async (id: string, action: "approve" | "reject") => {
    try {
      await apiClient.post(`/decisions/${id}/${action}/`);
      await loadData();
    } catch (err) {
      setError(extractApiError(err));
    }
  };

  if (loading) return <LoadingState label="Loading human decision ledger..." />;

  const businessRuns = runs.filter((r) => !businessId || r.business === businessId);

  return (
    <div className="space-y-6">
      <SectionHeader
        tag="Human-in-the-Loop Governance (§13.7)"
        title="Decisions & Action Ownership"
        subtitle="AI advises only — a human owner selects a strategy after inspecting calculated evidence & limitations."
      />

      {error && (
        <Alert variant="error" dismissible onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Decision Form */}
        <div className="lg:col-span-7">
          <Card>
            <CardHeader title="Record New Business Decision" icon={<Plus className="h-3.5 w-3.5" />} />
            <form onSubmit={handleCreate} className="grid gap-4 p-5 sm:grid-cols-2">
              <div>
                <label className="field-label">Business Profile</label>
                <select value={businessId} onChange={(e) => setBusinessId(e.target.value)} className="field text-xs">
                  {businesses.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label">Linked Simulation Run</label>
                <select value={runId} onChange={(e) => setRunId(e.target.value)} className="field text-xs">
                  <option value="">No specific run linked</option>
                  {businessRuns.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.scenario_name} ({new Date(r.created_at).toLocaleDateString()})
                    </option>
                  ))}
                </select>
              </div>

              {strategyData && strategyData.strategies.length > 0 ? (
                <div className="sm:col-span-2">
                  <label className="field-label">Select Strategy to Adopt</label>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {strategyData.strategies.map((st) => (
                      <button
                        key={st.strategy_key}
                        type="button"
                        onClick={() => setStrategyKey(st.strategy_key)}
                        className={`rounded-md border p-2.5 text-left transition-colors ${
                          strategyKey === st.strategy_key
                            ? "border-brand-500 bg-brand-600/15 text-white"
                            : "border-surface-700 bg-surface-950 text-surface-300 hover:border-surface-600"
                        }`}
                      >
                        <div className="flex items-center justify-between text-[10px] font-mono">
                          <span>#{st.rank}</span>
                          <span>{st.strategy_key}</span>
                        </div>
                        <p className="mt-1 text-xs font-semibold truncate">{st.strategy_name}</p>
                        {st.metrics[0] && (
                          <p className="mt-1 text-[11px] font-mono text-surface-400">
                            {formatValue(st.metrics[0].value_numeric, st.metrics[0].unit)}
                          </p>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="sm:col-span-2">
                  <label className="field-label">Selected Strategy Key (optional)</label>
                  <input
                    type="text"
                    value={strategyKey}
                    onChange={(e) => setStrategyKey(e.target.value)}
                    placeholder="e.g. failover or lean_marketing_cut"
                    className="field text-xs font-mono"
                  />
                </div>
              )}

              <div className="sm:col-span-2">
                <label className="field-label">Decision Title</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Implement automated backup payment gateway failover"
                  className="field text-xs"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="field-label">Human Decision Rationale</label>
                <textarea
                  rows={3}
                  value={rationale}
                  onChange={(e) => setRationale(e.target.value)}
                  placeholder="Summarize key evidence, risk appetite, and trade-offs..."
                  className="field resize-none text-xs"
                />
              </div>
              <div className="sm:col-span-2 flex justify-end">
                <Button type="submit" size="sm" disabled={saving || !businessId} loading={saving}>
                  <Plus className="h-3.5 w-3.5" /> Save Decision Draft
                </Button>
              </div>
            </form>
          </Card>
        </div>

        {/* §13.7 Evidence & Limitations Side Panel */}
        <div className="lg:col-span-5">
          <Card className="h-full">
            <CardHeader
              title="Linked Evidence & Limitations (§13.7)"
              subtitle="Inspect before approving a decision"
              icon={<ShieldAlert className="h-3.5 w-3.5" />}
            />
            <div className="p-4 text-xs space-y-3">
              {!runId ? (
                <p className="text-surface-500">
                  Link a completed simulation run on the left to review strategy metrics, AI rationale, and model limitations inline.
                </p>
              ) : (
                <>
                  {aiAnalysis?.structured_output ? (
                    <>
                      <div>
                        <p className="section-heading mb-1">AI Executive Context</p>
                        <p className="text-surface-200 leading-relaxed">
                          {aiAnalysis.structured_output.executive_summary}
                        </p>
                      </div>
                      <div className="rounded border border-warning-500/30 bg-warning-500/10 p-3">
                        <p className="font-semibold text-warning-400 mb-1">Declared Model Limitations</p>
                        <ul className="list-disc pl-4 space-y-0.5 text-surface-300">
                          {aiAnalysis.structured_output.limitations.map((l, idx) => (
                            <li key={idx}>{l}</li>
                          ))}
                        </ul>
                      </div>
                    </>
                  ) : (
                    <p className="text-surface-400">
                      Strategy comparison loaded ({strategyData?.strategies.length || 0} options). You can also generate an AI Analyst review from the run page.
                    </p>
                  )}
                </>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Decisions List */}
      {decisions.length === 0 ? (
        <EmptyState
          title="No decisions recorded yet"
          description="Record a human decision above after evaluating strategy outcomes."
          icon={<CheckSquare className="h-5 w-5" />}
        />
      ) : (
        <div className="space-y-3">
          {decisions.map((d) => (
            <Card key={d.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold text-white">{d.title}</h2>
                    <Badge variant={d.status === "approved" ? "success" : d.status === "rejected" ? "danger" : "warning"} dot>
                      {d.status}
                    </Badge>
                    {d.selected_strategy_key && <Badge variant="brand">Strategy: {d.selected_strategy_key}</Badge>}
                  </div>
                  <p className="mt-1 text-[11px] font-mono text-surface-500">
                    {d.business_name} · {d.actions.length} action item(s)
                  </p>
                  {d.rationale && <p className="mt-2 text-xs text-surface-300">{d.rationale}</p>}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {d.status === "draft" && (
                    <>
                      <Button size="xs" variant="outline" onClick={() => void handleStatusAction(d.id, "approve")}>
                        <CheckCircle2 className="h-3.5 w-3.5 text-success-400" /> Approve
                      </Button>
                      <Button size="xs" variant="outline" onClick={() => void handleStatusAction(d.id, "reject")}>
                        <XCircle className="h-3.5 w-3.5 text-danger-400" /> Reject
                      </Button>
                    </>
                  )}
                  <Link to={`/app/decisions/${d.id}`}>
                    <Button size="xs">
                      Manage Actions <ArrowRight className="h-3 w-3" />
                    </Button>
                  </Link>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
