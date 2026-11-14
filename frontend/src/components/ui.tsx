import React, { forwardRef } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  Minus,
  TrendingDown,
  TrendingUp,
  XCircle,
} from "lucide-react";

// ─── Card / Panel ────────────────────────────────────────────────────────────

export function Card({
  children,
  className = "",
  hover = false,
}: {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  glow?: boolean;
}) {
  return (
    <div
      className={`panel ${
        hover ? "cursor-pointer hover:border-surface-600 transition-colors" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

// Legacy alias kept only as flat precision panel (no bouncy Tilt3D AI slop)
export function Tilt3DCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
  intensity?: number;
}) {
  return (
    <div className={`panel hover:border-surface-600 transition-colors h-full ${className}`}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  icon,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-700/80 px-4 py-3 bg-surface-850/40">
      <div className="flex items-center gap-2.5 min-w-0">
        {icon && (
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface-800 border border-surface-700 text-brand-400">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-surface-100 truncate">
            {title}
          </h2>
          {subtitle && <p className="mt-0.5 text-xs text-surface-400 truncate">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  );
}

// ─── Precision 10-Segment Bar Gauge & Telemetry Card ──────────────────────────

export function SegmentGauge({
  percent,
  color = "cyan",
  segments = 10,
}: {
  percent: number;
  color?: "cyan" | "brand" | "success" | "warning" | "danger";
  segments?: number;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  const filled = Math.round((clamped / 100) * segments);
  const colorMap = {
    cyan: "bg-accent-400",
    brand: "bg-brand-500",
    success: "bg-success-400",
    warning: "bg-warning-400",
    danger: "bg-danger-500",
  };
  return (
    <div className="flex items-center gap-1" aria-label={`${Math.round(clamped)}%`}>
      {Array.from({ length: segments }).map((_, idx) => (
        <span
          key={idx}
          className={`h-3 flex-1 rounded-[2px] transition-colors duration-200 ${
            idx < filled ? colorMap[color] : "bg-surface-800 border border-surface-700/60"
          }`}
        />
      ))}
    </div>
  );
}

export function TelemetryCard({
  label,
  value,
  unit,
  delta,
  deltaTone = "neutral",
  gaugePct,
  gaugeColor = "cyan",
  icon,
  note,
}: {
  label: string;
  value: string | number;
  unit?: string;
  delta?: string;
  deltaTone?: "up" | "down" | "neutral";
  gaugePct?: number;
  gaugeColor?: "cyan" | "brand" | "success" | "warning" | "danger";
  icon?: React.ReactNode;
  note?: string;
}) {
  const deltaColor =
    deltaTone === "up"
      ? "text-success-400"
      : deltaTone === "down"
        ? "text-danger-400"
        : "text-surface-400";

  return (
    <div className="bg-surface-900/95 border border-surface-700/90 rounded-lg p-3.5 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-surface-300 truncate">{label}</span>
        {icon && <span className="text-surface-400 shrink-0">{icon}</span>}
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <div className="font-mono text-xl font-semibold tracking-tight text-white tabular-nums">
          {value}
          {unit && <span className="ml-1 text-[11px] font-normal text-surface-400">{unit}</span>}
        </div>
        {delta && (
          <span className={`font-mono text-[11px] font-medium tabular-nums ${deltaColor}`}>
            {delta}
          </span>
        )}
      </div>
      {gaugePct !== undefined && <SegmentGauge percent={gaugePct} color={gaugeColor} />}
      {note && <p className="text-[10px] text-surface-500 leading-tight">{note}</p>}
    </div>
  );
}

// ─── MetricCard ───────────────────────────────────────────────────────────────

export function MetricCard({
  label,
  value,
  unit,
  trend,
  trendValue,
  icon,
  accent = "brand",
}: {
  label: string;
  value: string | number;
  unit?: string;
  trend?: "up" | "down" | "flat";
  trendValue?: string;
  icon?: React.ReactNode;
  accent?: "brand" | "accent" | "success" | "warning" | "danger";
  delay?: number;
}) {
  const accentMap = {
    brand: { text: "text-brand-400", bg: "bg-brand-600/10 border-brand-500/30" },
    accent: { text: "text-accent-400", bg: "bg-accent-600/10 border-accent-500/30" },
    success: { text: "text-success-400", bg: "bg-success-500/10 border-success-500/30" },
    warning: { text: "text-warning-400", bg: "bg-warning-500/10 border-warning-500/30" },
    danger: { text: "text-danger-400", bg: "bg-danger-500/10 border-danger-500/30" },
  };
  const a = accentMap[accent];
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const trendColor =
    trend === "up" ? "text-success-400" : trend === "down" ? "text-danger-400" : "text-surface-400";

  return (
    <div className="metric-card">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wider text-surface-400 truncate">
          {label}
        </p>
        {icon && (
          <div className={`flex h-7 w-7 items-center justify-center rounded-md border ${a.bg} ${a.text}`}>
            {icon}
          </div>
        )}
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <p className="font-mono text-2xl font-semibold tracking-tight text-white tabular-nums">
          {value}
          {unit && <span className="ml-1.5 text-xs font-normal text-surface-400">{unit}</span>}
        </p>
        {trend && (
          <div className={`flex items-center gap-1 font-mono text-xs ${trendColor}`}>
            <TrendIcon className="h-3.5 w-3.5" />
            {trendValue}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Badge ────────────────────────────────────────────────────────────────────

export function Badge({
  children,
  variant = "neutral",
  dot = false,
  className = "",
}: {
  children: React.ReactNode;
  variant?: "neutral" | "info" | "success" | "warning" | "danger" | "brand";
  dot?: boolean;
  className?: string;
}) {
  const styles: Record<string, string> = {
    neutral: "bg-surface-800 text-surface-300 border-surface-700",
    brand: "bg-brand-600/15 text-brand-300 border-brand-500/35",
    info: "bg-accent-500/15 text-accent-300 border-accent-500/35",
    success: "bg-success-500/15 text-success-400 border-success-500/35",
    warning: "bg-warning-500/15 text-warning-400 border-warning-500/35",
    danger: "bg-danger-500/15 text-danger-400 border-danger-500/35",
  };
  const dotColors: Record<string, string> = {
    neutral: "bg-surface-400",
    brand: "bg-brand-400",
    info: "bg-accent-400",
    success: "bg-success-400",
    warning: "bg-warning-400",
    danger: "bg-danger-400",
  };
  return (
    <span className={`chip border ${styles[variant]} ${className}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotColors[variant]}`} />}
      {children}
    </span>
  );
}

// ─── Button ───────────────────────────────────────────────────────────────────

export const Button = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
    size?: "xs" | "sm" | "md" | "lg";
    loading?: boolean;
    icon?: React.ReactNode;
  }
>(({ children, variant = "primary", size = "md", className = "", disabled, loading, icon, ...props }, ref) => {
  const variants: Record<string, string> = {
    primary: "btn-primary",
    secondary:
      "inline-flex items-center gap-2 rounded-md bg-surface-800 px-3.5 py-2 text-xs font-semibold text-surface-100 hover:bg-surface-750 focus:outline-none focus:ring-2 focus:ring-surface-500/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors border border-surface-700",
    outline: "btn-ghost",
    ghost:
      "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium text-surface-400 hover:text-surface-100 hover:bg-surface-850 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors",
    danger: "btn-danger",
  };
  const sizes: Record<string, string> = {
    xs: "!px-2.5 !py-1 !text-[11px] !gap-1.5",
    sm: "!px-3 !py-1.5 !text-xs !gap-1.5",
    md: "",
    lg: "!px-5 !py-2.5 !text-sm",
  };
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon}
      {children}
    </button>
  );
});
Button.displayName = "Button";

// ─── Alert ────────────────────────────────────────────────────────────────────

export function Alert({
  variant = "info",
  title,
  children,
  dismissible = false,
  onDismiss,
}: {
  variant?: "info" | "warning" | "error" | "success";
  title?: string;
  children: React.ReactNode;
  dismissible?: boolean;
  onDismiss?: () => void;
}) {
  const styles = {
    info: "border-brand-500/35 bg-brand-950/30 text-brand-100",
    warning: "border-warning-500/35 bg-warning-500/10 text-warning-100",
    error: "border-danger-500/35 bg-danger-500/10 text-danger-100",
    success: "border-success-500/35 bg-success-500/10 text-success-100",
  };
  const icons = {
    info: <Info className="h-4 w-4 text-brand-400 shrink-0" />,
    warning: <AlertTriangle className="h-4 w-4 text-warning-400 shrink-0" />,
    error: <XCircle className="h-4 w-4 text-danger-400 shrink-0" />,
    success: <CheckCircle2 className="h-4 w-4 text-success-400 shrink-0" />,
  };
  return (
    <div role="alert" className={`flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm ${styles[variant]}`}>
      <div className="mt-0.5">{icons[variant]}</div>
      <div className="flex-1 min-w-0">
        {title && <p className="text-xs font-semibold mb-0.5">{title}</p>}
        <div className="text-xs opacity-90">{children}</div>
      </div>
      {dismissible && onDismiss && (
        <button onClick={onDismiss} className="text-current opacity-60 hover:opacity-100 shrink-0">
          <XCircle className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

// ─── Loading & Empty States ───────────────────────────────────────────────────

export function LoadingState({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16">
      <Loader2 className="h-6 w-6 animate-spin text-brand-400" />
      <p className="text-xs font-mono text-surface-400">{label}</p>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-surface-700 bg-surface-900/50 px-6 py-12 text-center">
      {icon && (
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-surface-850 border border-surface-700 text-surface-400">
          {icon}
        </div>
      )}
      <h3 className="text-sm font-semibold text-surface-100">{title}</h3>
      <p className="mx-auto mt-1.5 max-w-sm text-xs text-surface-400">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Spinner({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "h-4 w-4", md: "h-5 w-5", lg: "h-7 w-7" };
  return <Loader2 className={`${sizes[size]} animate-spin text-brand-400`} />;
}

export function SectionHeader({
  title,
  subtitle,
  action,
  tag,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  tag?: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-surface-800 pb-4">
      <div>
        {tag && <p className="section-heading mb-1">{tag}</p>}
        <h1 className="text-lg font-semibold text-white tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-xs text-surface-400">{subtitle}</p>}
      </div>
      {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}

// ─── Form Controls ────────────────────────────────────────────────────────────

export const Input = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: string; helpText?: string }
>(({ label, error, helpText, className = "", ...props }, ref) => (
  <div className="space-y-1">
    {label && <label className="field-label">{label}</label>}
    <input ref={ref} className={`field ${error ? "border-danger-500" : ""} ${className}`} {...props} />
    {error && <p className="text-xs text-danger-400">{error}</p>}
    {helpText && !error && <p className="text-xs text-surface-500">{helpText}</p>}
  </div>
));
Input.displayName = "Input";

export const Select = forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string; error?: string }
>(({ label, error, className = "", children, ...props }, ref) => (
  <div className="space-y-1">
    {label && <label className="field-label">{label}</label>}
    <select ref={ref} className={`field ${error ? "border-danger-500" : ""} ${className}`} {...props}>
      {children}
    </select>
    {error && <p className="text-xs text-danger-400">{error}</p>}
  </div>
));
Select.displayName = "Select";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; error?: string }
>(({ label, error, className = "", ...props }, ref) => (
  <div className="space-y-1">
    {label && <label className="field-label">{label}</label>}
    <textarea ref={ref} className={`field resize-none ${error ? "border-danger-500" : ""} ${className}`} {...props} />
    {error && <p className="text-xs text-danger-400">{error}</p>}
  </div>
));
Textarea.displayName = "Textarea";
