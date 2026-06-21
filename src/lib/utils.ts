import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ---------------------------------------------------------------------------
// IDs
// ---------------------------------------------------------------------------

export function runId(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `run_${Date.now().toString(36)}_${rand}`;
}

export function shortId(prefix = "a"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

// ---------------------------------------------------------------------------
// Deterministic seeded PRNG (mulberry32) so a given run is reproducible.
// ---------------------------------------------------------------------------

export function hashString(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (h ^= h >>> 16) >>> 0;
}

export type RNG = () => number;

export function makeRng(seed: string | number): RNG {
  let a = typeof seed === "number" ? seed >>> 0 : hashString(seed);
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rngRange(rng: RNG, min: number, max: number): number {
  return min + rng() * (max - min);
}

export function rngInt(rng: RNG, min: number, max: number): number {
  return Math.floor(rngRange(rng, min, max + 1));
}

/** Box-Muller normal sample, clamped to [min, max]. */
export function rngNormal(
  rng: RNG,
  mean: number,
  std: number,
  min = -Infinity,
  max = Infinity,
): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  const n = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return Math.min(max, Math.max(min, mean + n * std));
}

/** Pick an index given an array of weights (need not be normalized). */
export function weightedIndex(rng: RNG, weights: number[]): number {
  const total = weights.reduce((s, w) => s + Math.max(0, w), 0);
  if (total <= 0) return 0;
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= Math.max(0, weights[i]);
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

export function weightedPick<T>(
  rng: RNG,
  items: T[],
  weightOf: (item: T) => number,
): T {
  return items[weightedIndex(rng, items.map(weightOf))];
}

/**
 * Largest-remainder allocation: distribute `total` integer units across the
 * given proportional shares so the parts sum exactly to `total`.
 */
export function allocateCounts(
  shares: Record<string, number>,
  total: number,
): Record<string, number> {
  const keys = Object.keys(shares);
  const sum = keys.reduce((s, k) => s + Math.max(0, shares[k]), 0) || 1;
  const exact = keys.map((k) => (Math.max(0, shares[k]) / sum) * total);
  const floors = exact.map((e) => Math.floor(e));
  let remaining = total - floors.reduce((s, f) => s + f, 0);
  const order = keys
    .map((k, i) => ({ i, frac: exact[i] - floors[i] }))
    .sort((a, b) => b.frac - a.frac);
  const out: Record<string, number> = {};
  keys.forEach((k, i) => (out[k] = floors[i]));
  let idx = 0;
  while (remaining > 0 && order.length > 0) {
    out[keys[order[idx % order.length].i]] += 1;
    idx++;
    remaining--;
  }
  return out;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function fmtUSD(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export function fmtPct(n: number, digits = 0): string {
  return `${(n * 100).toFixed(digits)}%`;
}

export function fmtCompact(n: number): string {
  return n.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 });
}

export function titleCase(s: string): string {
  return s.replace(/\w\S*/g, (t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase());
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Simple Gini coefficient for an array of non-negative values.
export function gini(values: number[]): number {
  const v = values.filter((x) => x >= 0).sort((a, b) => a - b);
  const n = v.length;
  if (n === 0) return 0;
  const sum = v.reduce((s, x) => s + x, 0);
  if (sum === 0) return 0;
  let cum = 0;
  for (let i = 0; i < n; i++) cum += (i + 1) * v[i];
  return (2 * cum) / (n * sum) - (n + 1) / n;
}
