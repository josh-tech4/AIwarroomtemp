import React, { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Layers, Pencil, Plus, Trash2 } from "lucide-react";
import { apiClient, extractApiError } from "../../api/client";
import { Alert, Badge, Button, Card, CardHeader, LoadingState, SectionHeader } from "../../components/ui";
import type {
  BusinessAssumption,
  BusinessMetric,
  BusinessProfile,
  BusinessReadiness,
  ConfidenceLevel,
  PaginatedResponse,
  SourceType,
} from "../../types/api";
import { formatValue, sourceTypeBadge } from "../../utils/formatters";

const STANDARD_KEYS = [
  "orders_per_month",
  "daily_orders",
  "avg_order_value",
  "variable_cost_per_order",
  "fixed_monthly_costs",
  "marketing_spend",
  "initial_capital",
  "capacity_limit",
];

export function AssumptionsEditor() {
  const { businessId } = useParams<{ businessId: string }>();
  const [activeTab, setActiveTab] = useState<"assumptions" | "metrics">("assumptions");
  const [business, setBusiness] = useState<BusinessProfile | null>(null);
  const [readiness, setReadiness] = useState<BusinessReadiness | null>(null);
  const [assumptions, setAssumptions] = useState<BusinessAssumption[]>([]);
  const [metrics, setMetrics] = useState<BusinessMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [key, setKey] = useState("orders_per_month");
  const [customKeyMode, setCustomKeyMode] = useState(false);
  const [label, setLabel] = useState("");
  const [valueNumeric, setValueNumeric] = useState("");
  const [unit, setUnit] = useState("orders/month");
  const [assumptionType, setAssumptionType] = useState("demand");
  const [sourceType, setSourceType] = useState<SourceType>("user_input");
  const [sourceReference, setSourceReference] = useState("");
  const [confidence, setConfidence] = useState<ConfidenceLevel>("medium");
  const [notes, setNotes] = useState("");

  const [mKey, setMKey] = useState("monthly_active_customers");
  const [mLabel, setMLabel] = useState("");
  const [mValue, setMValue] = useState("");
  const [mUnit, setMUnit] = useState("customers");
  const [mCategory, setMCategory] = useState("customer");
  const [mSource, setMSource] = useState<SourceType>("user_input");

  const loadData = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    setError(null);
    try {
      const [bResp, aResp, mResp, rResp] = await Promise.all([
        apiClient.get<BusinessProfile>(`/businesses/${businessId}/`),
        apiClient.get<PaginatedResponse<BusinessAssumption>>(`/businesses/${businessId}/assumptions/`),
        apiClient.get<PaginatedResponse<BusinessMetric>>(`/businesses/${businessId}/metrics/`),
        Promise.resolve(
          apiClient.get<BusinessReadiness>(`/businesses/${businessId}/readiness/`)
        ).catch(() => null),
      ]);
      setBusiness(bResp.data);
      setAssumptions(aResp.data.results || []);
      setMetrics(mResp.data.results || []);
      setReadiness(rResp?.data || null);
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleSaveAssumption = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId) return;
    setSaving(true);
    setError(null);
    try {
      await apiClient.post(`/businesses/${businessId}/assumptions/`, {
        key: key.trim().toLowerCase().replace(/\s+/g, "_"),
        label: label || key,
        value_numeric: valueNumeric,
        unit,
        assumption_type: assumptionType,
        source_type: sourceType,
        source_reference: sourceReference,
        confidence,
        notes,
      });
      setValueNumeric("");
      setLabel("");
      setSourceReference("");
      setNotes("");
      await loadData();
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveMetric = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId) return;
    setSaving(true);
    setError(null);
    try {
      await apiClient.post(`/businesses/${businessId}/metrics/`, {
        key: mKey.trim().toLowerCase().replace(/\s+/g, "_"),
        label: mLabel || mKey,
        value_numeric: mValue,
        unit: mUnit,
        category: mCategory,
        source_type: mSource,
      });
      setMValue("");
      setMLabel("");
      await loadData();
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleEditAssumption = (a: BusinessAssumption) => {
    const isStd = STANDARD_KEYS.includes(a.key);
    setCustomKeyMode(!isStd);
    setKey(a.key);
    setLabel(a.label);
    setValueNumeric(String(Number(a.value_numeric)));
    setUnit(a.unit);
    setAssumptionType(a.assumption_type);
    setSourceType(a.source_type);
    setSourceReference(a.source_reference || "");
    setConfidence(a.confidence);
    setNotes(a.notes || "");
    setActiveTab("assumptions");
  };

  const handleDeleteAssumption = async (id: string) => {
    if (!businessId) return;
    try {
      await apiClient.delete(`/businesses/${businessId}/assumptions/${id}/`);
      await loadData();
    } catch (err) {
      setError(extractApiError(err));
    }
  };

  const handleDeleteMetric = async (id: string) => {
    if (!businessId) return;
    try {
      await apiClient.delete(`/businesses/${businessId}/metrics/${id}/`);
      await loadData();
    } catch (err) {
      setError(extractApiError(err));
    }
  };

  if (loading) return <LoadingState label="Loading assumptions & metrics..." />;

  return (
    <div className="space-y-5">
      <div>
        <Link
          to={`/app/businesses/${businessId}`}
          className="inline-flex items-center gap-1.5 text-xs text-surface-400 hover:text-white mb-2"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to {business?.name}
        </Link>

        <SectionHeader
          tag="Structured Model Variables"
          title="Financial Inputs & Assumptions"
          subtitle={`Every variable carries an explicit unit, currency (${business?.currency || "INR"}), provenance source, and confidence rating.`}
          action={
            <div className="inline-flex rounded-md border border-surface-700 bg-surface-950 p-0.5 gap-0.5">
              <button
                type="button"
                onClick={() => setActiveTab("assumptions")}
                className={activeTab === "assumptions" ? "tab-btn-active" : "tab-btn-inactive"}
              >
                Assumptions ({assumptions.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("metrics")}
                className={activeTab === "metrics" ? "tab-btn-active" : "tab-btn-inactive"}
              >
                Observed Metrics ({metrics.length})
              </button>
            </div>
          }
        />
      </div>

      {error && (
        <Alert variant="error" dismissible onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      {readiness?.warnings && readiness.warnings.length > 0 && (
        <Alert variant="warning" title="Model Input Validation Advisories">
          <ul className="list-disc pl-4 space-y-0.5">
            {readiness.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </Alert>
      )}

      {activeTab === "assumptions" ? (
        <>
          <Card>
            <CardHeader
              title="Declare or Update Assumption"
              subtitle="Upserting a key updates your live baseline without mutating prior SimulationRun snapshots"
              icon={<Layers className="h-3.5 w-3.5" />}
              action={
                <button
                  type="button"
                  onClick={() => setCustomKeyMode((v) => !v)}
                  className="text-xs text-brand-400 hover:text-brand-300 font-medium"
                >
                  {customKeyMode ? "Use Standard Keys" : "+ Custom Variable Key"}
                </button>
              }
            />
            <form onSubmit={handleSaveAssumption} className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label htmlFor="assumptionKey" className="field-label">Variable Key</label>
                {customKeyMode ? (
                  <input
                    id="assumptionKey"
                    type="text"
                    required
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    placeholder="custom_metric_key"
                    className="field font-mono text-xs"
                  />
                ) : (
                  <select id="assumptionKey" value={key} onChange={(e) => setKey(e.target.value)} className="field font-mono text-xs">
                    {STANDARD_KEYS.map((sk) => (
                      <option key={sk} value={sk}>{sk}</option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <label htmlFor="assumptionValue" className="field-label">Value</label>
                <input
                  id="assumptionValue"
                  type="number"
                  step="any"
                  required
                  value={valueNumeric}
                  onChange={(e) => setValueNumeric(e.target.value)}
                  placeholder="500"
                  className="field font-mono text-xs"
                />
              </div>
              <div>
                <label htmlFor="assumptionUnit" className="field-label">Unit</label>
                <input
                  id="assumptionUnit"
                  type="text"
                  required
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="INR/order"
                  className="field font-mono text-xs"
                />
              </div>
              <div>
                <label htmlFor="assumptionSource" className="field-label">Provenance Source</label>
                <select
                  id="assumptionSource"
                  value={sourceType}
                  onChange={(e) => setSourceType(e.target.value as SourceType)}
                  className="field text-xs"
                >
                  <option value="user_input">User Input</option>
                  <option value="imported">Imported</option>
                  <option value="derived">Derived</option>
                  <option value="illustrative">Illustrative Estimate</option>
                </select>
              </div>
              <div>
                <label htmlFor="assumptionCat" className="field-label">Domain Category</label>
                <select id="assumptionCat" value={assumptionType} onChange={(e) => setAssumptionType(e.target.value)} className="field text-xs">
                  <option value="demand">Demand</option>
                  <option value="pricing">Pricing</option>
                  <option value="cost">Cost</option>
                  <option value="capital">Capital</option>
                  <option value="capacity">Capacity</option>
                  <option value="resilience">Resilience</option>
                </select>
              </div>
              <div>
                <label htmlFor="assumptionConf" className="field-label">Confidence</label>
                <select
                  id="assumptionConf"
                  value={confidence}
                  onChange={(e) => setConfidence(e.target.value as ConfidenceLevel)}
                  className="field text-xs"
                >
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
              <div>
                <label htmlFor="assumptionRef" className="field-label">Source Reference (optional)</label>
                <input
                  id="assumptionRef"
                  type="text"
                  value={sourceReference}
                  onChange={(e) => setSourceReference(e.target.value)}
                  placeholder="Vendor quote / URL / doc"
                  className="field text-xs"
                />
              </div>
              <div className="flex items-end justify-end">
                <Button type="submit" size="sm" loading={saving} className="w-full justify-center">
                  <Plus className="h-3.5 w-3.5" /> Save Assumption
                </Button>
              </div>
            </form>
          </Card>

          <Card>
            <CardHeader title={`Declared Assumptions (${assumptions.length})`} />
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Variable</th>
                    <th>Category</th>
                    <th>Value</th>
                    <th>Provenance</th>
                    <th>Confidence</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {assumptions.map((a) => {
                    const badge = sourceTypeBadge(a.source_type);
                    return (
                      <tr key={a.id}>
                        <td>
                          <p className="font-medium text-surface-100 text-xs">{a.label || a.key}</p>
                          <p className="text-[11px] font-mono text-surface-500">{a.key}</p>
                        </td>
                        <td className="text-xs uppercase font-mono text-surface-400">{a.assumption_type}</td>
                        <td className="font-mono font-semibold text-white text-xs">
                          {formatValue(a.value_numeric, a.unit)}
                        </td>
                        <td>
                          <span className={`chip border text-[11px] ${badge.className}`}>{badge.label}</span>
                        </td>
                        <td>
                          <Badge variant={a.confidence === "high" ? "success" : a.confidence === "medium" ? "warning" : "neutral"}>
                            {a.confidence}
                          </Badge>
                        </td>
                        <td className="text-right space-x-1">
                          <button
                            type="button"
                            aria-label={`Edit ${a.key}`}
                            onClick={() => handleEditAssumption(a)}
                            className="rounded p-1.5 text-surface-400 hover:bg-surface-800 hover:text-brand-400"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label={`Delete ${a.key}`}
                            onClick={() => void handleDeleteAssumption(a.id)}
                            className="rounded p-1.5 text-surface-400 hover:bg-danger-500/10 hover:text-danger-400"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {assumptions.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-xs text-surface-500">
                        No assumptions configured yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : (
        <>
          <Card>
            <CardHeader title="Record Observed Operating Metric" />
            <form onSubmit={handleSaveMetric} className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
              <div>
                <label className="field-label">Metric Key</label>
                <input type="text" required value={mKey} onChange={(e) => setMKey(e.target.value)} className="field font-mono text-xs" />
              </div>
              <div>
                <label className="field-label">Numeric Value</label>
                <input type="number" step="any" required value={mValue} onChange={(e) => setMValue(e.target.value)} className="field font-mono text-xs" />
              </div>
              <div>
                <label className="field-label">Unit</label>
                <input type="text" required value={mUnit} onChange={(e) => setMUnit(e.target.value)} className="field font-mono text-xs" />
              </div>
              <div>
                <label className="field-label">Category</label>
                <select value={mCategory} onChange={(e) => setMCategory(e.target.value)} className="field text-xs">
                  <option value="financial">Financial</option>
                  <option value="customer">Customer</option>
                  <option value="operational">Operational</option>
                  <option value="resource">Resource</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="field-label">Source</label>
                <select value={mSource} onChange={(e) => setMSource(e.target.value as SourceType)} className="field text-xs">
                  <option value="user_input">User Input</option>
                  <option value="imported">Imported</option>
                  <option value="derived">Derived</option>
                  <option value="illustrative">Illustrative Estimate</option>
                </select>
              </div>
              <div className="flex items-end justify-end">
                <Button type="submit" size="sm" loading={saving} className="w-full justify-center">
                  <Plus className="h-3.5 w-3.5" /> Save Metric
                </Button>
              </div>
            </form>
          </Card>

          <Card>
            <CardHeader title={`Observed Metrics (${metrics.length})`} />
            <div className="divide-y divide-surface-800">
              {metrics.map((m) => {
                const badge = sourceTypeBadge(m.source_type);
                return (
                  <div key={m.id} className="flex items-center justify-between gap-3 px-4 py-3 text-xs">
                    <div>
                      <p className="font-medium text-surface-100">{m.label || m.key}</p>
                      <p className="text-[11px] font-mono text-surface-500">{m.key} ({m.category})</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-semibold text-white">{formatValue(m.value_numeric, m.unit)}</span>
                      <span className={`chip border text-[11px] ${badge.className}`}>{badge.label}</span>
                      <button
                        type="button"
                        aria-label={`Delete metric ${m.key}`}
                        onClick={() => void handleDeleteMetric(m.id)}
                        className="rounded p-1.5 text-surface-400 hover:bg-danger-500/10 hover:text-danger-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
              {metrics.length === 0 && (
                <p className="p-6 text-center text-xs text-surface-500">No metrics recorded yet.</p>
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
