"use client";

import { useState } from "react";
import { Activity, Brain, ChevronDown, Cpu, ShieldAlert, Sparkles, Timer } from "lucide-react";
import type { GhostAgent, PostMortem as PostMortemData, TraceSpan } from "@/lib/ghost/types";
import { cn } from "@/lib/utils";

interface Props {
  postMortem: PostMortemData;
  agents: GhostAgent[];
}

export function PostMortem({ postMortem, agents }: Props) {
  const [activeAgent, setActiveAgent] = useState<string>(postMortem.criticalDecision.agentId || agents[0]?.id);
  const byId = new Map(agents.map((a) => [a.id, a] as const));
  const nameOf = (id: string) => byId.get(id)?.name ?? id;

  const allSpans = Object.values(postMortem.agentTraces).flat();
  const llmCount = allSpans.filter((s) => s.source === "llm").length;
  const spans = postMortem.agentTraces[activeAgent] ?? [];

  return (
    <div className="glass rounded-2xl p-5 grid-bg">
      <div className="flex items-center gap-2 mb-1">
        <Activity className="w-4 h-4 text-signal" />
        <h2 className="eyebrow">Post-mortem · Arize Phoenix trace</h2>
        <span className="ml-auto text-[10px] text-slate-500 font-data">{allSpans.length} spans · {llmCount} LLM-reasoned</span>
      </div>
      <h3 className="font-display text-xl text-slate-100 leading-tight mt-2 max-w-3xl">{postMortem.headline}</h3>
      <p className="text-sm text-slate-400 mt-1.5 max-w-3xl leading-relaxed">{postMortem.summary}</p>

      {/* stat row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
        <Stat icon={<ShieldAlert className="w-3.5 h-3.5" />} label="Conflicts resolved" value={String(postMortem.conflictsResolved)} />
        <Stat icon={<Timer className="w-3.5 h-3.5" />} label="Consensus latency" value={`${(postMortem.consensusLatencyMs / 1000).toFixed(1)}s`} />
        <Stat icon={<Cpu className="w-3.5 h-3.5" />} label="Pop. with service" value={postMortem.metrics.populationOnline.toLocaleString()} />
        <Stat icon={<Brain className="w-3.5 h-3.5" />} label="Threat contained" value={`${postMortem.metrics.threatContainment}%`} />
      </div>

      {/* critical decision */}
      <div className="mt-4 rounded-xl border border-signal/30 bg-signal/5 p-4">
        <div className="flex items-center gap-1.5 mb-1.5">
          <Sparkles className="w-3.5 h-3.5 text-signal-bright" />
          <span className="eyebrow text-signal-bright">The critical decision · tick {postMortem.criticalDecision.tick}</span>
        </div>
        <p className="text-sm text-slate-200">
          <span className="font-semibold" style={{ color: byId.get(postMortem.criticalDecision.agentId)?.color }}>
            {nameOf(postMortem.criticalDecision.agentId)}
          </span>{" "}
          — {postMortem.criticalDecision.why}
        </p>
        <p className="text-[12px] text-slate-400 mt-2 leading-relaxed">
          <span className="text-rose-300 font-medium">Counterfactual:</span> {postMortem.criticalDecision.counterfactual}
        </p>
      </div>

      {/* agent trace explorer */}
      <div className="mt-5">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          {agents.map((a) => {
            const n = (postMortem.agentTraces[a.id] ?? []).length;
            const on = a.id === activeAgent;
            return (
              <button
                key={a.id}
                onClick={() => setActiveAgent(a.id)}
                className={cn("flex items-center gap-1.5 text-[12px] px-2.5 py-1 rounded-full border transition-colors", on ? "border-signal/60 text-slate-100" : "border-line text-slate-400 hover:text-slate-200")}
                style={on ? { background: `${a.color}1f` } : undefined}
              >
                <span className="w-2 h-2 rounded-full" style={{ background: a.color }} />
                {a.name}
                <span className="font-data text-[9px] text-slate-500">{n}</span>
              </button>
            );
          })}
        </div>
        <div className="space-y-2">
          {spans.map((s) => (
            <SpanRow key={s.id} span={s} />
          ))}
          {spans.length === 0 && <p className="text-sm text-slate-600">No reasoning spans recorded for this agent.</p>}
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-ink/40 border border-line px-3 py-2">
      <div className="flex items-center gap-1.5 text-slate-500">
        {icon}
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <div className="font-data text-base text-slate-100 mt-0.5">{value}</div>
    </div>
  );
}

function SpanRow({ span }: { span: TraceSpan }) {
  const [open, setOpen] = useState(span.conflict);
  const llm = span.source === "llm";
  return (
    <div className={cn("rounded-xl border bg-ink/40 overflow-hidden", span.conflict ? "border-rose-500/30" : "border-line")}>
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-2 p-3 text-left">
        <span className="font-data text-[10px] text-slate-500 shrink-0">T{span.tick}</span>
        <span className="text-[13px] text-slate-200 flex-1 truncate">{span.chosen}</span>
        {span.conflict && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-rose-500/15 text-rose-300 shrink-0">conflict</span>}
        <span
          className={cn("text-[9px] px-1.5 py-0.5 rounded-full font-data shrink-0", llm ? "bg-signal/15 text-signal-bright" : "bg-slate-800 text-slate-400")}
        >
          {llm ? span.model : "policy"}
        </span>
        <span className="font-data text-[9px] text-slate-600 shrink-0">{span.latencyMs}ms</span>
        <ChevronDown className={cn("w-4 h-4 text-slate-500 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2.5 border-t border-line pt-2.5">
          <Field label="Context observed" value={span.context} />
          <Field label="Rationale" value={span.rationale} accent={llm} />
          {span.considered.length > 0 && (
            <div>
              <div className="eyebrow mb-1">Considered</div>
              <div className="flex flex-wrap gap-1.5">
                {span.considered.map((c, i) => (
                  <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800/80 text-slate-300">{c}</span>
                ))}
              </div>
            </div>
          )}
          {span.rejected.length > 0 && (
            <div>
              <div className="eyebrow mb-1">Rejected</div>
              <ul className="space-y-1">
                {span.rejected.map((r, i) => (
                  <li key={i} className="text-[11px] text-slate-400 leading-snug">
                    <span className="text-rose-300/90 line-through">{r.option}</span> — {r.why}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="font-data text-[9px] text-slate-600">world {span.worldHash}</div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="eyebrow mb-1 flex items-center gap-1">
        {label}
        {accent && <Sparkles className="w-2.5 h-2.5 text-signal-bright" />}
      </div>
      <p className={cn("text-[12px] leading-relaxed", accent ? "text-slate-200 italic" : "text-slate-400")}>{value}</p>
    </div>
  );
}
