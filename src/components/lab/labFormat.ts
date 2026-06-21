import type { SweepUnit } from "@/lib/types";

/** Format a swept parameter value for its unit (3% / $20 / 0.55). */
export function fmtParam(value: number, unit: SweepUnit): string {
  if (unit === "pct") return `${+(value * 100).toFixed(1)}%`;
  if (unit === "usd") return `$${value.toFixed(0)}`;
  return value.toFixed(2);
}

export function pct1(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

export function pct0(v: number): string {
  return `${Math.round(v * 100)}%`;
}

/** Recharts tooltip background, matched to the app's panel surface. */
export const TOOLTIP_STYLE = {
  background: "#14171f",
  border: "1px solid #272c38",
  borderRadius: 12,
  fontSize: 12,
} as const;
