import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Copy, FlaskConical, Plus, Shield, TrendingUp } from "lucide-react";
import { apiClient, extractApiError } from "../../api/client";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  LoadingState,
  SectionHeader,
} from "../../components/ui";
import type { BusinessProfile, PaginatedResponse, Scenario, ScenarioTemplate } from "../../types/api";

export function ScenarioLibrary() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const preselectedBusiness = searchParams.get("business") || "";

  const [templates, setTemplates] = useState<ScenarioTemplate[]>([]);
  const [businesses, setBusinesses] = useState<BusinessProfile[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selectedBusiness, setSelectedBusiness] = useState(preselectedBusiness);
  const [scenarioName, setScenarioName] = useState("");
  const [loading, setLoading] = useState(true);
  const [creatingTplId, setCreatingTplId] = useState<string | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tResp, bResp, sResp] = await Promise.all([
        apiClient.get<PaginatedResponse<ScenarioTemplate>>("/scenarios/templates/"),
        apiClient.get<PaginatedResponse<BusinessProfile>>("/businesses/"),
        apiClient.get<PaginatedResponse<Scenario>>("/scenarios/"),
      ]);
      setTemplates(tResp.data.results || []);
      const bizList = bResp.data.results || [];
      setBusinesses(bizList);
      setScenarios(sResp.data.results || []);
      if (!selectedBusiness && bizList.length > 0) {
        setSelectedBusiness(bizList[0].id);
      }
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setLoading(false);
    }
  }, [selectedBusiness]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleUseTemplate = async (tpl: ScenarioTemplate) => {
    if (!selectedBusiness) {
      setError("Create or select a business profile first.");
      return;
    }
    setCreatingTplId(tpl.id);
    setError(null);
    try {
      const resp = await apiClient.post<Scenario>("/scenarios/", {
        business: selectedBusiness,
        template: tpl.id,
        module: tpl.module,
        name: scenarioName.trim() || `${tpl.name} (${new Date().toLocaleDateString()})`,
        description: tpl.description,
      });
      navigate(`/app/scenarios/${resp.data.id}/config`);
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setCreatingTplId(null);
    }
  };

  const handleDuplicateScenario = async (scenId: string) => {
    setDuplicatingId(scenId);
    setError(null);
    try {
      const resp = await apiClient.post<Scenario>(`/scenarios/${scenId}/duplicate/`);
      navigate(`/app/scenarios/${resp.data.id}/config`);
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setDuplicatingId(null);
    }
  };

  if (loading) return <LoadingState label="Loading scenario library..." />;

  return (
    <div className="space-y-6">
      <SectionHeader
        tag="Versioned Scenario Engine"
        title="Scenario Library"
        subtitle="Select a deterministic scenario template for Business Idea stress-testing or Operational Resilience evaluation."
      />

      {error && (
        <Alert variant="error" dismissible onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Card className="p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="field-label">Target Business Profile</label>
            <select value={selectedBusiness} onChange={(e) => setSelectedBusiness(e.target.value)} className="field text-xs">
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>{b.name} ({b.stage})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">Scenario Title (optional)</label>
            <input
              type="text"
              value={scenarioName}
              onChange={(e) => setScenarioName(e.target.value)}
              placeholder="e.g. Peak Diwali Gateway Outage 3h"
              className="field text-xs"
            />
          </div>
        </div>
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        {templates.map((tpl) => (
          <Card key={tpl.id} className="flex flex-col justify-between p-5">
            <div>
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-surface-800">
                <Badge variant={tpl.module === "resilience" ? "warning" : "brand"} dot>
                  {tpl.module === "resilience" ? "Resilience Module" : "Business Idea Module"}
                </Badge>
                <span className="font-mono text-[11px] text-surface-500">v{tpl.version}</span>
              </div>
              <div className="mt-4 flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-md border border-surface-700 bg-surface-850 text-brand-400">
                  {tpl.module === "resilience" ? <Shield className="h-4 w-4 text-warning-400" /> : <TrendingUp className="h-4 w-4" />}
                </div>
                <h2 className="text-sm font-semibold text-white">{tpl.name}</h2>
              </div>
              <p className="mt-2 text-xs text-surface-400 leading-relaxed">{tpl.description}</p>
              <div className="mt-4 space-y-1.5">
                <p className="section-heading">Strategies Evaluated Side-by-Side</p>
                {tpl.default_strategies.map((st) => (
                  <div key={st.key} className="rounded border border-surface-800 bg-surface-950/70 px-3 py-2 text-xs">
                    <span className="font-semibold text-surface-100">{st.name}</span>
                    <span className="text-surface-400"> — {st.description}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-5 pt-3 border-t border-surface-800">
              <Button
                onClick={() => void handleUseTemplate(tpl)}
                disabled={!selectedBusiness || creatingTplId === tpl.id}
                loading={creatingTplId === tpl.id}
                className="w-full justify-center"
              >
                <Plus className="h-3.5 w-3.5" /> Configure Scenario
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader title={`Configured Scenarios (${scenarios.length})`} icon={<FlaskConical className="h-3.5 w-3.5" />} />
        <div className="divide-y divide-surface-800">
          {scenarios.length === 0 ? (
            <div className="p-8 text-center text-xs text-surface-500">
              No configured scenarios yet. Instantiate a template above.
            </div>
          ) : (
            scenarios.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-surface-100">{s.name}</span>
                    <Badge variant={s.module === "resilience" ? "warning" : "brand"}>{s.module}</Badge>
                  </div>
                  <p className="text-[11px] font-mono text-surface-500 mt-0.5">
                    {s.business_name} · {s.parameters.length} parameter override(s)
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="xs"
                    variant="outline"
                    loading={duplicatingId === s.id}
                    onClick={() => void handleDuplicateScenario(s.id)}
                  >
                    <Copy className="h-3 w-3" /> Duplicate
                  </Button>
                  <Link to={`/app/scenarios/${s.id}/config`}>
                    <Button size="xs">
                      Configure & Run <ArrowRight className="h-3 w-3" />
                    </Button>
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
