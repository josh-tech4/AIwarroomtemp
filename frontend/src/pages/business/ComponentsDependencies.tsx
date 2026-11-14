import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
} from "reactflow";
import "reactflow/dist/style.css";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  Box,
  CheckCircle2,
  GitBranch,
  Layers,
  Play,
  Plus,
  RotateCcw,
  Save,
  Search,
  Server,
  Shield,
  Sliders,
  Trash2,
  Truck,
  Warehouse,
  Workflow,
  Zap,
} from "lucide-react";
import { apiClient, extractApiError } from "../../api/client";
import { IsometricWarRoom3D, type NodeLiveMetrics } from "../../components/IsometricWarRoom3D";
import { Alert, Badge, Button, LoadingState, TelemetryCard } from "../../components/ui";
import type {
  BusinessAssumption,
  BusinessComponent,
  BusinessProfile,
  Dependency,
  PaginatedResponse,
  Scenario,
  SimulationRun,
} from "../../types/api";
import { formatCurrency } from "../../utils/formatters";

const COMPONENT_PALETTE = [
  { type: "website", label: "Checkout / Web App", desc: "Customer storefront or mobile app", color: "#3b82f6", icon: Layers },
  { type: "payment_gateway", label: "Payment Gateway", desc: "Primary or secondary PSP processor", color: "#06b6d4", icon: Shield },
  { type: "process", label: "Order / Routing Engine", desc: "Core order orchestration logic", color: "#8b5cf6", icon: Server },
  { type: "warehouse", label: "Dark Store / Warehouse", desc: "Inventory & packing facility", color: "#a855f7", icon: Warehouse },
  { type: "supplier", label: "Vendor / Supplier", desc: "Upstream cold-chain or SKU supply", color: "#10b981", icon: Box },
  { type: "delivery_partner", label: "Fleet / Dispatch", desc: "Last-mile delivery fulfillment", color: "#f59e0b", icon: Truck },
];

const CRIT_BADGE: Record<string, { border: string; variant: "danger" | "warning" | "info" | "neutral" }> = {
  critical: { border: "#ef4444", variant: "danger" },
  high: { border: "#f59e0b", variant: "warning" },
  medium: { border: "#3b82f6", variant: "info" },
  low: { border: "#64748b", variant: "neutral" },
};

