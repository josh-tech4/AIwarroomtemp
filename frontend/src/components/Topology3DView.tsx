import React, { useMemo, useRef, useState } from "react";
import { RotateCcw, ZoomIn, ZoomOut, Move3d } from "lucide-react";
import type { BusinessComponent, Dependency } from "../types/api";

interface Topology3DViewProps {
  components: BusinessComponent[];
  dependencies: Dependency[];
  simOutageId: string | null;
  impactedIds: Set<string>;
  backupIds: Set<string>;
  onSelectNode: (componentId: string) => void;
}

const LAYER_CONFIG = [
  {
    id: "edge",
    title: "Layer 1 · Customer & Checkout",
    types: ["website"],
    z: 95,
    accent: "rgba(59, 130, 246, 0.28)",
    border: "rgba(96, 165, 250, 0.35)",
  },
  {
    id: "core",
    title: "Layer 2 · Payment & Core Services",
    types: ["payment_gateway", "other"],
    z: 0,
    accent: "rgba(6, 182, 212, 0.22)",
    border: "rgba(34, 211, 238, 0.35)",
  },
  {
    id: "fulfill",
    title: "Layer 3 · Warehouse, Supply & Delivery",
    types: ["warehouse", "supplier", "delivery_partner"],
    z: -95,
    accent: "rgba(168, 85, 247, 0.2)",
    border: "rgba(192, 132, 252, 0.35)",
  },
];

