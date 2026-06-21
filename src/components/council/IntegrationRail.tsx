"use client";

import type { CouncilIntegrationStatus } from "@/lib/council/types";

interface Chip {
  label: string;
  status: string;
  tone: "live" | "native" | "off";
  hint: string;
}

function buildChips(s?: CouncilIntegrationStatus): Chip[] {
  return [
    { label: "Anthropic", status: s?.anthropic ? "live" : "add key", tone: s?.anthropic ? "live" : "off", hint: "Claude is every stakeholder's reasoning engine." },
    { label: "Census ACS", status: s?.census ? "live" : "dataset", tone: s?.census ? "live" : "native", hint: "Grounds the simulated population in real ACS demographics." },
    { label: "Fetch.ai", status: s?.fetchai === "live" ? "live" : "native", tone: s?.fetchai === "live" ? "live" : "native", hint: "Structured inter-agent debate: positions, amendments, vetoes, consensus." },
    { label: "Orkes", status: s?.orkes === "live" ? "live" : "native", tone: s?.orkes === "live" ? "live" : "native", hint: "Orchestrates the deliberation: ground, debate, re-test, ratify." },
    { label: "Deepgram", status: s?.deepgram ? "Aura" : "browser TTS", tone: s?.deepgram ? "live" : "native", hint: "Real-time voice narration of the hearing." },
    { label: "Arize", status: s?.arize === "live" ? "live" : "native", tone: s?.arize === "live" ? "live" : "native", hint: "Trace + eval for every stakeholder decision (the read-out)." },
    { label: "Redis", status: s?.redis ? "live" : "in-memory", tone: s?.redis ? "live" : "native", hint: "Run state + event streaming for the chamber." },
  ];
}

const DOT: Record<Chip["tone"], string> = {
  live: "bg-emerald-400",
  native: "bg-signal",
  off: "bg-amber-400",
};

export function IntegrationRail({ integrations, compact }: { integrations?: CouncilIntegrationStatus; compact?: boolean }) {
  const chips = buildChips(integrations);
  return (
    <div className={compact ? "glass rounded-2xl p-3" : "glass rounded-2xl p-4"}>
      <div className="flex items-center gap-2 mb-2.5">
        <h3 className="eyebrow">Sponsor stack</h3>
        <span className="ml-auto text-[10px] text-slate-600 font-data">live · native</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <div key={c.label} title={`${c.label}: ${c.hint}`} className="flex items-center gap-1.5 border border-line rounded-full px-2.5 py-1">
            <span className={`w-1.5 h-1.5 rounded-full ${DOT[c.tone]} ${c.tone === "live" ? "pp-pulse" : ""}`} />
            <span className="text-[11px] text-slate-300 font-medium">{c.label}</span>
            <span className="font-data text-[9px] text-slate-500">{c.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
