"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Database, FlaskRound, Layers, Map as MapIcon } from "lucide-react";
import { PulseLine } from "@/components/Brand";
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
      <header className="relative border-b border-line backdrop-blur sticky top-0 z-30 bg-ink/80">
        <div className="max-w-5xl mx-auto px-4 lg:px-6 py-3 flex items-center justify-between">
          <Link href="/simulate" className="flex items-center gap-2 text-sm text-slate-300 hover:text-signal-bright transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to simulator
          </Link>
          <div className="flex items-center gap-2 text-slate-200">
            <FlaskRound className="w-4 h-4 text-signal" />
            <span className="font-display text-sm font-semibold text-slate-100">Run gallery</span>
          </div>
        </div>
        <PulseLine width={1400} height={20} className="absolute inset-x-0 -bottom-px h-5 opacity-70" />
      </header>

      <main className="max-w-5xl mx-auto px-4 lg:px-6 py-6 pb-20">
        <div className="flex items-end justify-between gap-4 mb-6">
          <p className="text-sm text-slate-400 max-w-2xl">
            Every simulation you run is saved here. Open one to replay its outcome, or copy its
            link to share a specific result. The dashboard reconstructs the full run from its snapshot.
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <Link href="/" className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-signal-bright border border-line hover:border-signal/50 rounded-full px-3 py-1.5 transition-colors">
              <MapIcon className="w-3.5 h-3.5" /> Map
            </Link>
            <Link href="/lab" className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-signal-bright border border-line hover:border-signal/50 rounded-full px-3 py-1.5 transition-colors">
              <Layers className="w-3.5 h-3.5" /> Lab
            </Link>
          </div>
        </div>

        {redis && (
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mb-4">
            <Database className="w-3.5 h-3.5" />
            {redis.connected
              ? "Runs mirrored to Redis — shareable links survive restarts."
              : "In-memory store — the last 40 runs of this session are available."}
          </div>
        )}

        {runs === null ? (
          <div className="text-slate-600 text-sm py-16 text-center">Loading runs…</div>
        ) : runs.length === 0 ? (
          <div className="glass rounded-2xl p-10 text-center grid-bg">
            <p className="text-slate-300 font-medium">No runs yet.</p>
            <p className="text-sm text-slate-500 mt-1.5">Run a simulation and it will appear here.</p>
            <Link
              href="/simulate"
              className="inline-flex items-center gap-2 mt-5 rounded-xl px-4 py-2.5 text-sm font-semibold bg-signal text-ink hover:bg-signal-bright transition-colors"
            >
              New simulation <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {runs.map((r) => (
              <Link
                key={r.runId}
                href={`/simulate?runId=${r.runId}`}
                className="group glass rounded-2xl p-4 hover:border-signal/50 transition-colors flex flex-col"
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="font-data text-[11px] text-slate-400">{r.jurisdiction}</span>
                  <span className={cn("text-[10px] px-1.5 py-0.5 rounded", STATUS_STYLE[r.status] ?? "bg-slate-800 text-slate-400")}>
                    {r.status}
                  </span>
                </div>
                {r.headline ? (
                  <p className="text-sm font-medium text-slate-100 leading-snug line-clamp-2">{r.headline}</p>
                ) : (
                  <p className="text-sm font-medium text-slate-200 leading-snug line-clamp-2">{r.policy}</p>
                )}
                <p className="text-[12px] text-slate-500 mt-1.5 line-clamp-2 leading-relaxed">{r.policy}</p>
                <div className="flex items-center justify-between mt-auto pt-3 text-[11px] text-slate-500">
                  <span>{r.agentCount > 0 ? `${r.agentCount} residents` : "snapshot"} · {relativeTime(r.createdAt)}</span>
                  <span className="flex items-center gap-1 text-signal-bright opacity-0 group-hover:opacity-100 transition-opacity">
                    Open <ArrowRight className="w-3 h-3" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