export function Topology3DView({
  components,
  dependencies,
  simOutageId,
  impactedIds,
  backupIds,
  onSelectNode,
}: Topology3DViewProps) {
  const [rotX, setRotX] = useState(54);
  const [rotZ, setRotZ] = useState(-24);
  const [zoom, setZoom] = useState(1);
  const dragRef = useRef<{ active: boolean; x: number; y: number; rx: number; rz: number }>({
    active: false,
    x: 0,
    y: 0,
    rx: 54,
    rz: -24,
  });

  const layeredComponents = useMemo(() => {
    return LAYER_CONFIG.map((layer) => ({
      ...layer,
      items: components.filter((c) => layer.types.includes(c.component_type)),
    }));
  }, [components]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button")) return;
    dragRef.current = { active: true, x: e.clientX, y: e.clientY, rx: rotX, rz: rotZ };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    setRotX(Math.max(15, Math.min(78, dragRef.current.rx - dy * 0.35)));
    setRotZ(Math.max(-85, Math.min(85, dragRef.current.rz + dx * 0.45)));
  };

  const handlePointerUp = () => {
    dragRef.current.active = false;
  };

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className="relative h-[420px] w-full overflow-hidden bg-surface-950 select-none cursor-grab active:cursor-grabbing"
    >
      {/* Ambient radial lighting */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(37,99,235,0.16),transparent_65%)]" />

      {/* 3D HUD Controls */}
      <div className="absolute top-3 left-4 z-20 flex items-center gap-2 rounded-xl border border-surface-700/60 bg-surface-900/85 px-3 py-1.5 text-[11px] text-surface-300 backdrop-blur-md">
        <Move3d className="h-3.5 w-3.5 text-brand-400" />
        <span>Drag to orbit 3D · Click node to trigger blast radius</span>
      </div>

      <div className="absolute top-3 right-4 z-20 flex items-center gap-1.5 rounded-xl border border-surface-700/60 bg-surface-900/85 p-1 backdrop-blur-md">
        <button
          type="button"
          title="Zoom in"
          onClick={() => setZoom((z) => Math.min(1.35, Number((z + 0.1).toFixed(2))))}
          className="rounded-lg p-1.5 text-surface-300 hover:bg-surface-800 hover:text-white transition-colors"
        >
          <ZoomIn className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="Zoom out"
          onClick={() => setZoom((z) => Math.max(0.7, Number((z - 0.1).toFixed(2))))}
          className="rounded-lg p-1.5 text-surface-300 hover:bg-surface-800 hover:text-white transition-colors"
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="Reset 3D camera"
          onClick={() => {
            setRotX(54);
            setRotZ(-24);
            setZoom(1);
          }}
          className="rounded-lg p-1.5 text-surface-300 hover:bg-surface-800 hover:text-white transition-colors"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Telemetry Readout */}
      <div className="pointer-events-none absolute bottom-3 left-4 z-20 flex items-center gap-3 text-[10px] font-mono text-surface-500">
        <span>PITCH {Math.round(rotX)}°</span>
        <span>YAW {Math.round(rotZ)}°</span>
        <span>ZOOM {Math.round(zoom * 100)}%</span>
        <span>LINKS {dependencies.length}</span>
      </div>

      {/* 3D Perspective Stage */}
      <div
        className="flex h-full w-full items-center justify-center"
        style={{ perspective: "1200px" }}
      >
        <div
          className="relative h-[260px] w-[420px] sm:w-[500px] transition-transform duration-75"
          style={{
            transformStyle: "preserve-3d",
            transform: `scale(${zoom}) rotateX(${rotX}deg) rotateZ(${rotZ}deg)`,
          }}
        >
          {layeredComponents.map((layer) => (
            <div
              key={layer.id}
              className="absolute inset-0 rounded-2xl border p-4"
              style={{
                transform: `translateZ(${layer.z}px)`,
                transformStyle: "preserve-3d",
                background:
                  "linear-gradient(135deg, rgba(15,23,42,0.82), rgba(2,6,23,0.72))",
                borderColor: layer.border,
                boxShadow: `0 18px 40px rgba(0,0,0,0.45), inset 0 0 24px ${layer.accent}`,
              }}
            >
              <div className="mb-2 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-surface-400">
                <span>{layer.title}</span>
                <span>{layer.items.length} node(s)</span>
              </div>

              <div
                className="grid grid-cols-2 sm:grid-cols-3 gap-2.5"
                style={{ transformStyle: "preserve-3d" }}
              >
                {layer.items.map((comp) => {
                  const isFailed = simOutageId === comp.id;
                  const isImpacted = impactedIds.has(comp.id);
                  const isBackup = backupIds.has(comp.id);
                  const depCount = dependencies.filter(
                    (d) => d.source_component === comp.id || d.target_component === comp.id
                  ).length;

                  const borderColor = isFailed
                    ? "#ef4444"
                    : isImpacted
                      ? "#f59e0b"
                      : isBackup
                        ? "#22c55e"
                        : comp.criticality === "critical"
                          ? "#f87171"
                          : "#3b82f6";

                  const glowShadow = isFailed
                    ? "0 10px 28px rgba(239,68,68,0.55)"
                    : isImpacted
                      ? "0 8px 22px rgba(245,158,11,0.45)"
                      : isBackup
                        ? "0 8px 22px rgba(34,197,94,0.45)"
                        : "0 8px 18px rgba(15,23,42,0.8)";

                  return (
                    <button
                      key={comp.id}
                      type="button"
                      onClick={() => onSelectNode(comp.id)}
                      className="group relative rounded-xl border px-3 py-2 text-left transition-transform duration-200 hover:-translate-y-0.5"
                      style={{
                        transform: isFailed
                          ? "translateZ(26px)"
                          : isImpacted || isBackup
                            ? "translateZ(18px)"
                            : "translateZ(12px)",
                        background: isFailed
                          ? "rgba(127, 29, 29, 0.92)"
                          : "rgba(30, 41, 59, 0.92)",
                        borderColor,
                        boxShadow: glowShadow,
                      }}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="truncate text-[11px] font-bold text-white">
                          {comp.name}
                        </span>
                        <span
                          className={`h-2 w-2 rounded-full shrink-0 ${
                            isFailed || isImpacted ? "animate-ping" : ""
                          }`}
                          style={{ background: borderColor }}
                        />
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[9px] text-surface-400">
                        <span className="capitalize">{comp.criticality}</span>
                        <span>{depCount} link(s)</span>
                      </div>
                    </button>
                  );
                })}
                {layer.items.length === 0 && (
                  <div className="col-span-full flex h-24 items-center justify-center text-[11px] text-surface-600">
                    No components assigned to this tier
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

