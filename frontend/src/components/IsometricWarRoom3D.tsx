import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import type { BusinessComponent, Dependency } from "../types/api";

export interface NodeLiveMetrics {
  utilizationPct: number;
  throughputPerHour: number;
  status: "active" | "warning" | "outage" | "failover";
}

interface IsometricWarRoom3DProps {
  components: BusinessComponent[];
  dependencies: Dependency[];
  simOutageId: string | null;
  impactedIds: Set<string>;
  backupIds: Set<string>;
  mitigationStrategy: "wait" | "failover" | "queue_retry";
  hourlyRate: number;
  nodeMetrics?: Record<string, NodeLiveMetrics>;
  onSelectNode: (componentId: string) => void;
}

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface Pt2 {
  sx: number;
  sy: number;
  depth: number;
}

const DOMAIN_THEME: Record<
  string,
  { label: string; stroke: string; fill: string; roof: string; dot: string }
> = {
  website: {
    label: "Checkout / Web",
    stroke: "#3b82f6",
    fill: "rgba(37, 99, 235, 0.16)",
    roof: "rgba(59, 130, 246, 0.24)",
    dot: "#60a5fa",
  },
  payment_gateway: {
    label: "Payment Gateway",
    stroke: "#06b6d4",
    fill: "rgba(6, 182, 212, 0.16)",
    roof: "rgba(34, 211, 238, 0.24)",
    dot: "#22d3ee",
  },
  process: {
    label: "Core Engine",
    stroke: "#8b5cf6",
    fill: "rgba(139, 92, 246, 0.16)",
    roof: "rgba(167, 139, 250, 0.24)",
    dot: "#a78bfa",
  },
  warehouse: {
    label: "Fulfillment / Store",
    stroke: "#a855f7",
    fill: "rgba(168, 85, 247, 0.15)",
    roof: "rgba(192, 132, 252, 0.22)",
    dot: "#c084fc",
  },
  supplier: {
    label: "Supply",
    stroke: "#10b981",
    fill: "rgba(16, 185, 129, 0.14)",
    roof: "rgba(52, 211, 153, 0.22)",
    dot: "#34d399",
  },
  delivery_partner: {
    label: "Dispatch",
    stroke: "#f59e0b",
    fill: "rgba(245, 158, 11, 0.15)",
    roof: "rgba(251, 191, 36, 0.22)",
    dot: "#fbbf24",
  },
  other: {
    label: "Operations",
    stroke: "#64748b",
    fill: "rgba(100, 116, 139, 0.14)",
    roof: "rgba(148, 163, 184, 0.20)",
    dot: "#94a3b8",
  },
  team: {
    label: "Ops Team",
    stroke: "#ec4899",
    fill: "rgba(236, 72, 153, 0.14)",
    roof: "rgba(244, 114, 182, 0.20)",
    dot: "#f472b6",
  },
};

const SVG_W = 860;
const SVG_H = 560;
const CENTER_X = SVG_W / 2;
const CENTER_Y = SVG_H / 2 + 24;

function projectPoint(
  v: Vec3,
  yawDeg: number,
  pitchDeg: number,
  zoom: number
): Pt2 {
  const yaw = (yawDeg * Math.PI) / 180;
  const pitch = (pitchDeg * Math.PI) / 180;
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const sinP = Math.sin(pitch);
  const cosP = Math.cos(pitch);

  const rx = v.x * cosY - v.y * sinY;
  const ry = v.x * sinY + v.y * cosY;

  const sx = CENTER_X + rx * zoom;
  const sy = CENTER_Y + (ry * sinP - v.z * cosP) * zoom;
  const depth = ry * cosP + v.z * sinP;
  return { sx, sy, depth };
}

function ptsString(pts: Pt2[]): string {
  return pts.map((p) => `${p.sx.toFixed(1)},${p.sy.toFixed(1)}`).join(" ");
}

