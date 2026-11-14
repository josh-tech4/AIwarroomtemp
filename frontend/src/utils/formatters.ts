import type { SourceType } from "../types/api";

export function formatValue(value: string | number | null | undefined, unit?: string): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  const num = Number(value);
  if (Number.isNaN(num)) {
    return String(value);
  }
  const formatted = new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2,
  }).format(num);
  return unit ? `${formatted} ${unit}` : formatted;
}

export function formatCurrency(value: string | number | null | undefined, currency = "INR"): string {
  return formatValue(value, currency);
}

export function sourceTypeBadge(sourceType: SourceType): {
  label: string;
  className: string;
} {
  switch (sourceType) {
    case "user_input":
      return {
        label: "User Input",
        className: "bg-brand-500/15 text-brand-400 border-brand-500/30",
      };
    case "imported":
      return {
        label: "Imported",
        className: "bg-success-500/15 text-success-400 border-success-500/30",
      };
    case "derived":
      return {
        label: "Derived Metric",
        className: "bg-purple-500/15 text-purple-400 border-purple-500/30",
      };
    case "illustrative":
    default:
      return {
        label: "Illustrative",
        className: "bg-warning-500/15 text-warning-400 border-warning-500/30",
      };
  }
}
