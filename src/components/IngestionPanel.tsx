"use client";

import { Building2, FileText, Newspaper, Database, LineChart, ScrollText, Users } from "lucide-react";
import type { DemographicProfile, PolicyModel, SourceRef } from "@/lib/types";
import { groupColor } from "@/lib/ui";
import { cn, fmtCompact, fmtPct, fmtUSD } from "@/lib/utils";

interface Props {
  policyModel?: PolicyModel;
  profile?: DemographicProfile;
  sources: SourceRef[];
  breakdown: Record<string, number>;
}

const SOURCE_ICON: Record<SourceRef["kind"], React.ReactNode> = {
  census: <Users className="w-3.5 h-3.5" />,
  acs: <Database className="w-3.5 h-3.5" />,
  bls: <LineChart className="w-3.5 h-3.5" />,
  housing: <Building2 className="w-3.5 h-3.5" />,
  market: <LineChart className="w-3.5 h-3.5" />,
  news: <Newspaper className="w-3.5 h-3.5" />,
  minutes: <ScrollText className="w-3.5 h-3.5" />,
  study: <FileText className="w-3.5 h-3.5" />,
};

export function IngestionPanel({ policyModel, profile, sources, breakdown }: Props) {
  return (
    <div className="glass rounded-2xl p-5 flex flex-col gap-4">
      {policyModel && (
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="font-data text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-signal/15 text-signal-bright border border-signal/30">
              {policyModel.type.replace("_", " ")}
            </span>
            <span className="text-[10px] text-slate-500">
              modeled by {policyModel.modelSource === "llm" ? "Mastra agent" : "heuristic"}
            </span>
          </div>
          <h3 className="text-sm font-semibold text-slate-100 leading-snug">{policyModel.title}</h3>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">{policyModel.summary}</p>
          <div className="mt-2">
            <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
              <span>Policy intensity</span>
              <span className="font-data tabular-nums">{fmtPct(policyModel.intensity)}</span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
              <div className="h-full bg-signal" style={{ width: fmtPct(policyModel.intensity) }} />
            </div>
          </div>
        </div>
      )}

      {profile && (
        <div className="border-t border-line pt-3">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold text-slate-200">{profile.jurisdiction}</h4>
            <span className={cn("text-[10px] px-1.5 py-0.5 rounded", profile.grounded ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300")}>
              {profile.grounded ? "grounded data" : "national avg"}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <Stat label="Population" value={fmtCompact(profile.population)} />
            <Stat label="Median income" value={fmtUSD(profile.medianIncome)} />
            <Stat label="Median rent" value={`${fmtUSD(profile.medianRent)}/mo`} />
            <Stat label="Renters" value={fmtPct(profile.renterShare)} />
          </div>
          <div className="mt-3 space-y-1.5">
            {Object.entries(profile.groups).map(([g, gs]) => {
              const count = breakdown[g];
              return (
                <div key={g} className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: groupColor(g) }} />
                  <span className="text-[11px] text-slate-300 w-16">{g}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: fmtPct(gs.share), background: groupColor(g) }} />
                  </div>
                  <span className="text-[10px] text-slate-500 w-16 text-right">
                    {count != null ? `${count} · ` : ""}{fmtUSD(gs.medianIncome)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="border-t border-line pt-3">
        <div className="flex items-center gap-2 mb-2">
          <Database className="w-3.5 h-3.5 text-signal" />
          <h4 className="eyebrow">Ingested sources</h4>
          <span className="font-data text-[10px] text-slate-500">{sources.length}</span>
        </div>
        <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
          {sources.length === 0 && <p className="text-[11px] text-slate-600">Browserbase is gathering the community profile…</p>}
          {sources.map((s, i) => (
            <div key={i} className="flex items-start gap-2 animate-[pp-pop_0.25s_ease]">
              <span className="mt-0.5 text-signal">{SOURCE_ICON[s.kind]}</span>
              <div className="leading-tight">
                <div className="text-[11px] text-slate-300">{s.label}</div>
                <div className="text-[10px] text-slate-500">{s.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-ink/40 border border-line px-2.5 py-1.5">
      <div className="text-[10px] text-slate-500">{label}</div>
      <div className="font-data text-sm font-medium text-slate-100 tabular-nums">{value}</div>
    </div>
  );
}