function layoutComponents3D(components: BusinessComponent[]) {
  const byLane: Record<string, BusinessComponent[]> = {
    front: [],
    mid: [],
    rear: [],
    back: [],
    side: [],
  };

  components.forEach((c) => {
    if (c.component_type === "website") byLane.front.push(c);
    else if (c.component_type === "payment_gateway" || c.component_type === "process") byLane.mid.push(c);
    else if (c.component_type === "warehouse" || c.component_type === "other") byLane.rear.push(c);
    else if (c.component_type === "supplier") byLane.back.push(c);
    else byLane.side.push(c);
  });

  const positions = new Map<string, { x: number; y: number; w: number; d: number; h: number }>();

  const placeRow = (items: BusinessComponent[], yCoord: number, xSpan = 420) => {
    const count = items.length;
    if (count === 0) return;
    const step = count === 1 ? 0 : xSpan / (count - 1);
    const startX = count === 1 ? 0 : -xSpan / 2;
    items.forEach((comp, idx) => {
      positions.set(comp.id, {
        x: startX + idx * step,
        y: yCoord,
        w: 118,
        d: 88,
        h: comp.criticality === "critical" ? 56 : comp.criticality === "high" ? 46 : 38,
      });
    });
  };

  placeRow(byLane.back, -210, 260);
  placeRow(byLane.rear, -90, 340);
  placeRow(byLane.mid, 45, 430);
  placeRow(byLane.front, 185, 320);

  byLane.side.forEach((comp, idx) => {
    positions.set(comp.id, {
      x: 245,
      y: -145 + idx * 140,
      w: 116,
      d: 88,
      h: 44,
    });
  });

  return positions;
}