export function ComponentsDependencies() {
  const { businessId } = useParams<{ businessId: string }>();
  const navigate = useNavigate();

  const [business, setBusiness] = useState<BusinessProfile | null>(null);
  const [components, setComponents] = useState<BusinessComponent[]>([]);
  const [dependencies, setDependencies] = useState<Dependency[]>([]);
  const [assumptions, setAssumptions] = useState<BusinessAssumption[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [runs, setRuns] = useState<SimulationRun[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [studioMode, setStudioMode] = useState<"3d" | "flow">("3d");

  // Fault & Live Spatial Twin Controls (initialized from BusinessProfile assumptions)
  const [simOutageId, setSimOutageId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [outageHours, setOutageHours] = useState(2.0);
  const [dailyOrdersCtrl, setDailyOrdersCtrl] = useState(100);
  const [primarySharePct, setPrimarySharePct] = useState(85);
  const [backupCapacityHr, setBackupCapacityHr] = useState(150);
  const [failoverRatePct, setFailoverRatePct] = useState(85);
  const [retryRatePct, setRetryRatePct] = useState(55);
  const [strategyMode, setStrategyMode] = useState<"wait" | "failover" | "queue_retry">("failover");
  const [persistingRun, setPersistingRun] = useState(false);

  // Flow Workbench Outline / Inspector State
  const [searchQuery, setSearchQuery] = useState("");
  const [inspectorTab, setInspectorTab] = useState<"component" | "dependency">("component");
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState("payment_gateway");
  const [editCrit, setEditCrit] = useState<"low" | "medium" | "high" | "critical">("high");
  const [editDesc, setEditDesc] = useState("");
  const [savingInspector, setSavingInspector] = useState(false);

  // New dependency form
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [relType, setRelType] = useState("depends_on");
  const [fallbackInfo, setFallbackInfo] = useState("");

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const loadData = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    setError(null);
    try {
      const [bResp, cResp, dResp, aResp, sResp, rResp] = await Promise.all([
        apiClient.get<BusinessProfile>(`/businesses/${businessId}/`),
        apiClient.get<PaginatedResponse<BusinessComponent>>(`/businesses/${businessId}/components/`),
        apiClient.get<PaginatedResponse<Dependency>>(`/businesses/${businessId}/dependencies/`),
        apiClient.get<PaginatedResponse<BusinessAssumption>>(`/businesses/${businessId}/assumptions/`),
        apiClient.get<PaginatedResponse<Scenario>>("/scenarios/", { params: { business: businessId } }),
        apiClient.get<PaginatedResponse<SimulationRun>>("/simulation/runs/", { params: { business: businessId } }),
      ]);
      setBusiness(bResp.data);
      const comps = cResp.data.results || [];
      const assumpList = aResp.data.results || [];
      setComponents(comps);
      setDependencies(dResp.data.results || []);
      setAssumptions(assumpList);
      setScenarios(sResp.data.results || []);
      setRuns(rResp.data.results || []);

      // Initialize control sliders from real assumptions
      const getA = (k: string) => Number(assumpList.find((x) => x.key === k)?.value_numeric || 0);
      const daily = getA("daily_orders") || Math.round(getA("orders_per_month") / 30) || 100;
      setDailyOrdersCtrl(daily);

      if (comps.length >= 1) {
        const defaultPg = comps.find((c) => c.name.toLowerCase().includes("primary payment")) ||
          comps.find((c) => c.component_type === "payment_gateway") ||
          comps[0];
        setSimOutageId((prev) => prev || defaultPg.id);
        setSelectedNodeId((prev) => prev || comps[0].id);
        setSourceId((prev) => prev || comps[0].id);
        if (comps.length >= 2) setTargetId((prev) => prev || comps[1].id);
      }
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Sync inspector fields when selectedNodeId changes
  useEffect(() => {
    const comp = components.find((c) => c.id === selectedNodeId);
    if (comp) {
      setEditName(comp.name);
      setEditType(comp.component_type);
      setEditCrit(comp.criticality);
      setEditDesc(comp.description || "");
    }
  }, [selectedNodeId, components]);

  // Transitive downstream blast radius
  const impactedIds = useMemo(() => {
    if (!simOutageId) return new Set<string>();
    const affected = new Set<string>();
    const queue = [simOutageId];
    while (queue.length > 0) {
      const curr = queue.shift()!;
      dependencies.forEach((d) => {
        if (d.target_component === curr && d.relationship_type !== "backup_for") {
          if (!affected.has(d.source_component) && d.source_component !== simOutageId) {
            affected.add(d.source_component);
            queue.push(d.source_component);
          }
        }
      });
    }
    return affected;
  }, [simOutageId, dependencies]);

  const backupIds = useMemo(() => {
    if (!simOutageId) return new Set<string>();
    const backups = new Set<string>();
    dependencies.forEach((d) => {
      if (d.target_component === simOutageId && d.relationship_type === "backup_for") {
        backups.add(d.source_component);
      }
    });
    return backups;
  }, [simOutageId, dependencies]);

  // Real-time deterministic preview matching backend PaymentGatewayOutageEngine formulas
  const liveTelemetry = useMemo(() => {
    const aov =
      Number(assumptions.find((a) => a.key === "avg_order_value")?.value_numeric) || 550;
    const currency = business?.currency || "INR";
    const hourlyRate = dailyOrdersCtrl / 24;
    const activeOutage = simOutageId ? outageHours : 0;
    const affectedOrders = hourlyRate * activeOutage * (primarySharePct / 100);
    const affectedValue = affectedOrders * aov;

    let recoveredOrders = 0;
    let mitigationCost = 0;
    if (affectedOrders > 0) {
      if (strategyMode === "wait") {
        recoveredOrders = affectedOrders * 0.25;
      } else if (strategyMode === "failover") {
        const capWindow = backupCapacityHr * activeOutage;
        const redirected = Math.min(affectedOrders, capWindow);
        recoveredOrders = Math.min(affectedOrders, redirected * (failoverRatePct / 100));
        mitigationCost = redirected * 5;
      } else {
        recoveredOrders = affectedOrders * (retryRatePct / 100);
        mitigationCost = affectedOrders * 2;
      }
    }

    const unrecoveredOrders = Math.max(0, affectedOrders - recoveredOrders);
    const recoveredValue = recoveredOrders * aov;
    const unrecoveredValue = unrecoveredOrders * aov;
    const netRecovered = recoveredValue - mitigationCost;
    const survivalRate =
      affectedOrders > 0
        ? Math.min(100, ((dailyOrdersCtrl - unrecoveredOrders) / Math.max(1, dailyOrdersCtrl)) * 100)
        : 100;
    const recoveryRate = affectedOrders > 0 ? (recoveredOrders / affectedOrders) * 100 : 100;

    return {
      currency,
      aov,
      hourlyRate,
      affectedOrders,
      affectedValue,
      recoveredOrders,
      unrecoveredOrders,
      recoveredValue,
      unrecoveredValue,
      mitigationCost,
      netRecovered,
      survivalRate,
      recoveryRate,
    };
  }, [
    assumptions,
    business,
    dailyOrdersCtrl,
    outageHours,
    primarySharePct,
    backupCapacityHr,
    failoverRatePct,
    retryRatePct,
    strategyMode,
    simOutageId,
  ]);

  const nodeMetricsMap = useMemo(() => {
    const map: Record<string, NodeLiveMetrics> = {};
    components.forEach((c) => {
      const isOut = simOutageId === c.id;
      const isImp = impactedIds.has(c.id);
      const isBkp = backupIds.has(c.id) && strategyMode === "failover" && Boolean(simOutageId);
      const util = isOut ? 0 : isBkp ? 94 : isImp ? 45 : 78;
      map[c.id] = {
        utilizationPct: util,
        throughputPerHour: isOut
          ? 0
          : Math.round(liveTelemetry.hourlyRate * (isBkp ? failoverRatePct / 100 : isImp ? 0.5 : 1)),
        status: isOut ? "outage" : isBkp ? "failover" : isImp ? "warning" : "active",
      };
    });
    return map;
  }, [components, simOutageId, impactedIds, backupIds, strategyMode, liveTelemetry.hourlyRate, failoverRatePct]);

  // Build React Flow 2D Workbench Graph
  const buildFlowGraph = useCallback(
    (preservePositions: boolean) => {
      const tierX: Record<string, number> = {
        website: 60,
        process: 320,
        payment_gateway: 320,
        warehouse: 590,
        supplier: 850,
        delivery_partner: 850,
        team: 590,
        other: 320,
      };
      const rowCounters: Record<number, number> = {};

      setNodes((prevNodes) => {
        const posMap = new Map(prevNodes.map((n) => [n.id, n.position]));
        return components.map((comp): Node => {
          const x = tierX[comp.component_type] ?? 320;
          const count = rowCounters[x] || 0;
          rowCounters[x] = count + 1;
          const y = 48 + count * 136;

          const isSelected = selectedNodeId === comp.id;
          const isFailed = simOutageId === comp.id;
          const isImpacted = impactedIds.has(comp.id);
          const isBackup = backupIds.has(comp.id) && Boolean(simOutageId) && strategyMode === "failover";
          const theme = COMPONENT_PALETTE.find((p) => p.type === comp.component_type);
          const accent = isFailed
            ? "#ef4444"
            : isImpacted
              ? "#f59e0b"
              : isBackup
                ? "#22c55e"
                : theme?.color || "#3b82f6";

          return {
            id: comp.id,
            position: preservePositions && posMap.has(comp.id) ? posMap.get(comp.id)! : { x, y },
            data: {
              label: (
                <div className="min-w-[185px] text-left">
                  <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-surface-700/70">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-surface-400">
                      {comp.component_type.replace("_", " ")}
                    </span>
                    <span className="h-2 w-2 rounded-full" style={{ background: accent }} />
                  </div>
                  <div className="mt-1.5 text-xs font-semibold text-white">{comp.name}</div>
                  <div className="mt-1 flex items-center justify-between text-[10px] font-mono">
                    <span className="uppercase" style={{ color: accent }}>
                      {isFailed
                        ? "OUTAGE"
                        : isBackup
                          ? "FAILOVER"
                          : isImpacted
                            ? "IMPACTED"
                            : comp.criticality}
                    </span>
                    <span className="text-surface-500">
                      {nodeMetricsMap[comp.id]?.throughputPerHour ?? 0}/hr
                    </span>
                  </div>
                </div>
              ),
            },
            style: {
              borderRadius: 8,
              padding: "10px 12px",
              border: `${isSelected ? "2px" : "1px"} solid ${isSelected ? "#3b82f6" : accent}`,
              background: isFailed ? "#1c1014" : "#0d121c",
              color: "#f1f5f9",
              cursor: "pointer",
            },
          };
        });
      });

      const flowEdges: Edge[] = dependencies.map((dep) => {
        const isBroken =
          simOutageId &&
          dep.relationship_type !== "backup_for" &&
          (dep.target_component === simOutageId || impactedIds.has(dep.target_component));
        const isFallback = dep.relationship_type === "backup_for";
        const strokeColor = isBroken ? "#ef4444" : isFallback ? "#22c55e" : "#3b82f6";

        return {
          id: dep.id,
          source: dep.source_component,
          target: dep.target_component,
          label: dep.relationship_type.replace("_", " "),
          labelStyle: { fill: isBroken ? "#fca5a5" : "#94a3b8", fontSize: 10, fontFamily: "JetBrains Mono" },
          labelBgStyle: { fill: "#080b12", fillOpacity: 0.95 },
          labelBgPadding: [6, 3] as [number, number],
          labelBgBorderRadius: 4,
          animated: Boolean(!isBroken && (dep.relationship_type === "depends_on" || isFallback)),
          markerEnd: { type: MarkerType.ArrowClosed, color: strokeColor },
          style: { stroke: strokeColor, strokeWidth: isBroken ? 2 : 1.6 },
        };
      });
      setEdges(flowEdges);
    },
    [components, dependencies, selectedNodeId, simOutageId, impactedIds, backupIds, strategyMode, nodeMetricsMap, setNodes, setEdges]
  );

  useEffect(() => {
    buildFlowGraph(true);
  }, [buildFlowGraph]);

  // Quick-add from Studio Component Palette (Screenshot 2 style)
  const handleQuickAddPalette = async (paletteItem: (typeof COMPONENT_PALETTE)[number]) => {
    if (!businessId) return;
    setError(null);
    const countSame = components.filter((c) => c.component_type === paletteItem.type).length;
    const autoName = `${paletteItem.label}${countSame > 0 ? ` ${countSame + 1}` : ""}`;
    try {
      const resp = await apiClient.post<BusinessComponent>(`/businesses/${businessId}/components/`, {
        name: autoName,
        component_type: paletteItem.type,
        criticality: "high",
        description: paletteItem.desc,
      });
      setSelectedNodeId(resp.data.id);
      setInspectorTab("component");
      await loadData();
    } catch (err) {
      setError(extractApiError(err));
    }
  };

  const handleSaveInspector = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId || !selectedNodeId) return;
    setSavingInspector(true);
    setError(null);
    try {
      await apiClient.patch(`/businesses/${businessId}/components/${selectedNodeId}/`, {
        name: editName,
        component_type: editType,
        criticality: editCrit,
        description: editDesc,
      });
      await loadData();
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setSavingInspector(false);
    }
  };

  const handleDeleteComponent = async (componentId: string) => {
    if (!businessId) return;
    setError(null);
    try {
      await apiClient.delete(`/businesses/${businessId}/components/${componentId}/`);
      if (simOutageId === componentId) setSimOutageId(null);
      if (selectedNodeId === componentId) setSelectedNodeId(null);
      await loadData();
    } catch (err) {
      setError(extractApiError(err));
    }
  };

  const handleConnect = async (connection: Connection) => {
    if (!businessId || !connection.source || !connection.target || connection.source === connection.target) {
      return;
    }
    setError(null);
    try {
      await apiClient.post(`/businesses/${businessId}/dependencies/`, {
        source_component: connection.source,
        target_component: connection.target,
        relationship_type: relType,
        fallback_info: fallbackInfo,
      });
      await loadData();
    } catch (err) {
      setError(extractApiError(err));
    }
  };

  const handleAddDependency = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId || !sourceId || !targetId) return;
    setError(null);
    try {
      await apiClient.post(`/businesses/${businessId}/dependencies/`, {
        source_component: sourceId,
        target_component: targetId,
        relationship_type: relType,
        fallback_info: fallbackInfo,
      });
      setFallbackInfo("");
      await loadData();
    } catch (err) {
      setError(extractApiError(err));
    }
  };

  const handleDeleteDependency = async (depId: string) => {
    if (!businessId) return;
    setError(null);
    try {
      await apiClient.delete(`/businesses/${businessId}/dependencies/${depId}/`);
      await loadData();
    } catch (err) {
      setError(extractApiError(err));
    }
  };

  // Bridge Live Spatial Twin parameters straight to an immutable backend SimulationRun
  const handlePersistSnapshotRun = async () => {
    if (!businessId) return;
    setPersistingRun(true);
    setError(null);
    try {
      // Find existing resilience scenario or instantiate one from template
      let resScenario = scenarios.find((s) => s.module === "resilience");
      if (!resScenario) {
        const tplResp = await apiClient.get<{ results: Array<{ id: string; key: string }> }>(
          "/scenarios/templates/"
        );
        const tpl = (tplResp.data.results || []).find((t) => t.key === "payment_gateway_outage");
        if (!tpl) throw new Error("Resilience scenario template not found.");
        const created = await apiClient.post<Scenario>("/scenarios/", {
          business: businessId,
          template: tpl.id,
          module: "resilience",
          name: `${outageHours}h Outage Spatial Run`,
        });
        resScenario = created.data;
      }

      // Apply current spatial slider parameters before invoking SimulationOrchestrator
      await Promise.all([
        apiClient.post(`/scenarios/${resScenario.id}/parameters/`, {
          key: "outage_duration_hours",
          value_numeric: String(outageHours),
          unit: "hours",
          override_type: "absolute",
        }),
        apiClient.post(`/scenarios/${resScenario.id}/parameters/`, {
          key: "daily_orders",
          value_numeric: String(dailyOrdersCtrl),
          unit: "orders/day",
          override_type: "absolute",
        }),
        apiClient.post(`/scenarios/${resScenario.id}/parameters/`, {
          key: "primary_gateway_share",
          value_numeric: (primarySharePct / 100).toFixed(2),
          unit: "ratio",
          override_type: "absolute",
        }),
        apiClient.post(`/scenarios/${resScenario.id}/parameters/`, {
          key: "backup_gateway_capacity",
          value_numeric: String(backupCapacityHr),
          unit: "orders/hour",
          override_type: "absolute",
        }),
        apiClient.post(`/scenarios/${resScenario.id}/parameters/`, {
          key: "failover_success_rate",
          value_numeric: (failoverRatePct / 100).toFixed(2),
          unit: "ratio",
          override_type: "absolute",
        }),
        apiClient.post(`/scenarios/${resScenario.id}/parameters/`, {
          key: "retry_success_rate",
          value_numeric: (retryRatePct / 100).toFixed(2),
          unit: "ratio",
          override_type: "absolute",
        }),
      ]);

      const runResp = await apiClient.post<SimulationRun>("/simulation/runs/", {
        scenario_id: resScenario.id,
      });
      navigate(`/app/simulation/runs/${runResp.data.id}`);
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setPersistingRun(false);
    }
  };

  if (loading) return <LoadingState label="Initializing spatial workbench..." />;

  const selectedComp = components.find((c) => c.id === selectedNodeId);
  const faultedComp = components.find((c) => c.id === simOutageId);
  const latestRun = runs[0];
  const filteredOutline = components.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.trim().toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Studio Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-surface-700/80 bg-surface-900 px-4 py-2.5">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-success-400" />
            <h1 className="text-sm font-semibold text-white truncate">
              {business?.name || "Business"} — Operational Twin & Topology
            </h1>
          </div>
          {faultedComp && (
            <Badge variant="danger" dot>
              Outage Target: {faultedComp.name} ({impactedIds.size} impacted)
            </Badge>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Segmented Mode Switcher matching Studio Workbench */}
          <div className="inline-flex rounded-md border border-surface-700 bg-surface-950 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setStudioMode("3d")}
              className={`inline-flex items-center gap-1.5 rounded px-3 py-1 font-medium transition-colors ${
                studioMode === "3d"
                  ? "bg-brand-600 text-white"
                  : "text-surface-400 hover:text-surface-100"
              }`}
            >
              <Box className="h-3.5 w-3.5" /> 3D Spatial Twin
            </button>
            <button
              type="button"
              onClick={() => setStudioMode("flow")}
              className={`inline-flex items-center gap-1.5 rounded px-3 py-1 font-medium transition-colors ${
                studioMode === "flow"
                  ? "bg-brand-600 text-white"
                  : "text-surface-400 hover:text-surface-100"
              }`}
            >
              <Workflow className="h-3.5 w-3.5" /> 2D Flow Studio
            </button>
          </div>

          {simOutageId && (
            <Button size="xs" variant="outline" onClick={() => setSimOutageId(null)}>
              Clear Fault
            </Button>
          )}

          <Button size="xs" onClick={handlePersistSnapshotRun} loading={persistingRun}>
            <Play className="h-3.5 w-3.5" /> Persist Snapshot Run
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="error" dismissible onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* ─── MODE 1: ISOMETRIC 3D SPATIAL TWIN WORKBENCH (Screenshot 1) ─── */}
      {studioMode === "3d" && (
        <div className="grid gap-0 overflow-hidden rounded-lg border border-surface-700/80 bg-surface-900 lg:grid-cols-12">
          {/* Left Rail: Simulation Controls */}
          <div className="lg:col-span-3 border-b lg:border-b-0 lg:border-r border-surface-700/80 bg-surface-900 flex flex-col justify-between">
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between border-b border-surface-800 pb-3">
                <div className="flex items-center gap-2">
                  <Sliders className="h-4 w-4 text-accent-400" />
                  <span className="text-xs font-semibold text-white">Simulation Controls</span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono text-success-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-success-400" />
                    Live
                  </span>
                </div>
                <div className="text-right">
                  <p className="text-[9px] uppercase tracking-wider text-surface-500">Flow Rate</p>
                  <p className="font-mono text-xs font-semibold text-accent-400 tabular-nums">
                    {Math.round(liveTelemetry.hourlyRate)}/hr
                  </p>
                </div>
              </div>

              {/* Interactive Sliders */}
              <div className="space-y-3">
                {[
                  {
                    label: "Outage Window",
                    val: `${outageHours.toFixed(1)} hrs`,
                    min: 0,
                    max: 12,
                    step: 0.5,
                    current: outageHours,
                    set: setOutageHours,
                  },
                  {
                    label: "Daily Order Demand",
                    val: `${dailyOrdersCtrl}/day`,
                    min: 20,
                    max: 5000,
                    step: 20,
                    current: dailyOrdersCtrl,
                    set: setDailyOrdersCtrl,
                  },
                  {
                    label: "Primary Gateway Share",
                    val: `${primarySharePct}%`,
                    min: 10,
                    max: 100,
                    step: 5,
                    current: primarySharePct,
                    set: setPrimarySharePct,
                  },
                  {
                    label: "Backup Capacity",
                    val: `${backupCapacityHr}/hr`,
                    min: 10,
                    max: 500,
                    step: 10,
                    current: backupCapacityHr,
                    set: setBackupCapacityHr,
                  },
                  {
                    label: "Failover Success",
                    val: `${failoverRatePct}%`,
                    min: 20,
                    max: 100,
                    step: 5,
                    current: failoverRatePct,
                    set: setFailoverRatePct,
                  },
                  {
                    label: "Queue Retry Success",
                    val: `${retryRatePct}%`,
                    min: 10,
                    max: 95,
                    step: 5,
                    current: retryRatePct,
                    set: setRetryRatePct,
                  },
                ].map((ctrl) => (
                  <div key={ctrl.label} className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-surface-300">{ctrl.label}</span>
                      <span className="font-mono font-medium text-surface-100 tabular-nums">
                        {ctrl.val}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={ctrl.min}
                      max={ctrl.max}
                      step={ctrl.step}
                      value={ctrl.current}
                      onChange={(e) => ctrl.set(Number(e.target.value))}
                      className="studio-slider w-full"
                    />
                  </div>
                ))}
              </div>

              {/* Mitigation Mode & Fault Injection Target */}
              <div className="space-y-2.5 border-t border-surface-800 pt-3">
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-surface-400 mb-1.5">
                    Mitigation Strategy
                  </label>
                  <div className="grid grid-cols-3 gap-1 rounded-md border border-surface-700 bg-surface-950 p-0.5 text-[11px]">
                    {(
                      [
                        { k: "wait", label: "Wait" },
                        { k: "failover", label: "Failover" },
                        { k: "queue_retry", label: "Queue" },
                      ] as const
                    ).map((st) => (
                      <button
                        key={st.k}
                        type="button"
                        onClick={() => setStrategyMode(st.k)}
                        className={`rounded py-1 font-medium transition-colors ${
                          strategyMode === st.k
                            ? "bg-brand-600 text-white"
                            : "text-surface-400 hover:text-white"
                        }`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label htmlFor="faultTarget" className="block text-[10px] font-semibold uppercase tracking-wider text-surface-400 mb-1">
                    Fault Injection Target
                  </label>
                  <select
                    id="faultTarget"
                    value={simOutageId || ""}
                    onChange={(e) => setSimOutageId(e.target.value || null)}
                    className="field !py-1.5 text-xs"
                  >
                    <option value="">Nominal Operation (No Fault)</option>
                    {components.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.criticality})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center justify-between rounded-md border border-surface-800 bg-surface-950 px-3 py-2 text-xs">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-surface-500">
                      Orders Exposed
                    </p>
                    <p className="font-mono font-semibold text-white tabular-nums">
                      {liveTelemetry.affectedOrders.toFixed(1)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-wider text-surface-500">
                      Recovered
                    </p>
                    <p className="font-mono font-semibold text-success-400 tabular-nums">
                      {liveTelemetry.recoveryRate.toFixed(1)}%
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setOutageHours(2.0);
                    setPrimarySharePct(85);
                    setBackupCapacityHr(150);
                    setFailoverRatePct(85);
                    setRetryRatePct(55);
                    setStrategyMode("failover");
                  }}
                  className="flex w-full items-center justify-center gap-1.5 rounded-md border border-surface-700 bg-surface-850 py-1.5 text-xs font-medium text-surface-300 hover:bg-surface-800 hover:text-white transition-colors"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Reset Controls
                </button>
              </div>
            </div>

            {/* Bottom Quick Links (Screenshot 1 Latest Dashboards panel) */}
            <div className="border-t border-surface-800 bg-surface-950/60 p-3 space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-surface-500 px-1">
                Linked Decision Flows
              </p>
              {latestRun && (
                <Link
                  to={`/app/simulation/runs/${latestRun.id}/compare`}
                  className="flex items-center justify-between rounded-md border border-surface-800 bg-surface-900 px-2.5 py-2 text-xs text-surface-200 hover:border-surface-600 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Activity className="h-3.5 w-3.5 text-brand-400" /> Strategy Matrix
                  </span>
                  <ArrowRight className="h-3 w-3 text-surface-500" />
                </Link>
              )}
              {latestRun && (
                <Link
                  to={`/app/ai-analyst/${latestRun.id}`}
                  className="flex items-center justify-between rounded-md border border-surface-800 bg-surface-900 px-2.5 py-2 text-xs text-surface-200 hover:border-surface-600 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Bot className="h-3.5 w-3.5 text-accent-400" /> AI Analyst Center
                  </span>
                  <ArrowRight className="h-3 w-3 text-surface-500" />
                </Link>
              )}
            </div>
          </div>

          {/* Center Isometric 3D Canvas + Floating Right Telemetry HUD */}
          <div className="lg:col-span-9 relative flex flex-col xl:flex-row">
            <div className="flex-1 min-h-[540px]">
              {components.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
                  <Box className="h-10 w-10 text-surface-600" />
                  <p className="text-sm font-medium text-surface-200">
                    No components modeled yet
                  </p>
                  <p className="text-xs text-surface-400 max-w-sm">
                    Switch to 2D Flow Studio to add Checkout, Payment Gateway, Warehouse, and Fulfillment nodes.
                  </p>
                  <Button size="sm" onClick={() => setStudioMode("flow")}>
                    Open 2D Flow Studio
                  </Button>
                </div>
              ) : (
                <IsometricWarRoom3D
                  components={components}
                  dependencies={dependencies}
                  simOutageId={simOutageId}
                  impactedIds={impactedIds}
                  backupIds={backupIds}
                  mitigationStrategy={strategyMode}
                  hourlyRate={liveTelemetry.hourlyRate}
                  nodeMetrics={nodeMetricsMap}
                  onSelectNode={(id) => {
                    setSelectedNodeId(id);
                    setSimOutageId((prev) => (prev === id ? null : id));
                  }}
                />
              )}
            </div>

            {/* Right Telemetry HUD Column matching Screenshot 1 */}
            <div className="xl:w-64 border-t xl:border-t-0 xl:border-l border-surface-700/80 bg-[#0a0e17]/95 p-3.5 flex flex-col justify-between gap-3">
              <div className="space-y-3">
                <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-surface-400">
                  <span>Live Telemetry Preview</span>
                  <span className="text-accent-400">
                    {simOutageId ? strategyMode.toUpperCase() : "NOMINAL"}
                  </span>
                </div>

                <TelemetryCard
                  label="Service Continuity"
                  value={liveTelemetry.survivalRate.toFixed(1)}
                  unit="%"
                  delta={`${liveTelemetry.recoveryRate.toFixed(0)}% mitigated`}
                  deltaTone={liveTelemetry.survivalRate >= 90 ? "up" : "down"}
                  gaugePct={liveTelemetry.survivalRate}
                  gaugeColor={liveTelemetry.survivalRate >= 90 ? "success" : "warning"}
                  icon={<Zap className="h-3.5 w-3.5 text-warning-400" />}
                />

                <TelemetryCard
                  label="Order Throughput"
                  value={Math.round(liveTelemetry.hourlyRate * 24).toLocaleString("en-IN")}
                  unit="ord/day"
                  delta={`${liveTelemetry.hourlyRate.toFixed(1)}/hr`}
                  deltaTone="neutral"
                  gaugePct={Math.min(100, (liveTelemetry.hourlyRate / Math.max(1, backupCapacityHr)) * 80)}
                  gaugeColor="cyan"
                  icon={<Activity className="h-3.5 w-3.5 text-accent-400" />}
                />

                <TelemetryCard
                  label="Recovered Value"
                  value={formatCurrency(liveTelemetry.netRecovered, liveTelemetry.currency)}
                  delta={`${liveTelemetry.recoveredOrders.toFixed(0)} ord`}
                  deltaTone="up"
                  gaugePct={liveTelemetry.recoveryRate}
                  gaugeColor="success"
                  icon={<CheckCircle2 className="h-3.5 w-3.5 text-success-400" />}
                  note={`Gross exposed: ${formatCurrency(liveTelemetry.affectedValue, liveTelemetry.currency)}`}
                />

                <TelemetryCard
                  label="Unrecovered Exposure"
                  value={formatCurrency(liveTelemetry.unrecoveredValue, liveTelemetry.currency)}
                  delta={`${liveTelemetry.unrecoveredOrders.toFixed(0)} ord`}
                  deltaTone={liveTelemetry.unrecoveredOrders > 0 ? "down" : "neutral"}
                  gaugePct={
                    liveTelemetry.affectedOrders > 0
                      ? (liveTelemetry.unrecoveredOrders / liveTelemetry.affectedOrders) * 100
                      : 0
                  }
                  gaugeColor={liveTelemetry.unrecoveredOrders > 0 ? "danger" : "cyan"}
                  icon={<AlertTriangle className="h-3.5 w-3.5 text-warning-400" />}
                  note="Not guaranteed revenue loss; depends on recapture behavior."
                />
              </div>

              <div className="rounded-md border border-surface-800 bg-surface-900/90 p-2.5 text-[10px] text-surface-400 leading-relaxed">
                Adjust sliders on the left or click any 3D block to preview cascading disruptions. Click{" "}
                <strong className="text-white">Persist Snapshot Run</strong> to save an authoritative Decimal engine snapshot.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODE 2: 2D NODE FLOW STUDIO WORKBENCH (Screenshot 2) ─── */}
      {studioMode === "flow" && (
        <div className="overflow-hidden rounded-lg border border-surface-700/80 bg-surface-900">
          <div className="grid lg:grid-cols-12 min-h-[580px]">
            {/* Left Rail: Outline + Component Node Library (Screenshot 2) */}
            <div className="lg:col-span-3 border-b lg:border-b-0 lg:border-r border-surface-700/80 bg-surface-900 flex flex-col">
              <div className="p-3 border-b border-surface-800">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-surface-500" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter components..."
                    className="field !py-1.5 pl-8 text-xs"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-surface-800">
                {/* Outline Section */}
                <div className="p-3 space-y-1">
                  <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-surface-500">
                    Outline ({filteredOutline.length})
                  </p>
                  {filteredOutline.map((c) => {
                    const isSel = selectedNodeId === c.id;
                    const badgeColor = CRIT_BADGE[c.criticality]?.border || "#3b82f6";
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setSelectedNodeId(c.id);
                          setInspectorTab("component");
                        }}
                        className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors ${
                          isSel
                            ? "bg-brand-600/15 text-white border border-brand-500/40"
                            : "text-surface-300 hover:bg-surface-850 border border-transparent"
                        }`}
                      >
                        <span className="flex items-center gap-2 truncate">
                          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: badgeColor }} />
                          <span className="truncate">{c.name}</span>
                        </span>
                        <span className="text-[10px] font-mono text-surface-500 uppercase">
                          {c.criticality.slice(0, 4)}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Click-to-Add Node Palette */}
                <div className="p-3 space-y-1.5">
                  <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-surface-500">
                    Node Palette (Click to Add)
                  </p>
                  {COMPONENT_PALETTE.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.type}
                        type="button"
                        onClick={() => void handleQuickAddPalette(item)}
                        className="flex w-full items-center gap-2.5 rounded-md border border-surface-800 bg-surface-950/70 px-2.5 py-2 text-left hover:border-surface-600 hover:bg-surface-850 transition-colors"
                      >
                        <span
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-surface-700"
                          style={{ color: item.color }}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-surface-100 truncate">{item.label}</p>
                          <p className="text-[10px] text-surface-500 truncate">{item.desc}</p>
                        </div>
                        <Plus className="h-3.5 w-3.5 text-surface-400 shrink-0" />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Center Infinite Dotted Canvas */}
            <div className="lg:col-span-6 h-[560px] lg:h-auto studio-grid-bg relative">
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={handleConnect}
                onNodeClick={(_, node) => {
                  setSelectedNodeId(node.id);
                  setInspectorTab("component");
                }}
                fitView
                proOptions={{ hideAttribution: true }}
              >
                <Background
                  variant={BackgroundVariant.Dots}
                  gap={20}
                  size={1}
                  color="rgba(148, 163, 184, 0.2)"
                />
                <Controls />
                <MiniMap
                  nodeColor={(n) => {
                    const comp = components.find((c) => c.id === n.id);
                    return CRIT_BADGE[comp?.criticality || "low"]?.border || "#3b82f6";
                  }}
                  maskColor="rgba(8, 11, 18, 0.75)"
                />
              </ReactFlow>
            </div>

            {/* Right Property Inspector Drawer (Screenshot 2 Edit Node / Criticality Radio Cards) */}
            <div className="lg:col-span-3 border-t lg:border-t-0 lg:border-l border-surface-700/80 bg-surface-900 flex flex-col">
              <div className="flex border-b border-surface-800 bg-surface-950/60 p-1 gap-1">
                <button
                  type="button"
                  onClick={() => setInspectorTab("component")}
                  className={`flex-1 rounded py-1.5 text-xs font-medium transition-colors ${
                    inspectorTab === "component" ? "bg-surface-800 text-white" : "text-surface-400 hover:text-white"
                  }`}
                >
                  Component Inspector
                </button>
                <button
                  type="button"
                  onClick={() => setInspectorTab("dependency")}
                  className={`flex-1 rounded py-1.5 text-xs font-medium transition-colors ${
                    inspectorTab === "dependency" ? "bg-surface-800 text-white" : "text-surface-400 hover:text-white"
                  }`}
                >
                  Dependencies ({dependencies.length})
                </button>
              </div>

              {inspectorTab === "component" ? (
                selectedComp ? (
                  <form onSubmit={handleSaveInspector} className="flex-1 flex flex-col justify-between p-4 space-y-4">
                    <div className="space-y-4">
                      <div className="flex items-start justify-between gap-2 border-b border-surface-800 pb-3">
                        <div className="min-w-0">
                          <p className="text-[10px] font-mono text-surface-500 truncate">
                            ID: {selectedComp.id.slice(0, 8)}…
                          </p>
                          <h3 className="text-sm font-semibold text-white truncate">
                            {selectedComp.name}
                          </h3>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setSimOutageId((prev) => (prev === selectedComp.id ? null : selectedComp.id))
                          }
                          className={`rounded border px-2 py-1 text-[10px] font-mono font-medium transition-colors ${
                            simOutageId === selectedComp.id
                              ? "border-danger-500 bg-danger-500/15 text-danger-300"
                              : "border-surface-700 bg-surface-850 text-surface-300 hover:text-white"
                          }`}
                        >
                          {simOutageId === selectedComp.id ? "FAULT ACTIVE" : "TEST OUTAGE"}
                        </button>
                      </div>

                      <div>
                        <label className="field-label">Name *</label>
                        <input
                          type="text"
                          required
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="field text-xs"
                        />
                      </div>

                      <div>
                        <label className="field-label">Component Type</label>
                        <select
                          value={editType}
                          onChange={(e) => setEditType(e.target.value)}
                          className="field text-xs"
                        >
                          <option value="website">Website / Checkout</option>
                          <option value="payment_gateway">Payment Gateway</option>
                          <option value="process">Process / Engine</option>
                          <option value="warehouse">Warehouse / Dark Store</option>
                          <option value="supplier">Supplier</option>
                          <option value="delivery_partner">Delivery Partner</option>
                          <option value="team">Operations Team</option>
                          <option value="other">Other</option>
                        </select>
                      </div>

                      {/* Segmented Criticality Selector (Screenshot 2 Thinking Mode selector style) */}
                      <div>
                        <label className="field-label">Failure Criticality</label>
                        <div className="grid grid-cols-2 gap-2">
                          {(
                            [
                              { k: "low", label: "Low", sub: "Minor" },
                              { k: "medium", label: "Medium", sub: "Degraded" },
                              { k: "high", label: "High", sub: "Major" },
                              { k: "critical", label: "Critical", sub: "Halts ops" },
                            ] as const
                          ).map((lvl) => (
                            <button
                              key={lvl.k}
                              type="button"
                              onClick={() => setEditCrit(lvl.k)}
                              className={`rounded-md border p-2 text-left transition-colors ${
                                editCrit === lvl.k
                                  ? "border-brand-500 bg-brand-600/15 text-white"
                                  : "border-surface-700 bg-surface-950 text-surface-400 hover:border-surface-600"
                              }`}
                            >
                              <div className="text-xs font-semibold">{lvl.label}</div>
                              <div className="text-[10px] text-surface-500">{lvl.sub}</div>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="field-label">Operational Description</label>
                        <textarea
                          rows={3}
                          value={editDesc}
                          onChange={(e) => setEditDesc(e.target.value)}
                          placeholder="Capacity limits, SLA, fallback notes..."
                          className="field resize-none text-xs"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t border-surface-800 pt-3">
                      <button
                        type="button"
                        onClick={() => void handleDeleteComponent(selectedComp.id)}
                        className="inline-flex items-center gap-1 rounded px-2.5 py-1.5 text-xs text-danger-400 hover:bg-danger-500/10 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </button>
                      <Button type="submit" size="sm" loading={savingInspector}>
                        <Save className="h-3.5 w-3.5" /> Save Changes
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div className="flex-1 flex items-center justify-center p-6 text-center text-xs text-surface-500">
                    Click any component node in the canvas or Outline to inspect and configure its properties.
                  </div>
                )
              ) : (
                <div className="flex-1 flex flex-col justify-between p-4 space-y-4 overflow-y-auto">
                  <form onSubmit={handleAddDependency} className="space-y-3 border-b border-surface-800 pb-4">
                    <p className="text-xs font-semibold text-white flex items-center gap-1.5">
                      <GitBranch className="h-3.5 w-3.5 text-brand-400" /> Link Components
                    </p>
                    <div>
                      <label className="field-label">Source</label>
                      <select value={sourceId} onChange={(e) => setSourceId(e.target.value)} className="field text-xs">
                        {components.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="field-label">Target</label>
                      <select value={targetId} onChange={(e) => setTargetId(e.target.value)} className="field text-xs">
                        {components.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="field-label">Relationship</label>
                      <select value={relType} onChange={(e) => setRelType(e.target.value)} className="field text-xs">
                        <option value="depends_on">Depends On</option>
                        <option value="backup_for">Backup For</option>
                        <option value="processes_for">Processes For</option>
                        <option value="supplies">Supplies</option>
                        <option value="fulfills">Fulfills</option>
                      </select>
                    </div>
                    <div>
                      <label className="field-label">Fallback Note</label>
                      <input
                        type="text"
                        value={fallbackInfo}
                        onChange={(e) => setFallbackInfo(e.target.value)}
                        placeholder="Optional failover detail"
                        className="field text-xs"
                      />
                    </div>
                    <Button type="submit" size="sm" className="w-full justify-center" disabled={components.length < 2}>
                      <Plus className="h-3.5 w-3.5" /> Add Dependency Link
                    </Button>
                  </form>

                  <div className="space-y-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-surface-500">
                      Registered Links ({dependencies.length})
                    </p>
                    {dependencies.map((d) => (
                      <div key={d.id} className="flex items-start justify-between gap-2 rounded border border-surface-800 bg-surface-950 px-2.5 py-2 text-xs">
                        <div className="min-w-0">
                          <p className="font-medium text-surface-100 truncate">{d.source_component_name}</p>
                          <p className="text-[10px] font-mono text-brand-400">
                            [{d.relationship_type}] → {d.target_component_name}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleDeleteDependency(d.id)}
                          className="text-surface-500 hover:text-danger-400 shrink-0"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Studio Status Bar (Screenshot 2 bottom chrome) */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-surface-700/80 bg-surface-950 px-4 py-1.5 text-[11px] font-mono text-surface-400">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5 text-success-400">
                <CheckCircle2 className="h-3.5 w-3.5" /> Model Synced
              </span>
              <span>{components.length} components</span>
              <span>{dependencies.length} dependencies</span>
            </div>
            <button
              type="button"
              onClick={() => buildFlowGraph(false)}
              className="inline-flex items-center gap-1 hover:text-white transition-colors"
            >
              <RotateCcw className="h-3 w-3" /> Auto-Arrange Tiers
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
