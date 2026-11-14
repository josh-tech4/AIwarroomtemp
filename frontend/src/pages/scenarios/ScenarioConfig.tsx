import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Layers, Play, Save, Sliders } from "lucide-react";
import { apiClient, extractApiError } from "../../api/client";
import { Alert, Badge, Button, Card, CardHeader, LoadingState, SectionHeader } from "../../components/ui";
import type { BusinessAssumption, PaginatedResponse, Scenario, ScenarioTemplate, SimulationRun } from "../../types/api";
import { formatValue } from "../../utils/formatters";

export function ScenarioConfig() {
  const { scenarioId } = useParams<{ scenarioId: string }>();
  const navigate = useNavigate();

  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [template, setTemplate] = useState<ScenarioTemplate | null>(null);
  const [assumptions, setAssumptions] = useState<BusinessAssumption[]>([]);
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const loadScenario = useCallback(async () => {
    if (!scenarioId) return;
    setLoading(true);
    setError(null);
    try {
      const sResp = await apiClient.get<Scenario>(`/scenarios/${scenarioId}/`);
      setScenario(sResp.data);
      const [tplResp, assumpResp] = await Promise.all([
        sResp.data.template
          ? apiClient.get<ScenarioTemplate>(`/scenarios/templates/${sResp.data.template}/`)
          : Promise.resolve({ data: null }),
        apiClient.get<PaginatedResponse<BusinessAssumption>>(
          `/businesses/${sResp.data.business}/assumptions/`
        ),
      ]);
      const tpl = tplResp.data;
      setTemplate(tpl);
      setAssumptions(assumpResp.data.results || []);

      const initial: Record<string, string> = {};
      if (tpl) {
        Object.entries(tpl.parameter_schema).forEach(([k, def]) => {
          initial[k] = def.default !== null && def.default !== undefined ? String(def.default) : "";
        });
      }
      sResp.data.parameters.forEach((p) => {
        initial[p.key] = p.value_numeric ?? p.value_text ?? "";
      });
      setParamValues(initial);
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setLoading(false);
    }
  }, [scenarioId]);

  useEffect(() => {
    void loadScenario();
  }, [loadScenario]);

  const saveParameters = async () => {
    if (!scenario || !template) return;
    setSaving(true);
    setError(null);
    setSavedNotice(null);
    try {
      const existingByKey = new Map(scenario.parameters.map((p) => [p.key, p]));
      const ops: Promise<unknown>[] = [];
      Object.entries(paramValues).forEach(([key, val]) => {
        const trimmed = String(val ?? "").trim();
        if (trimmed === "") {
          const existing = existingByKey.get(key);
          if (existing) ops.push(apiClient.delete(`/scenarios/${scenario.id}/parameters/${existing.id}/`));
          return;
        }
        const schemaDef = template.parameter_schema[key];
        const unit = schemaDef?.unit || "";
        ops.push(
          apiClient.post(`/scenarios/${scenario.id}/parameters/`, {
            key,
            value_numeric: trimmed,
            unit,
            override_type: unit === "%" ? "percentage" : "absolute",
          })
        );
      });
      await Promise.all(ops);
      setSavedNotice("Scenario parameters saved.");
      await loadScenario();
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleRunSimulation = async () => {
    if (!scenario) return;
    setRunning(true);
    setError(null);
    try {
      await saveParameters();
      const idempotencyKey = crypto.randomUUID ? crypto.randomUUID() : `run-${Date.now()}`;
      const runResp = await apiClient.post<SimulationRun>(
        "/simulation/runs/",
        { scenario_id: scenario.id },
        { headers: { "Idempotency-Key": idempotencyKey } }
      );
      navigate(`/app/simulation/runs/${runResp.data.id}`);
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setRunning(false);
    }
  };

  if (loading) return <LoadingState label="Loading scenario configuration..." />;
  if (!scenario) return <Alert variant="error">Scenario not found.</Alert>;

  const schemaEntries = template ? Object.entries(template.parameter_schema) : [];

  return (
    <div className="space-y-5">
      <div>
        <Link
          to={`/app/businesses/${scenario.business}`}
          className="inline-flex items-center gap-1.5 text-xs text-surface-400 hover:text-white mb-2"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to {scenario.business_name}
        </Link>
        <SectionHeader
          tag={`Engine: ${scenario.engine_key || "default"}`}
          title={scenario.name}
          subtitle={scenario.description}
          action={<Badge variant={scenario.module === "resilience" ? "warning" : "brand"}>{scenario.module}</Badge>}
        />
      </div>

      {error && (
        <Alert variant="error" dismissible onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}
      {savedNotice && (
        <Alert variant="success" dismissible onDismiss={() => setSavedNotice(null)}>
          {savedNotice}
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left: Parameter Form */}
        <div className="lg:col-span-7 space-y-4">
          <Card>
            <CardHeader
              title="Scenario Parameters"
              subtitle="Running invokes SimulationOrchestrator and freezes an immutable input snapshot"
              icon={<Sliders className="h-3.5 w-3.5" />}
            />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              {schemaEntries.map(([key, def]) => (
                <div key={key}>
                  <label htmlFor={`param-${key}`} className="field-label">
                    {def.label}{" "}
                    {def.unit && <span className="font-mono text-brand-400">({def.unit})</span>}
                  </label>
                  <input
                    id={`param-${key}`}
                    type="number"
                    step="any"
                    min={def.min}
                    max={def.max}
                    value={paramValues[key] ?? ""}
                    onChange={(e) => setParamValues({ ...paramValues, [key]: e.target.value })}
                    className="field font-mono text-xs"
                  />
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-surface-800 bg-surface-950/60 px-5 py-3.5">
              <Button variant="outline" size="sm" onClick={saveParameters} disabled={saving || running} loading={saving}>
                <Save className="h-3.5 w-3.5" /> Save Parameters
              </Button>
              <Button size="sm" onClick={handleRunSimulation} disabled={running} loading={running}>
                <Play className="h-3.5 w-3.5" /> {running ? "Executing Engine..." : "Run Simulation"}
              </Button>
            </div>
          </Card>
        </div>

        {/* Right: Baseline Snapshot Preview + Strategies */}
        <div className="lg:col-span-5 space-y-4">
          <Card>
            <CardHeader
              title="Baseline Assumptions to Snapshot"
              subtitle={`${assumptions.length} variables from ${scenario.business_name}`}
              icon={<Layers className="h-3.5 w-3.5" />}
              action={
                <Link to={`/app/businesses/${scenario.business}/assumptions`} className="text-[11px] text-brand-400 hover:text-brand-300">
                  Edit
                </Link>
              }
            />
            <div className="divide-y divide-surface-800 max-h-64 overflow-y-auto">
              {assumptions.map((a) => (
                <div key={a.id} className="flex items-center justify-between px-4 py-2 text-xs">
                  <span className="font-mono text-surface-400">{a.key}</span>
                  <span className="font-mono font-semibold text-white">
                    {formatValue(a.value_numeric, a.unit)}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          {template && (
            <Card>
              <CardHeader title="Strategies Evaluated in This Run" />
              <div className="p-4 space-y-2">
                {template.default_strategies.map((st) => (
                  <div key={st.key} className="rounded border border-surface-800 bg-surface-950/60 px-3 py-2 text-xs">
                    <p className="font-semibold text-surface-100">{st.name}</p>
                    <p className="text-[11px] text-surface-400 mt-0.5">{st.description}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
