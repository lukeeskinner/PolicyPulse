"use client";

import { memo, useMemo } from "react";
import type { WorldNode } from "@/lib/ghost/types";
import { isFailing, nodeColor } from "@/lib/ghost/ui";

interface Props {
  nodes: WorldNode[];
}

interface Edge {
  a: WorldNode;
  b: WorldNode;
  key: string;
}

function radiusFor(n: WorldNode): number {
  if (n.critical) return 4.3;
  if (n.kind === "substation" || n.kind === "control" || n.kind === "backup") return 3.7;
  return 3.1;
}

function shortLabel(label: string): string {
  return label.length > 18 ? `${label.slice(0, 17)}…` : label;
}

export const WorldGraph = memo(function WorldGraph({ nodes }: Props) {
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n] as const)), [nodes]);

  const edges = useMemo(() => {
    const seen = new Set<string>();
    const out: Edge[] = [];
    for (const n of nodes) {
      for (const t of n.links) {
        const other = byId.get(t);
        if (!other) continue;
        const key = [n.id, t].sort().join("~");
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ a: n, b: other, key });
      }
    }
    return out;
  }, [nodes, byId]);

  if (!nodes.length) return null;

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" className="w-full h-full">
      {/* edges */}
      {edges.map(({ a, b, key }) => {
        const failing = isFailing(a.status) || isFailing(b.status);
        const live = !failing;
        return (
          <g key={key}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={failing ? "rgba(239,68,68,0.35)" : "rgba(148,163,184,0.22)"} strokeWidth={0.5} />
            {live && (
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="rgba(110,139,255,0.55)" strokeWidth={0.5} className="gp-flow" />
            )}
          </g>
        );
      })}

      {/* nodes */}
      {nodes.map((n) => {
        const color = nodeColor(n.status);
        const r = radiusFor(n);
        return (
          <g key={n.id}>
            <title>
              {`${n.label} · ${n.status}\n${n.kind}${n.critical ? " · CRITICAL" : ""}${n.populationServed ? `\n${n.populationServed.toLocaleString()} served` : ""}${n.note ? `\n${n.note}` : ""}`}
            </title>
            {n.status === "compromised" && (
              <circle cx={n.x} cy={n.y} r={r} fill={color} opacity={0.5} className="gp-ping" />
            )}
            {n.critical && (
              <circle cx={n.x} cy={n.y} r={r + 1.7} fill="none" stroke={color} strokeWidth={0.5} strokeDasharray="1.2 1.2" opacity={0.8} />
            )}
            <circle
              cx={n.x}
              cy={n.y}
              r={r}
              fill={color}
              stroke="rgba(11,13,18,0.9)"
              strokeWidth={0.6}
              style={{ transition: "fill 0.6s ease" }}
            />
            {/* keyed by status: remounts and flashes once whenever this node changes state */}
            <circle key={`fl-${n.status}`} cx={n.x} cy={n.y} r={r} fill="none" stroke={color} strokeWidth={0.9} className="gp-flash" />
            {n.status === "restored" && (
              <circle cx={n.x} cy={n.y} r={r} fill="none" stroke={color} strokeWidth={0.5} opacity={0.6} className="pp-pulse" />
            )}
            <text x={n.x} y={n.y + r + 3.1} textAnchor="middle" fontSize={2.5} fill="#aeb6c6" className="font-data">
              {shortLabel(n.label)}
            </text>
            {n.critical && (
              <text x={n.x} y={n.y + 0.9} textAnchor="middle" fontSize={3.4} fill="#0b0d12" fontWeight={700}>
                +
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
});