export function IsometricWarRoom3D({
  components,
  dependencies,
  simOutageId,
  impactedIds,
  backupIds,
  mitigationStrategy,
  hourlyRate,
  nodeMetrics,
  onSelectNode,
}: IsometricWarRoom3DProps) {
  const [yaw, setYaw] = useState(-38);
  const [pitch, setPitch] = useState(35);
  const [zoom, setZoom] = useState(1.0);
  const [flowPlaying, setFlowPlaying] = useState(true);
  const [phase, setPhase] = useState(0);

  const dragRef = useRef<{ active: boolean; x: number; y: number; startYaw: number; startPitch: number }>({
    active: false,
    x: 0,
    y: 0,
    startYaw: -38,
    startPitch: 35,
  });

  useEffect(() => {
    if (!flowPlaying) return;
    let rafId = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setPhase((p) => (p + dt * 0.35) % 1);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [flowPlaying]);

  const layout = useMemo(() => layoutComponents3D(components), [components]);

  const gridLines = useMemo(() => {
    const lines: Array<{ a: Pt2; b: Pt2; major: boolean }> = [];
    for (let x = -360; x <= 360; x += 60) {
      lines.push({
        a: projectPoint({ x, y: -300, z: 0 }, yaw, pitch, zoom),
        b: projectPoint({ x, y: 300, z: 0 }, yaw, pitch, zoom),
        major: x % 180 === 0,
      });
    }
    for (let y = -300; y <= 300; y += 60) {
      lines.push({
        a: projectPoint({ x: -360, y, z: 0 }, yaw, pitch, zoom),
        b: projectPoint({ x: 360, y, z: 0 }, yaw, pitch, zoom),
        major: y % 180 === 0,
      });
    }
    return lines;
  }, [yaw, pitch, zoom]);

  // Pre-build 3D prisms sorted back-to-front by painter's depth
  const renderedBlocks = useMemo(() => {
    const blocks = components.map((comp) => {
      const geom = layout.get(comp.id) || { x: 0, y: 0, w: 110, d: 84, h: 44 };
      const { x, y, w, d, h } = geom;
      const hw = w / 2;
      const hd = d / 2;

      const b0 = projectPoint({ x: x - hw, y: y - hd, z: 0 }, yaw, pitch, zoom);
      const b1 = projectPoint({ x: x + hw, y: y - hd, z: 0 }, yaw, pitch, zoom);
      const b2 = projectPoint({ x: x + hw, y: y + hd, z: 0 }, yaw, pitch, zoom);
      const b3 = projectPoint({ x: x - hw, y: y + hd, z: 0 }, yaw, pitch, zoom);

      const t0 = projectPoint({ x: x - hw, y: y - hd, z: h }, yaw, pitch, zoom);
      const t1 = projectPoint({ x: x + hw, y: y - hd, z: h }, yaw, pitch, zoom);
      const t2 = projectPoint({ x: x + hw, y: y + hd, z: h }, yaw, pitch, zoom);
      const t3 = projectPoint({ x: x - hw, y: y + hd, z: h }, yaw, pitch, zoom);

      const centerDepth = projectPoint({ x, y, z: h * 0.5 }, yaw, pitch, zoom).depth;
      const labelPos = projectPoint({ x, y, z: h + 20 }, yaw, pitch, zoom);

      // 4 side walls with center depth to paint back-to-front inside the prism
      const faces = [
        { pts: [b0, b1, t1, t0], d: (b0.depth + b1.depth) / 2 },
        { pts: [b1, b2, t2, t1], d: (b1.depth + b2.depth) / 2 },
        { pts: [b2, b3, t3, t2], d: (b2.depth + b3.depth) / 2 },
        { pts: [b3, b0, t0, t3], d: (b3.depth + b0.depth) / 2 },
      ].sort((a, b) => a.d - b.d);

      // 2 internal 3D core units standing on the chamber floor (equipment/server cores)
      const cw = 22;
      const cd = 24;
      const ch = h * 0.52;
      const makeCore = (cxOff: number, cyOff: number) => {
        const cx = x + cxOff;
        const cy = y + cyOff;
        const cb0 = projectPoint({ x: cx - cw / 2, y: cy - cd / 2, z: 2 }, yaw, pitch, zoom);
        const cb1 = projectPoint({ x: cx + cw / 2, y: cy - cd / 2, z: 2 }, yaw, pitch, zoom);
        const cb2 = projectPoint({ x: cx + cw / 2, y: cy + cd / 2, z: 2 }, yaw, pitch, zoom);
        const cb3 = projectPoint({ x: cx - cw / 2, y: cy + cd / 2, z: 2 }, yaw, pitch, zoom);
        const ct0 = projectPoint({ x: cx - cw / 2, y: cy - cd / 2, z: ch }, yaw, pitch, zoom);
        const ct1 = projectPoint({ x: cx + cw / 2, y: cy - cd / 2, z: ch }, yaw, pitch, zoom);
        const ct2 = projectPoint({ x: cx + cw / 2, y: cy + cd / 2, z: ch }, yaw, pitch, zoom);
        const ct3 = projectPoint({ x: cx - cw / 2, y: cy + cd / 2, z: ch }, yaw, pitch, zoom);
        return {
          base: [cb0, cb1, cb2, cb3],
          top: [ct0, ct1, ct2, ct3],
          edges: [
            [cb0, ct0],
            [cb1, ct1],
            [cb2, ct2],
            [cb3, ct3],
          ],
          side1: [cb1, cb2, ct2, ct1],
          side2: [cb2, cb3, ct3, ct2],
        };
      };

      const cores = [makeCore(-20, -4), makeCore(20, 6)];

      return {
        comp,
        geom,
        centerDepth,
        labelPos,
        base: [b0, b1, b2, b3],
        top: [t0, t1, t2, t3],
        pillars: [
          [b0, t0],
          [b1, t1],
          [b2, t2],
          [b3, t3],
        ],
        faces,
        cores,
      };
    });

    return blocks.sort((a, b) => a.centerDepth - b.centerDepth);
  }, [components, layout, yaw, pitch, zoom]);

  // Projected animated dependency conduits
  const conduits = useMemo(() => {
    return dependencies
      .map((dep, idx) => {
        const sGeom = layout.get(dep.source_component);
        const tGeom = layout.get(dep.target_component);
        if (!sGeom || !tGeom) return null;

        const zMid = 16;
        const p1 = { x: sGeom.x, y: sGeom.y, z: zMid };
        const p2 = { x: tGeom.x, y: tGeom.y, z: zMid };

        const isBroken =
          simOutageId &&
          dep.relationship_type !== "backup_for" &&
          (dep.target_component === simOutageId ||
            dep.source_component === simOutageId ||
            impactedIds.has(dep.target_component));

        const isBackupPath = dep.relationship_type === "backup_for";
        const isFailoverActive =
          isBackupPath && Boolean(simOutageId) && mitigationStrategy === "failover";

        const color = isBroken
          ? "#ef4444"
          : isFailoverActive
            ? "#22c55e"
            : isBackupPath
              ? "#10b981"
              : dep.relationship_type === "supplies"
                ? "#34d399"
                : "#38bdf8";

        const s2d = projectPoint(p1, yaw, pitch, zoom);
        const t2d = projectPoint(p2, yaw, pitch, zoom);

        const packetPhase = (phase + idx * 0.21) % 1;
        const px = p1.x + (p2.x - p1.x) * packetPhase;
        const py = p1.y + (p2.y - p1.y) * packetPhase;
        const pz = p1.z + (p2.z - p1.z) * packetPhase;
        const packetPt = projectPoint({ x: px, y: py, z: pz }, yaw, pitch, zoom);

        return {
          dep,
          s2d,
          t2d,
          packetPt,
          color,
          isBroken: Boolean(isBroken),
          isFailoverActive,
          isBackupPath,
        };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));
  }, [dependencies, layout, simOutageId, impactedIds, mitigationStrategy, yaw, pitch, zoom, phase]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button")) return;
    dragRef.current = {
      active: true,
      x: e.clientX,
      y: e.clientY,
      startYaw: yaw,
      startPitch: pitch,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    setYaw(dragRef.current.startYaw + dx * 0.35);
    setPitch(Math.max(16, Math.min(72, dragRef.current.startPitch + dy * 0.25)));
  };

  const handlePointerUp = () => {
    dragRef.current.active = false;
  };

  const legendItems = [
    { label: "Checkout", color: "#3b82f6" },
    { label: "Payment", color: "#06b6d4" },
    { label: "Warehouse", color: "#a855f7" },
    { label: "Supply", color: "#10b981" },
    { label: "Dispatch", color: "#f59e0b" },
    { label: "Fault/Impacted", color: "#ef4444" },
  ];

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className="relative h-full w-full min-h-[540px] bg-[#0a0e17] overflow-hidden select-none cursor-grab active:cursor-grabbing"
    >
      {/* Top Legend Strip (matches Factory Twin top bar) */}
      <div className="pointer-events-none absolute top-3 left-3 z-20 flex flex-wrap items-center gap-3 rounded-md border border-surface-700/80 bg-surface-900/90 px-3 py-1.5 text-[11px]">
        {legendItems.map((item) => (
          <span key={item.label} className="flex items-center gap-1.5 text-surface-300">
            <span className="h-2 w-2 rounded-full" style={{ background: item.color }} />
            {item.label}
          </span>
        ))}
      </div>

      {/* Camera Orbit / Zoom Controls */}
      <div className="absolute top-3 right-3 z-20 flex items-center gap-1 rounded-md border border-surface-700/80 bg-surface-900/90 p-1">
        <span className="hidden xl:inline px-2 text-[10px] font-mono text-surface-400">
          DRAG TO ORBIT · CLICK BLOCK FOR FAULT
        </span>
        <button
          type="button"
          title={flowPlaying ? "Pause flow animation" : "Resume flow animation"}
          onClick={() => setFlowPlaying((v) => !v)}
          className="rounded p-1.5 text-surface-300 hover:bg-surface-800 hover:text-white transition-colors"
        >
          {flowPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          title="Zoom in"
          onClick={() => setZoom((z) => Math.min(1.45, Number((z + 0.1).toFixed(2))))}
          className="rounded p-1.5 text-surface-300 hover:bg-surface-800 hover:text-white transition-colors"
        >
          <ZoomIn className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="Zoom out"
          onClick={() => setZoom((z) => Math.max(0.65, Number((z - 0.1).toFixed(2))))}
          className="rounded p-1.5 text-surface-300 hover:bg-surface-800 hover:text-white transition-colors"
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="Reset isometric camera"
          onClick={() => {
            setYaw(-38);
            setPitch(35);
            setZoom(1.0);
          }}
          className="rounded p-1.5 text-surface-300 hover:bg-surface-800 hover:text-white transition-colors"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Bottom Camera Readout */}
      <div className="pointer-events-none absolute bottom-3 left-3 z-20 flex items-center gap-3 rounded border border-surface-800 bg-surface-950/90 px-2.5 py-1 text-[10px] font-mono text-surface-400">
        <span>YAW {Math.round(yaw)}°</span>
        <span>PITCH {Math.round(pitch)}°</span>
        <span>ZOOM {Math.round(zoom * 100)}%</span>
        <span>NODES {components.length}</span>
        <span>PIPES {dependencies.length}</span>
      </div>

      {/* SVG 3D Isometric Projection Engine */}
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        className="h-full w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <filter id="softGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Isometric Floor Plane Grid */}
        <g>
          {gridLines.map((gl, idx) => (
            <line
              key={idx}
              x1={gl.a.sx}
              y1={gl.a.sy}
              x2={gl.b.sx}
              y2={gl.b.sy}
              stroke={gl.major ? "rgba(51, 65, 85, 0.48)" : "rgba(30, 41, 59, 0.45)"}
              strokeWidth={gl.major ? 1 : 0.65}
            />
          ))}
        </g>

        {/* Directional 3D Flow Pipelines + Animated Energy Packets */}
        <g>
          {conduits.map((c) => (
            <g key={c.dep.id}>
              <line
                x1={c.s2d.sx}
                y1={c.s2d.sy}
                x2={c.t2d.sx}
                y2={c.t2d.sy}
                stroke={c.color}
                strokeWidth={c.isFailoverActive || c.isBroken ? 2.2 : 1.5}
                strokeOpacity={c.isBroken ? 0.85 : c.isBackupPath && !c.isFailoverActive ? 0.35 : 0.7}
                strokeDasharray={c.isBroken ? "5 4" : c.isBackupPath && !c.isFailoverActive ? "4 4" : undefined}
              />
              {/* Animated moving packet unless link is completely stalled */}
              {!c.isBroken && (!c.isBackupPath || c.isFailoverActive) && (
                <circle
                  cx={c.packetPt.sx}
                  cy={c.packetPt.sy}
                  r={c.isFailoverActive ? 4 : 3.2}
                  fill={c.isFailoverActive ? "#4ade80" : "#e2e8f0"}
                  filter="url(#softGlow)"
                />
              )}
            </g>
          ))}
        </g>

        {/* Depth-Sorted 3D Extruded Spatial Chambers */}
        <g>
          {renderedBlocks.map((blk) => {
            const { comp, base, top, pillars, faces, cores, labelPos } = blk;
            const theme = DOMAIN_THEME[comp.component_type] || DOMAIN_THEME.other;

            const isFailed = simOutageId === comp.id;
            const isImpacted = impactedIds.has(comp.id);
            const isBackup = backupIds.has(comp.id);
            const isFailoverActive = isBackup && Boolean(simOutageId) && mitigationStrategy === "failover";

            const strokeColor = isFailed
              ? "#ef4444"
              : isImpacted
                ? "#f59e0b"
                : isFailoverActive
                  ? "#22c55e"
                  : theme.stroke;

            const fillColor = isFailed
              ? "rgba(239, 68, 68, 0.24)"
              : isImpacted
                ? "rgba(245, 158, 11, 0.18)"
                : isFailoverActive
                  ? "rgba(34, 197, 94, 0.2)"
                  : theme.fill;

            const roofColor = isFailed
              ? "rgba(239, 68, 68, 0.3)"
              : isFailoverActive
                ? "rgba(34, 197, 94, 0.26)"
                : theme.roof;

            const coreGlow = isFailed
              ? "#ef4444"
              : isImpacted
                ? "#f59e0b"
                : isFailoverActive
                  ? "#22c55e"
                  : "#34d399";

            const live = nodeMetrics?.[comp.id];
            const util = live
              ? live.utilizationPct
              : isFailed
                ? 0
                : isFailoverActive
                  ? 96
                  : isImpacted
                    ? 48
                    : 82;
            const rate = live
              ? live.throughputPerHour
              : isFailed
                ? 0
                : Math.round(hourlyRate * (isImpacted ? 0.45 : 1));
            const statusText = isFailed
              ? "OUTAGE"
              : isFailoverActive
                ? "FAILOVER"
                : isImpacted
                  ? "WARNING"
                  : "ACTIVE";

            return (
              <g
                key={comp.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectNode(comp.id);
                }}
                className="cursor-pointer group"
              >
                {/* Base floor pad */}
                <polygon
                  points={ptsString(base)}
                  fill={fillColor}
                  stroke={strokeColor}
                  strokeOpacity={0.55}
                  strokeWidth={1}
                />

                {/* Inner 3D Glowing Operational Core Sub-Blocks */}
                {cores.map((core, cIdx) => (
                  <g key={cIdx}>
                    <polygon points={ptsString(core.side1)} fill={coreGlow} fillOpacity={0.28} />
                    <polygon points={ptsString(core.side2)} fill={coreGlow} fillOpacity={0.22} />
                    <polygon
                      points={ptsString(core.top)}
                      fill={coreGlow}
                      fillOpacity={isFailed ? 0.35 : 0.72}
                      stroke={coreGlow}
                      strokeWidth={0.8}
                    />
                    {core.edges.map(([eb, et], eIdx) => (
                      <line
                        key={eIdx}
                        x1={eb.sx}
                        y1={eb.sy}
                        x2={et.sx}
                        y2={et.sy}
                        stroke={coreGlow}
                        strokeOpacity={0.65}
                        strokeWidth={0.8}
                      />
                    ))}
                  </g>
                ))}

                {/* Chamber Translucent Side Walls */}
                {faces.map((face, fIdx) => (
                  <polygon
                    key={fIdx}
                    points={ptsString(face.pts)}
                    fill={fillColor}
                    fillOpacity={0.65}
                  />
                ))}

                {/* Chamber Vertical Wireframe Pillars */}
                {pillars.map(([pb, pt], pIdx) => (
                  <line
                    key={pIdx}
                    x1={pb.sx}
                    y1={pb.sy}
                    x2={pt.sx}
                    y2={pt.sy}
                    stroke={strokeColor}
                    strokeOpacity={0.85}
                    strokeWidth={1.3}
                  />
                ))}

                {/* Chamber Top Roof Polygon */}
                <polygon
                  points={ptsString(top)}
                  fill={roofColor}
                  fillOpacity={0.45}
                  stroke={strokeColor}
                  strokeWidth={isFailed || isFailoverActive ? 1.8 : 1.3}
                />

                {/* Floating Dark Telemetry Callout Pill */}
                <g transform={`translate(${labelPos.sx.toFixed(1)}, ${labelPos.sy.toFixed(1)})`}>
                  <line x1={0} y1={-4} x2={0} y2={6} stroke={strokeColor} strokeOpacity={0.6} strokeWidth={1} />
                  <rect
                    x={-68}
                    y={-36}
                    width={136}
                    height={33}
                    rx={4}
                    fill="#0d131f"
                    fillOpacity={0.94}
                    stroke={strokeColor}
                    strokeOpacity={0.75}
                    strokeWidth={1}
                  />
                  <text
                    x={-61}
                    y={-22}
                    fill="#f8fafc"
                    fontSize={9}
                    fontWeight={600}
                    fontFamily="Inter, sans-serif"
                  >
                    {comp.name.length > 19 ? `${comp.name.slice(0, 18)}…` : comp.name}
                  </text>
                  <text
                    x={-61}
                    y={-10}
                    fill="#94a3b8"
                    fontSize={8}
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {util}% util · {rate}/hr
                  </text>
                  <text
                    x={61}
                    y={-10}
                    textAnchor="end"
                    fill={strokeColor}
                    fontSize={8}
                    fontWeight={700}
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {statusText}
                  </text>
                </g>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

