"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowDown, ArrowUp, ExternalLink, FlaskRound, Gavel, Ghost, Layers, Map as MapIcon, Minus, Play } from "lucide-react";
import { AppHeader, NavPill } from "@/components/AppHeader";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { ActualMetric, HistoricalCase } from "@/lib/historical";
import { cn } from "@/lib/utils";

const container = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const item = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const } } };

type Direction = "up" | "down" | "mixed";
interface Predicted { value: number; display: string; direction: Direction }
type PredictedMap = Record<string, Predicted>;

export default function ValidatePage() {
  const [cases, setCases] = useState<HistoricalCase[]>([]);
  const [results, setResults] = useState<Record<string, PredictedMap>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch("/api/validate").then((r) => r.json()).then((d) => setCases(d.cases ?? [])).catch(() => {});
  }, []);

  const run = async (id: string) => {
    setLoading((l) => ({ ...l, [id]: true }));
    try {
      const res = await fetch("/api/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId: id }),
      });
      const data = await res.json();
      if (data.predicted) setResults((r) => ({ ...r, [id]: data.predicted }));
    } finally {
      setLoading((l) => ({ ...l, [id]: false }));
    }
  };

  return (
    <div className="min-h-screen">
      <AppHeader section="Validation" subtitle="Does the model match reality?">
        <NavPill href="/" icon={<MapIcon className="w-3.5 h-3.5" />} label="Pulse Map" />
        <NavPill href="/ghost" icon={<Ghost className="w-3.5 h-3.5" />} label="Ghost" />
        <NavPill href="/council" icon={<Gavel className="w-3.5 h-3.5" />} label="Council" />
        <NavPill href="/lab" icon={<Layers className="w-3.5 h-3.5" />} label="Lab" />
        <NavPill href="/runs" icon={<FlaskRound className="w-3.5 h-3.5" />} label="Runs" />
        <ThemeToggle />
      </AppHeader>

      <main className="max-w-[1100px] mx-auto px-4 lg:px-6 py-6 pb-16">
        <h2 className="font-display text-xl text-slate-100">Historical validation</h2>
        <p className="text-sm text-slate-400 max-w-2xl mb-6 mt-1">
          Does the model get reality right? Each card runs a real, studied policy through the same PolicyPulse engine and compares the predicted <em>direction</em> of effects against the documented findings of a published study. Figures are approximate reference points for directional validation.
        </p>

        <motion.div variants={container} initial="hidden" animate="show" className="space-y-4">
          {cases.map((c) => (
            <motion.div key={c.id} variants={item} className="glass rounded-2xl p-5 hover:border-line/80 transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-display text-base font-semibold text-slate-100">{c.title}</h2>
                    <span className="font-data text-[11px] text-slate-500">{c.jurisdiction} · {c.year}</span>
                  </div>
                  <p className="text-sm text-slate-400 mt-1.5 leading-relaxed max-w-3xl">{c.summary}</p>
                  <a href={c.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-signal-bright hover:text-signal mt-2">
                    {c.source} <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <button
                  onClick={() => run(c.id)}
                  disabled={loading[c.id]}
                  className="shrink-0 flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium bg-signal text-ink hover:bg-signal-bright hover:shadow-[0_0_20px_rgba(110,139,255,0.3)] disabled:opacity-50"
                >
                  <Play className="w-3.5 h-3.5" />
                  {loading[c.id] ? "Running…" : results[c.id] ? "Re-run" : "Validate"}
                </button>
              </div>

              <div className="mt-4 space-y-1.5">
                <div className="grid grid-cols-12 gap-2 font-data text-[10px] uppercase tracking-[0.12em] text-slate-500 px-1">
                  <span className="col-span-4">Metric</span>
                  <span className="col-span-4">Documented (actual)</span>
                  <span className="col-span-3">PolicyPulse predicted</span>
                  <span className="col-span-1 text-right">Match</span>
                </div>
                {c.actuals.map((m) => (
                  <Row key={m.key} actual={m} predicted={results[c.id]?.[m.key]} />
                ))}
              </div>
            </motion.div>
          ))}
        </motion.div>
      </main>
    </div>
  );
}

function Row({ actual, predicted }: { actual: ActualMetric; predicted?: Predicted }) {
  const verdict = !predicted
    ? null
    : actual.direction === "mixed" || predicted.direction === "mixed"
      ? { label: "Consistent", cls: "bg-amber-500/15 text-amber-300" }
      : actual.direction === predicted.direction
        ? { label: "Match", cls: "bg-emerald-500/15 text-emerald-300" }
        : { label: "Diverges", cls: "bg-rose-500/15 text-rose-300" };
  return (
    <div className="grid grid-cols-12 gap-2 items-center rounded-lg bg-ink/40 border border-line px-3 py-2 text-xs">
      <span className="col-span-4 text-slate-200">{actual.label}</span>
      <span className="col-span-4 font-data text-slate-400 flex items-center gap-1.5 tabular-nums">
        <Arrow dir={actual.direction} /> {actual.actual}
      </span>
      <span className="col-span-3 font-data text-slate-300 flex items-center gap-1.5 tabular-nums">
        {predicted ? (<><Arrow dir={predicted.direction} /> {predicted.display}</>) : <span className="text-slate-600">—</span>}
      </span>
      <span className="col-span-1 flex justify-end">
        {verdict && <span className={cn("text-[10px] px-1.5 py-0.5 rounded", verdict.cls)}>{verdict.label}</span>}
      </span>
    </div>
  );
}

function Arrow({ dir }: { dir: Direction }) {
  if (dir === "up") return <ArrowUp className="w-3 h-3 text-rose-400" />;
  if (dir === "down") return <ArrowDown className="w-3 h-3 text-emerald-400" />;
  return <Minus className="w-3 h-3 text-slate-500" />;
}
