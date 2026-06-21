"use client";

import { memo, useMemo } from "react";
import type { GroupStats } from "@/lib/types";
import type { AgentView } from "@/lib/useSimulation";
import { groupColor, OUTCOME_COLORS, roleShort } from "@/lib/ui";
import { cn, fmtPct, fmtUSD } from "@/lib/utils";

interface Props {
  agents: AgentView[];
  total: number;
  onSelect: (id: string) => void;
  selectedId?: string;
  groups?: Record<string, GroupStats>;
}

// Stable color/wedge order so the donut reads the same across runs.
const GROUP_ORDER = ["White", "Asian", "Hispanic", "Black", "Other"];

const R_INNER = 18; // donut hole radius (box units, center = 50)
const R_OUTER = 48;

function ringForState(a: AgentView): string {
  if (a.outcome) return "";
  const f = a.lastFlags ?? [];
  if (a.state?.displaced || a.state?.leftJurisdiction) return "ring-2 ring-rose-500";
  if (f.includes("job_loss") || f.includes("hours_cut") || f.includes("business_closed")) return "ring-2 ring-amber-400";
  if (f.includes("wage_raise") || f.includes("rent_capped")) return "ring-2 ring-emerald-400";
  return "";
}

interface Placed {
  x: number;
  y: number;
  group: string;
  agent?: AgentView;
}

// Largest-remainder rounding so the per-group slot counts sum exactly to T.
function apportion(shares: number[], T: number): number[] {
  const raw = shares.map((s) => s * T);
  const floors = raw.map((r) => Math.floor(r));
  let rem = T - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac);
  const out = [...floors];
  for (let k = 0; k < order.length && rem > 0; k++, rem--) out[order[k].i] += 1;
  return out;
}

function buildDonut(agents: AgentView[], total: number, groups?: Record<string, GroupStats>) {
  const byGroup = new Map<string, AgentView[]>();
  for (const a of agents) {
    const arr = byGroup.get(a.group);
    if (arr) arr.push(a);
    else byGroup.set(a.group, [a]);
  }

  const present = [...new Set<string>([...Object.keys(groups ?? {}), ...byGroup.keys()])];
  const spawnedTotal = agents.length;
  const rawShare = (g: string) => groups?.[g]?.share ?? (spawnedTotal ? (byGroup.get(g)?.length ?? 0) / spawnedTotal : 0);
  const shareSum = present.reduce((s, g) => s + rawShare(g), 0) || 1;

  // Stable order: fixed sequence first, anything else by share descending.
  const ordered = present
    .map((g) => ({ group: g, share: rawShare(g) / shareSum, count: byGroup.get(g)?.length ?? 0 }))
    .filter((e) => e.share > 0 || e.count > 0)
    .sort((a, b) => {
      const ra = GROUP_ORDER.indexOf(a.group), rb = GROUP_ORDER.indexOf(b.group);
      const ka = ra === -1 ? 99 : ra, kb = rb === -1 ? 99 : rb;
      return ka !== kb ? ka - kb : b.share - a.share;
    });

  const T = Math.max(total, spawnedTotal, ordered.length);
  const alloc = apportion(ordered.map((e) => e.share), T);
  // Never fewer slots than spawned residents of a group.
  ordered.forEach((e, i) => (alloc[i] = Math.max(alloc[i], e.count)));
  const totalSlots = alloc.reduce((a, b) => a + b, 0);
  if (totalSlots === 0) return { placed: [] as Placed[], dotSize: 0, totalSlots: 0 };

  // Rings sized so dots tile the annulus at roughly even density.
  const K = Math.max(2, Math.min(6, Math.round(Math.sqrt((totalSlots * (R_OUTER - R_INNER)) / (Math.PI * (R_INNER + R_OUTER))))));
  const radial = (R_OUTER - R_INNER) / K;
  const radii = Array.from({ length: K }, (_, k) => R_INNER + (k + 0.5) * radial);
  const sumR = radii.reduce((a, b) => a + b, 0);
  const perRing = radii.map((r) => Math.max(1, Math.round((totalSlots * r) / sumR)));
  let diff = totalSlots - perRing.reduce((a, b) => a + b, 0);
  for (let k = K - 1; diff > 0; k = (k - 1 + K) % K, diff--) perRing[k] += 1;
  for (let k = K - 1; diff < 0; k = (k - 1 + K) % K) {
    if (perRing[k] > 1) { perRing[k] -= 1; diff++; }
  }

  // Slot positions, sorted by angle so a contiguous block forms a radial wedge.
  const slots: { x: number; y: number; angle: number }[] = [];
  radii.forEach((rho, k) => {
    const m = perRing[k];
    const offset = (k % 2) * (Math.PI / m); // brick-stagger alternate rings
    for (let i = 0; i < m; i++) {
      const angle = -Math.PI / 2 + offset + (i * 2 * Math.PI) / m;
      const norm = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      slots.push({ x: 50 + rho * Math.cos(angle), y: 50 + rho * Math.sin(angle), angle: norm });
    }
  });
  slots.sort((a, b) => a.angle - b.angle);

  // Assign each group its contiguous arc of slots; fill with its spawned agents.
  const placed: Placed[] = [];
  let cursor = 0;
  ordered.forEach((e, i) => {
    const list = byGroup.get(e.group) ?? [];
    for (let j = 0; j < alloc[i]; j++) {
      const slot = slots[cursor++];
      if (!slot) break;
      placed.push({ x: slot.x, y: slot.y, group: e.group, agent: list[j] });
    }
  });

  return { placed, dotSize: radial * 0.82, totalSlots };
}

