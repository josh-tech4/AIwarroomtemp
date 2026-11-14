import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  Box,
  Building2,
  CheckCircle2,
  FlaskConical,
  Layers,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { apiClient, extractApiError } from "../../api/client";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  LoadingState,
  MetricCard,
  SectionHeader,
} from "../../components/ui";
import { useAuthStore } from "../../stores/authStore";
import type { BusinessProfile, PaginatedResponse, SimulationRun } from "../../types/api";

interface OrgMember {
  id: string;
  user_email: string;
  user_full_name: string;
  role: string;
}

const STAGE_VARIANT: Record<string, "brand" | "info" | "warning" | "success"> = {
  idea: "brand",
  planning: "info",
  pilot: "warning",
  operating: "success",
};

export function WorkspaceDashboard() {
  const { activeOrgId, organizations, setActiveOrgId, fetchSession } = useAuthStore();
  const [businesses, setBusinesses] = useState<BusinessProfile[]>([]);
  const [recentRuns, setRecentRuns] = useState<SimulationRun[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newOrgName, setNewOrgName] = useState("");
  const [creatingOrg, setCreatingOrg] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("analyst");
  const [showInvite, setShowInvite] = useState(false);

  const activeOrg = organizations.find((o) => o.id === activeOrgId);
  const canManageMembers =
    activeOrg?.current_user_role === "owner" || activeOrg?.current_user_role === "admin";

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const bizParams = activeOrgId ? { organization: activeOrgId } : {};
      const tasks: Promise<unknown>[] = [
        apiClient.get<PaginatedResponse<BusinessProfile>>("/businesses/", { params: bizParams }),
        apiClient.get<PaginatedResponse<SimulationRun>>("/simulation/runs/"),
      ];
      if (activeOrgId) {
        tasks.push(apiClient.get<PaginatedResponse<OrgMember>>(`/organizations/${activeOrgId}/members/`));
      }
      const results = await Promise.all(tasks);
      const [bizResp, runResp, memberResp] = results as [
        { data: PaginatedResponse<BusinessProfile> },
        { data: PaginatedResponse<SimulationRun> },
        { data: PaginatedResponse<OrgMember> } | undefined,
      ];
      setBusinesses(bizResp.data.results || []);
      setRecentRuns(runResp.data.results || []);
      setMembers(memberResp?.data.results || []);
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setLoading(false);
    }
  }, [activeOrgId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrgName.trim()) return;
    setCreatingOrg(true);
    try {
      const resp = await apiClient.post<{ id: string }>("/organizations/", { name: newOrgName.trim() });
      setActiveOrgId(resp.data.id);
      setNewOrgName("");
      await fetchSession();
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setCreatingOrg(false);
    }
  };

  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrgId || !inviteEmail.trim()) return;
    setError(null);
    try {
      await apiClient.post(`/organizations/${activeOrgId}/members/invite/`, {
        email: inviteEmail.trim(),
        role: inviteRole,
      });
      setInviteEmail("");
      setShowInvite(false);
      await loadData();
    } catch (err) {
      setError(extractApiError(err));
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!activeOrgId) return;
    try {
      await apiClient.delete(`/organizations/${activeOrgId}/members/${memberId}/`);
      await loadData();
    } catch (err) {
      setError(extractApiError(err));
    }
  };

  if (loading) return <LoadingState label="Loading workspace telemetry..." />;

  const completedRuns = recentRuns.filter((r) => r.status === "completed").length;

  return (
    <div className="space-y-6">
      <SectionHeader
        tag="Workspace Console"
        title={activeOrg ? activeOrg.name : "AI WarRoom Workspace"}
        subtitle="Unified domain profiles supporting both pre-launch Business Idea modeling and Operational Resilience disruption simulations."
        action={
          organizations.length > 0 && (
            <Link to="/app/businesses/new">
              <Button>
                <Plus className="h-3.5 w-3.5" /> New Business Profile
              </Button>
            </Link>
          )
        }
      />

      {error && (
        <Alert variant="error" dismissible onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      {organizations.length === 0 && (
        <Card className="p-8">
          <div className="mx-auto max-w-sm text-center">
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-lg border border-surface-700 bg-surface-850">
              <Building2 className="h-5 w-5 text-brand-400" />
            </div>
            <h2 className="text-sm font-semibold text-white">Create your organization workspace</h2>
            <p className="mt-1 text-xs text-surface-400">
              All business models, assumptions, simulation snapshots, and reports are tenant-isolated within an organization.
            </p>
            <form onSubmit={handleCreateOrg} className="mt-5 flex flex-col gap-2.5">
              <input
                type="text"
                required
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
                placeholder="e.g. FreshCart Grocery Labs"
                className="field"
              />
              <Button type="submit" disabled={creatingOrg} className="justify-center">
                {creatingOrg ? "Creating..." : "Create Workspace"}
              </Button>
            </form>
          </div>
        </Card>
      )}

      {organizations.length > 0 && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <MetricCard label="Business Profiles" value={businesses.length} icon={<Building2 className="h-4 w-4" />} accent="brand" />
          <MetricCard label="Total Runs" value={recentRuns.length} icon={<FlaskConical className="h-4 w-4" />} accent="accent" />
          <MetricCard label="Completed Runs" value={completedRuns} icon={<CheckCircle2 className="h-4 w-4" />} accent="success" />
          <MetricCard label="Team Members" value={members.length} icon={<Users className="h-4 w-4" />} accent="warning" />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Business Profiles */}
        <div className="lg:col-span-8 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-surface-300 flex items-center gap-2">
              <Building2 className="h-3.5 w-3.5 text-brand-400" />
              Business Models ({businesses.length})
            </h2>
            {businesses.length > 0 && (
              <Link to="/app/businesses/new" className="text-xs text-brand-400 hover:text-brand-300 font-medium">
                + Create Model
              </Link>
            )}
          </div>

          {businesses.length === 0 ? (
            <EmptyState
              title="No business profiles registered"
              description="Create a business model to define financial assumptions, operational dependencies, and scenarios."
              icon={<Building2 className="h-5 w-5" />}
              action={
                organizations.length > 0 ? (
                  <Link to="/app/businesses/new">
                    <Button size="sm">Create Business Profile</Button>
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {businesses.map((biz) => (
                <Card key={biz.id} className="flex flex-col justify-between p-4 hover:border-surface-600 transition-colors">
                  <div>
                    <div className="flex items-center justify-between gap-2 pb-3 border-b border-surface-800">
                      <div className="flex items-center gap-1.5">
                        <Badge variant={STAGE_VARIANT[biz.stage] || "neutral"} dot>
                          {biz.stage}
                        </Badge>
                        {biz.is_demo && <Badge variant="warning">Illustrative Demo</Badge>}
                      </div>
                      <span className="font-mono text-[11px] text-surface-400 border border-surface-700 rounded px-1.5 py-0.5 bg-surface-950">
                        {biz.currency}
                      </span>
                    </div>

                    <h3 className="mt-3 text-sm font-semibold text-white">{biz.name}</h3>
                    <p className="mt-1 line-clamp-2 text-xs text-surface-400">
                      {biz.description || "No business description recorded."}
                    </p>

                    <div className="mt-3 grid grid-cols-2 gap-2 rounded border border-surface-800 bg-surface-950/60 px-3 py-2 text-[11px] font-mono text-surface-300">
                      <span className="flex items-center gap-1.5">
                        <Layers className="h-3 w-3 text-brand-400" />
                        {biz.assumptions_count} assumptions
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Box className="h-3 w-3 text-accent-400" />
                        {biz.components_count} components
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between pt-3 border-t border-surface-800">
                    <Link
                      to={`/app/businesses/${biz.id}`}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-brand-400 hover:text-brand-300"
                    >
                      Open Overview <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                    <div className="flex items-center gap-2.5 text-[11px]">
                      <Link
                        to={`/app/businesses/${biz.id}/components`}
                        className="text-accent-400 hover:text-accent-300 font-medium"
                      >
                        3D Twin
                      </Link>
                      <Link
                        to={`/app/scenarios?business=${biz.id}`}
                        className="text-surface-400 hover:text-white"
                      >
                        Scenarios
                      </Link>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Right Rail: Recent Runs & Members */}
        <div className="lg:col-span-4 space-y-4">
          <Card>
            <CardHeader
              title="Simulation Run Ledger"
              subtitle="Immutable snapshots"
              icon={<Activity className="h-3.5 w-3.5" />}
              action={
                <Link to="/app/scenarios" className="text-[11px] text-brand-400 hover:text-brand-300">
                  All Scenarios
                </Link>
              }
            />
            <div className="divide-y divide-surface-800">
              {recentRuns.length === 0 ? (
                <div className="py-8 text-center text-xs text-surface-500">
                  No simulations executed yet.
                </div>
              ) : (
                recentRuns.slice(0, 6).map((run) => (
                  <Link
                    key={run.id}
                    to={`/app/simulation/runs/${run.id}`}
                    className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-surface-850 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`h-2 w-2 rounded-full shrink-0 ${
                          run.status === "completed"
                            ? "bg-success-400"
                            : run.status === "failed"
                              ? "bg-danger-400"
                              : "bg-warning-400"
                        }`}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-surface-100">{run.scenario_name}</p>
                        <p className="truncate text-[10px] font-mono text-surface-500">
                          {run.module} · {new Date(run.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 text-surface-500 shrink-0" />
                  </Link>
                ))
              )}
            </div>
          </Card>

          {activeOrg && (
            <Card>
              <CardHeader
                title="Workspace Members"
                icon={<Users className="h-3.5 w-3.5" />}
                action={
                  canManageMembers && (
                    <button
                      type="button"
                      onClick={() => setShowInvite(!showInvite)}
                      className="text-[11px] text-brand-400 hover:text-brand-300 font-medium"
                    >
                      + Invite
                    </button>
                  )
                }
              />
              <div className="divide-y divide-surface-800">
                {members.map((m) => (
                  <div key={m.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-surface-100">
                        {m.user_full_name || m.user_email}
                      </p>
                      <p className="truncate text-[10px] font-mono text-surface-500">{m.user_email}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge variant={m.role === "owner" ? "brand" : "neutral"}>{m.role}</Badge>
                      {canManageMembers && m.role !== "owner" && (
                        <button
                          type="button"
                          aria-label={`Remove ${m.user_email}`}
                          onClick={() => void handleRemoveMember(m.id)}
                          className="text-surface-500 hover:text-danger-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {showInvite && canManageMembers && (
                <form onSubmit={handleInviteMember} className="border-t border-surface-800 p-3.5 space-y-2.5 bg-surface-950/60">
                  <input
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="colleague@company.com"
                    className="field text-xs py-1.5"
                  />
                  <div className="flex gap-2">
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value)}
                      className="field text-xs py-1.5 flex-1"
                    >
                      <option value="analyst">Analyst</option>
                      <option value="viewer">Viewer</option>
                      <option value="admin">Admin</option>
                    </select>
                    <Button type="submit" size="xs">Invite</Button>
                  </div>
                </form>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
