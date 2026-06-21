"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Database, FlaskConical, Ghost, Layers, Map as MapIcon, Plus } from "lucide-react";
import { AppHeader, NavPill } from "@/components/AppHeader";
import type { RunMeta } from "@/lib/types";
import { cn } from "@/lib/utils";

interface RedisHealth {
  configured: boolean;
  connected: boolean;
}

function relativeTime(ts: number): string {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

const STATUS_STYLE: Record<string, string> = {
  complete: "bg-emerald-500/15 text-emerald-300",
  running: "bg-signal/15 text-signal-bright",
  error: "bg-rose-500/15 text-rose-300",
};

const container = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };
const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const } } };

export default function RunsPage() {
  const [runs, setRuns] = useState<RunMeta[] | null>(null);
  const [redis, setRedis] = useState<RedisHealth | null>(null);

  useEffect(() => {
    fetch("/api/runs")
      .then((r) => r.json())
      .then((d) => {
        setRuns(d.runs ?? []);
        setRedis(d.redis ?? null);
      })
      .catch(() => setRuns([]));
  }, []);

  return (
    <div className="min-h-screen">
      <AppHeader section="Runs" subtitle="Replay & share saved simulations">
        <NavPill href="/" icon={<MapIcon className="w-3.5 h-3.5" />} label="Pulse Map" />
        <NavPill href="/ghost" icon={<Ghost className="w-3.5 h-3.5" />} label="Ghost" />
        <NavPill href="/lab" icon={<Layers className="w-3.5 h-3.5" />} label="Lab" />
        <NavPill href="/validate" icon={<FlaskConical className="w-3.5 h-3.5" />} label="Validation" />
      </AppHeader>

      <main className="max-w-[1200px] mx-auto px-4 lg:px-6 py-6 pb-12 flex flex-col min-h-[calc(100vh-92px)]">
        <div className="flex items-end justify-between gap-4 mb-5 shrink-0">
          <div>
            <h2 className="font-display text-xl text-slate-100">Run gallery</h2>
            <p className="text-sm text-slate-400 max-w-2xl mt-1">
              Every simulation is saved here. Open one to replay its outcome, or copy its link to share a specific result.
            </p>
          </div>
          {redis && (
            <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-slate-500 shrink-0">
              <Database className="w-3.5 h-3.5" />
              {redis.connected ? "Mirrored to Redis" : "In-memory · last 40 runs"}
            </div>
          )}
        </div>

        <div className="flex-1 flex flex-col justify-center">
          {runs === null ? (
            <div className="text-slate-600 text-sm py-16 text-center">Loading runs…</div>
          ) : (
            <motion.div variants={container} initial="hidden" animate="show" className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {runs.map((r) => (
                <motion.div key={r.runId} variants={item}>
                  <Link href={`/simulate?runId=${r.runId}`} className="group glass rounded-2xl p-4 hover:border-signal/50 hover:-translate-y-0.5 transition-all duration-200 flex flex-col h-full min-h-[150px]">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="font-data text-[11px] text-slate-400">{r.jurisdiction}</span>
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded", STATUS_STYLE[r.status] ?? "bg-slate-800 text-slate-400")}>{r.status}</span>
                    </div>
                    <p className="text-sm font-medium text-slate-100 leading-snug line-clamp-2">{r.headline ?? r.policy}</p>
                    <p className="text-[12px] text-slate-500 mt-1.5 line-clamp-2 leading-relaxed">{r.policy}</p>
                    <div className="flex items-center justify-between mt-auto pt-3 text-[11px] text-slate-500">
                      <span>{r.agentCount > 0 ? `${r.agentCount} residents` : "snapshot"} · {relativeTime(r.createdAt)}</span>
                      <span className="flex items-center gap-1 text-signal-bright opacity-0 group-hover:opacity-100 transition-opacity">Open <ArrowRight className="w-3 h-3" /></span>
                    </div>
                  </Link>
                </motion.div>
              ))}
              <motion.div variants={item}>
                <Link href="/simulate" className="group glass rounded-2xl p-4 border-dashed hover:border-signal/50 hover:-translate-y-0.5 transition-all duration-200 flex flex-col items-center justify-center text-center h-full min-h-[150px]">
                  <span className="w-9 h-9 rounded-xl bg-signal/12 text-signal-bright flex items-center justify-center group-hover:bg-signal/20 transition-colors">
                    <Plus className="w-4 h-4" />
                  </span>
                  <p className="text-sm font-medium text-slate-200 mt-3">New simulation</p>
                  <p className="text-[11px] text-slate-500 mt-1">Stress-test a bill on a digital twin</p>
                </Link>
              </motion.div>
            </motion.div>
          )}
        </div>
      </main>
    </div>
  );
}