export const AgentGrid = memo(function AgentGrid({ agents, total, onSelect, selectedId, groups }: Props) {
  const { placed, dotSize } = useMemo(() => buildDonut(agents, total, groups), [agents, total, groups]);

  if (!placed.length) {
    return <div className="flex items-center justify-center min-h-[280px] text-sm text-slate-600">Spawning the population…</div>;
  }

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[420px]">
      {placed.map((p, i) =>
        p.agent ? (
          <DonutDot key={p.agent.id} a={p.agent} size={dotSize} x={p.x} y={p.y} onSelect={onSelect} selected={p.agent.id === selectedId} />
        ) : (
          <span
            key={`ph-${i}`}
            className="absolute rounded-full border border-dashed border-slate-700/40"
            style={{ left: `${p.x}%`, top: `${p.y}%`, width: `${dotSize}%`, height: `${dotSize}%`, transform: "translate(-50%,-50%)", background: `${groupColor(p.group)}14` }}
          />
        ),
      )}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
        <span className="font-display text-2xl font-semibold tabular-nums text-slate-100 leading-none">{agents.length}</span>
        <span className="text-[10px] text-slate-500 mt-1">of {total} residents</span>
        <span className="eyebrow mt-1.5 text-[8px]">by race &amp; ethnicity</span>
      </div>
    </div>
  );
});

const DonutDot = memo(function DonutDot({
  a,
  size,
  x,
  y,
  onSelect,
  selected,
}: {
  a: AgentView;
  size: number;
  x: number;
  y: number;
  onSelect: (id: string) => void;
  selected: boolean;
}) {
  const base = groupColor(a.group);
  const border = a.outcome ? OUTCOME_COLORS[a.outcome] : "transparent";
  const title = `${a.name} · ${roleShort(a.roles)} · ${a.group}\n${a.neighborhood} · ${a.tenure} · ${fmtUSD(a.income)}/yr${
    a.state ? `\nRent burden ${fmtPct(a.state.rentBurden)} · ${a.state.status}` : ""
  }`;
  return (
    <button
      onClick={() => onSelect(a.id)}
      title={title}
      className={cn(
        "pp-pop absolute rounded-full transition-transform duration-150 hover:scale-[1.6] hover:z-20",
        ringForState(a),
        selected && "scale-[1.6] z-20 ring-2 ring-white",
      )}
      style={{
        // position by corner (no translate) so hover/select scale from center
        left: `${x - size / 2}%`,
        top: `${y - size / 2}%`,
        width: `${size}%`,
        height: `${size}%`,
        backgroundColor: base,
        boxShadow: a.outcome ? `inset 0 0 0 2px ${border}` : undefined,
        opacity: a.state?.leftJurisdiction ? 0.3 : 1,
      }}
    >
      {a.state?.leftJurisdiction && <span className="absolute inset-0 flex items-center justify-center text-[8px] text-white">✕</span>}
    </button>
  );
});
