"use client";

import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SlidersHorizontal, Tornado } from "lucide-react";
import type { SensitivityResult } from "@/lib/types";
import { TOOLTIP_STYLE, fmtParam } from "./labFormat";

interface Props {
  result: SensitivityResult;
}

export function SensitivityView({ result }: Props) {
  const { primary, tornado } = result;

  const sweepRows = primary.points.map((p) => ({
    value: p.value,
    displacement: +(p.displacementRate * 100).toFixed(2),
    lose: +(p.loseShare * 100).toFixed(2),
  }));

  const tornadoRows = tornado.map((t) => ({
    label: t.label,
    swing: +(t.swing * 100).toFixed(2),
    range: `${fmtParam(t.low, t.unit)} → ${fmtParam(t.high, t.unit)}`,
    out: `${(t.outLow * 100).toFixed(1)}% → ${(t.outHigh * 100).toFixed(1)}%`,
  }));
  const maxSwing = Math.max(0.01, ...tornadoRows.map((t) => t.swing));

  return (
    <div className="space-y-4">
      <div className="glass rounded-2xl p-5 border-l-2 border-l-signal/60">
        <div className="flex items-center gap-2 mb-1.5">
          <SlidersHorizontal className="w-4 h-4 text-signal" />
          <h2 className="eyebrow">Sensitivity · {result.drawsPerPoint} draws per point</h2>
        </div>
        <p className="text-sm text-slate-300 leading-relaxed max-w-3xl">
          The model rests on assumptions. This sweeps <span className="text-slate-100 font-medium">{primary.label.toLowerCase()}</span> and
          ranks every tunable assumption by how much it swings the displacement outcome — so you can see which inputs the conclusion actually hinges on.
        </p>
      </div>

      {/* primary sweep */}
      <div className="glass rounded-2xl p-5">
        <h3 className="eyebrow mb-3">Displacement &amp; harm vs {primary.label.toLowerCase()}</h3>
        <div className="h-60">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sweepRows} margin={{ top: 6, right: 12, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
              <XAxis
                dataKey="value"
                type="number"
                domain={["dataMin", "dataMax"]}
                tick={{ fill: "#64748b", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => fmtParam(v, primary.unit)}
              />
              <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} width={42} unit="%" />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelStyle={{ color: "#e2e8f0" }}
                labelFormatter={(v) => `${primary.label}: ${fmtParam(Number(v), primary.unit)}`}
                formatter={(val, name) => [`${val}%`, name === "displacement" ? "Displaced" : "Worse off"]}
              />
              <ReferenceLine
                x={primary.baseline}
                stroke="#9fb0ff"
                strokeDasharray="4 3"
                label={{ value: "current", fill: "#9fb0ff", fontSize: 10, position: "top" }}
              />
              <Line dataKey="displacement" name="displacement" stroke="#f59e0b" strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
              <Line dataKey="lose" name="lose" stroke="#fb7185" strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center gap-4 mt-2 text-[11px] text-slate-400">
          <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded bg-amber-400" />Displaced</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded bg-rose-400" />Worse off</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded border-t border-dashed border-signal-bright" />Current value</span>
        </div>
      </div>

      {/* tornado */}
      <div className="glass rounded-2xl p-5">
        <h3 className="eyebrow mb-3 flex items-center gap-1.5">
          <Tornado className="w-3.5 h-3.5 text-signal" /> What drives displacement most
        </h3>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={tornadoRows} layout="vertical" margin={{ top: 4, right: 20, left: 40, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" horizontal={false} />
              <XAxis type="number" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} unit=" pts" />
              <YAxis type="category" dataKey="label" tick={{ fill: "#cbd5e1", fontSize: 11 }} axisLine={false} tickLine={false} width={132} />
              <Tooltip cursor={{ fill: "rgba(148,163,184,0.06)" }} content={<TornadoTooltip />} />
              <Bar dataKey="swing" radius={[0, 3, 3, 0]} isAnimationActive={false}>
                {tornadoRows.map((t, i) => (
                  <Cell key={i} fill={`rgba(110,139,255,${0.4 + 0.6 * (t.swing / maxSwing)})`} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-[11px] text-slate-500 mt-2">
          Bar length = percentage-point change in displacement when each assumption moves from its low to its high. Longer = the conclusion depends on it more.
        </p>
      </div>
    </div>
  );
}

interface TornadoRow {
  label: string;
  swing: number;
  range: string;
  out: string;
}

function TornadoTooltip({ active, payload }: { active?: boolean; payload?: { payload: TornadoRow }[] }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <div style={TOOLTIP_STYLE} className="px-3 py-2 text-slate-200">
      <div className="text-slate-100 font-medium mb-0.5">{r.label}</div>
      <div className="font-data tabular-nums">{r.swing} pts swing in displacement</div>
      <div className="font-data tabular-nums text-slate-400">{r.range} · {r.out}</div>
    </div>
  );
}
