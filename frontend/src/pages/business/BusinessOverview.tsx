import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Box,
  CheckCircle2,
  Copy,
  Edit3,
  FlaskConical,
  Layers,
  Play,
  Plus,
  Sliders,
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
  SegmentGauge,
} from "../../components/ui";
import type {
  BusinessAssumption,
  BusinessComponent,
  BusinessProfile,
  BusinessReadiness,
  BusinessStage,
  PaginatedResponse,
  Scenario,
  SimulationRun,
} from "../../types/api";
import { formatValue, sourceTypeBadge } from "../../utils/formatters";

export function BusinessOverview() {
  const { businessId } = useParams<{ businessId: string }>();
  const navigate = useNavigate();

  const [business, setBusiness] = useState<BusinessProfile | null>(null);
  const [readiness, setReadiness] = useState<BusinessReadiness | null>(null);
  const [assumptions, setAssumptions] = useState<BusinessAssumption[]>([]);
  const [components, setComponents] = useState<BusinessComponent[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [runs, setRuns] = useState<SimulationRun[]>([]);

  const [loading, setLoading] = useState(true);
  const [duplicating, setDuplicating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editStage, setEditStage] = useState<BusinessStage>("idea");
  const [editQuality, setEditQuality] = useState<"draft" | "reviewed" | "verified_subset">("draft");
  const [editLocation, setEditLocation] = useState("");
  const [editDesc, setEditDesc] = useState("");

  const loadAll = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    setError(null);
    try {
      const [bResp, readyResp, aResp, cResp, sResp, rResp] = await Promise.all([
        apiClient.get<BusinessProfile>(`/businesses/${businessId}/`),
        apiClient.get<BusinessReadiness>(`/businesses/${businessId}/readiness/`),
        apiClient.get<PaginatedResponse<BusinessAssumption>>(`/businesses/${businessId}/assumptions/`),
        apiClient.get<PaginatedResponse<BusinessComponent>>(`/businesses/${businessId}/components/`),
        apiClient.get<PaginatedResponse<Scenario>>("/scenarios/", { params: { business: businessId } }),
        apiClient.get<PaginatedResponse<SimulationRun>>("/simulation/runs/", { params: { business: businessId } }),
      ]);
      const b = bResp.data;
      setBusiness(b);
      setReadiness(readyResp.data);
      setAssumptions(aResp.data.results || []);
      setComponents(cResp.data.results || []);
      setScenarios(sResp.data.results || []);
      setRuns(rResp.data.results || []);

      setEditStage(b.stage);
      setEditQuality(b.data_quality);
      setEditLocation(b.location || "");
      setEditDesc(b.description || "");
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleDuplicate = async () => {
    if (!business) return;
    setDuplicating(true);
    setError(null);
    try {
      const resp = await apiClient.post<{ id: string }>(`/businesses/${business.id}/duplicate/`);
      navigate(`/app/businesses/${resp.data.id}`);
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setDuplicating(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!business) return;
    setSavingProfile(true);
    setError(null);
    try {
      await apiClient.patch(`/businesses/${business.id}/`, {
        stage: editStage,
        data_quality: editQuality,
        location: editLocation,
        description: editDesc,
      });
      setEditing(false);
      await loadAll();
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setSavingProfile(false);
    }
  };

  if (loading) return <LoadingState label="Loading business profile..." />;
  if (error) return <Alert variant="error">{error}</Alert>;
  if (!business) return <Alert variant="warning">Business profile not found.</Alert>;

  const completedRuns = runs.filter((r) => r.status === "completed").length;

  return (
    <div className="space-y-6">
      {/* Precision Header Banner */}
      <div className="panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="brand" dot>{business.stage}</Badge>
              <Badge variant="neutral">{business.currency}</Badge>
              <Badge variant={business.data_quality === "verified_subset" ? "success" : "info"}>
                Quality: {business.data_quality.replace("_", " ")}
              </Badge>
              {business.is_demo && <Badge variant="warning">Illustrative Demo</Badge>}
            </div>
            <h1 className="text-xl font-semibold text-white">{business.name}</h1>
            <p className="text-xs text-surface-400 max-w-2xl">
              {business.description || "No description recorded."}
            </p>
            <div className="flex flex-wrap items-center gap-4 pt-1 text-[11px] font-mono text-surface-500">
              <span>INDUSTRY: {business.industry.toUpperCase()}</span>
              {business.location && <span>LOCATION: {business.location.toUpperCase()}</span>}
              {business.baseline_date && <span>BASELINE: {business.baseline_date}</span>}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing((v) => !v)}>
              <Edit3 className="h-3.5 w-3.5" /> {editing ? "Cancel Edit" : "Edit Profile"}
            </Button>
            <Button variant="outline" size="sm" onClick={handleDuplicate} loading={duplicating}>
              <Copy className="h-3.5 w-3.5" /> Duplicate Model
            </Button>
            <Link to={`/app/businesses/${business.id}/components`}>
              <Button variant="outline" size="sm">
                <Box className="h-3.5 w-3.5" /> 3D Spatial Twin
              </Button>
            </Link>
            <Link to={`/app/scenarios?business=${business.id}`}>
              <Button size="sm">
                <FlaskConical className="h-3.5 w-3.5" /> Scenarios
              </Button>
            </Link>
          </div>
        </div>

        {/* Inline Edit Drawer */}
        {editing && (
          <form onSubmit={handleSaveProfile} className="mt-4 pt-4 border-t border-surface-800 grid gap-3 sm:grid-cols-4">
            <div>
              <label className="field-label">Lifecycle Stage</label>
              <select value={editStage} onChange={(e) => setEditStage(e.target.value as BusinessStage)} className="field text-xs">
                <option value="idea">Idea</option>
                <option value="planning">Planning</option>
                <option value="pilot">Pilot</option>
                <option value="operating">Operating</option>
              </select>
            </div>
            <div>
              <label className="field-label">Data Quality (§10.1)</label>
              <select
                value={editQuality}
                onChange={(e) => setEditQuality(e.target.value as "draft" | "reviewed" | "verified_subset")}
                className="field text-xs"
              >
                <option value="draft">Draft</option>
                <option value="reviewed">Reviewed</option>
                <option value="verified_subset">Verified Subset</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="field-label">Location</label>
              <input type="text" value={editLocation} onChange={(e) => setEditLocation(e.target.value)} className="field text-xs" />
            </div>
            <div className="sm:col-span-3">
              <label className="field-label">Description</label>
              <input type="text" value={editDesc} onChange={(e) => setEditDesc(e.target.value)} className="field text-xs" />
            </div>
            <div className="flex items-end justify-end">
              <Button type="submit" size="sm" loading={savingProfile}>Save Metadata</Button>
            </div>
          </form>
        )}
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="Assumptions" value={assumptions.length} icon={<Layers className="h-4 w-4" />} accent="brand" />
        <MetricCard label="Components" value={components.length} icon={<Box className="h-4 w-4" />} accent="accent" />
        <MetricCard label="Scenarios" value={scenarios.length} icon={<FlaskConical className="h-4 w-4" />} accent="warning" />
        <MetricCard label="Completed Runs" value={completedRuns} icon={<CheckCircle2 className="h-4 w-4" />} accent="success" />
      </div>

      {/* Readiness & Model Validation Panel (Spec §5.2 Step 4) */}
      {readiness && (
        <Card>
          <CardHeader
            title="Model Readiness & Validation Checks (§5.2)"
            subtitle="Automated checks for required variables, unit consistency, and fallback dependencies"
            icon={<Sliders className="h-3.5 w-3.5" />}
            action={
              <div className="flex items-center gap-3">
                <div className="w-28">
                  <SegmentGauge
                    percent={readiness.completeness_pct}
                    color={readiness.completeness_pct >= 80 ? "success" : "warning"}
                  />
                </div>
                <span className="font-mono text-xs font-semibold text-white">
                  {readiness.completeness_pct}% Ready
                </span>
              </div>
            }
          />
          <div className="p-4 grid gap-4 md:grid-cols-3 text-xs">
            <div className="rounded-md border border-surface-800 bg-surface-950/60 p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-semibold text-surface-200">Business Idea Module</span>
                <Badge variant={readiness.idea_ready ? "success" : "warning"}>
                  {readiness.idea_ready ? "Ready" : "Incomplete"}
                </Badge>
              </div>
              {readiness.missing_idea_keys.length > 0 ? (
                <p className="text-warning-300 font-mono text-[11px]">
                  Missing: {readiness.missing_idea_keys.join(", ")}
                </p>
              ) : (
                <p className="text-surface-400">All 5 unit-economic keys present.</p>
              )}
            </div>

            <div className="rounded-md border border-surface-800 bg-surface-950/60 p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-semibold text-surface-200">Resilience Module</span>
                <Badge variant={readiness.resilience_ready ? "success" : "warning"}>
                  {readiness.resilience_ready ? "Ready" : "Incomplete"}
                </Badge>
              </div>
              {readiness.missing_resilience_keys.length > 0 ? (
                <p className="text-warning-300 font-mono text-[11px]">
                  Missing: {readiness.missing_resilience_keys.join(", ")}
                </p>
              ) : (
                <p className="text-surface-400">
                  {readiness.components_count} components · {readiness.dependencies_count} dependencies mapped.
                </p>
              )}
            </div>

            <div className="rounded-md border border-surface-800 bg-surface-950/60 p-3">
              <span className="font-semibold text-surface-200 block mb-1.5">Validation Advisories</span>
              {readiness.warnings.length === 0 ? (
                <p className="text-success-400">No unit or margin warnings detected.</p>
              ) : (
                <ul className="space-y-1 text-warning-300 text-[11px]">
                  {readiness.warnings.slice(0, 2).map((w, idx) => (
                    <li key={idx} className="flex items-start gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Main Split Tables */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Key Assumptions"
            subtitle="Explicit units and provenance labels"
            icon={<Layers className="h-3.5 w-3.5" />}
            action={
              <Link to={`/app/businesses/${business.id}/assumptions`} className="text-xs font-medium text-brand-400 hover:text-brand-300">
                Manage All →
              </Link>
            }
          />
          <div className="divide-y divide-surface-800">
            {assumptions.length === 0 ? (
              <div className="p-6 text-center">
                <p className="text-xs text-surface-400">No assumptions declared yet.</p>
                <Link to={`/app/businesses/${business.id}/assumptions`}>
                  <Button size="xs" className="mt-3">
                    <Plus className="h-3.5 w-3.5" /> Add Assumptions
                  </Button>
                </Link>
              </div>
            ) : (
              assumptions.slice(0, 8).map((a) => {
                const badge = sourceTypeBadge(a.source_type);
                return (
                  <div key={a.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-surface-100 truncate">{a.label || a.key}</p>
                      <p className="text-[10px] font-mono text-surface-500">{a.key}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`chip border text-[10px] ${badge.className}`}>{badge.label}</span>
                      <span className="font-mono text-xs font-semibold text-white">
                        {formatValue(a.value_numeric, a.unit)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Configured Scenarios & Run History"
            subtitle="Rerunning preserves immutable prior snapshots"
            icon={<FlaskConical className="h-3.5 w-3.5" />}
            action={
              <Link to={`/app/scenarios?business=${business.id}`} className="text-xs font-medium text-brand-400 hover:text-brand-300">
                + New Scenario
              </Link>
            }
          />
          <div className="divide-y divide-surface-800">
            {scenarios.length === 0 ? (
              <div className="p-6 text-center text-xs text-surface-500">
                No scenarios created yet.
              </div>
            ) : (
              scenarios.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-white truncate">{s.name}</span>
                      <Badge variant={s.module === "resilience" ? "warning" : "brand"}>{s.module}</Badge>
                    </div>
                    <p className="text-[11px] text-surface-500 truncate">{s.template_name}</p>
                  </div>
                  <Link to={`/app/scenarios/${s.id}/config`}>
                    <Button size="xs" variant="outline">
                      Configure <ArrowRight className="h-3 w-3" />
                    </Button>
                  </Link>
                </div>
              ))
            )}
          </div>

          {runs.length > 0 && (
            <div className="border-t border-surface-800 bg-surface-950/60 p-3.5 space-y-2">
              <p className="section-heading">Persisted Run Snapshots</p>
              {runs.slice(0, 4).map((r) => (
                <Link
                  key={r.id}
                  to={`/app/simulation/runs/${r.id}`}
                  className="flex items-center justify-between gap-2 rounded border border-surface-800 bg-surface-900 px-3 py-2 text-xs hover:border-surface-600 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        r.status === "completed" ? "bg-success-400" : r.status === "failed" ? "bg-danger-400" : "bg-warning-400"
                      }`}
                    />
                    <span className="truncate font-medium text-surface-200">{r.scenario_name}</span>
                  </div>
                  <span className="inline-flex items-center gap-1 font-mono text-[11px] text-brand-400 shrink-0">
                    <Play className="h-3 w-3" /> Results
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
