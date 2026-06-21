"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Pause, Play, Quote, Sparkles, Volume2, X } from "lucide-react";
import type { AgentHistoryEntry, Outcome, Persona } from "@/lib/types";
import { groupColor, OUTCOME_COLORS, OUTCOME_LABEL, roleShort } from "@/lib/ui";
import { cn, fmtPct, fmtUSD } from "@/lib/utils";

interface AgentDetail {
  persona: Persona;
  history: AgentHistoryEntry[];
  outcome: Outcome;
  impactScore: number;
  story: string;
  source: "llm" | "template";
}

interface Props {
  runId?: string;
  agentId: string | null;
  onClose: () => void;
}

export function AgentDrawer({ runId, agentId, onClose }: Props) {
  const [data, setData] = useState<AgentDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!runId || !agentId) return;
    setData(null);
    setLoading(true);
    fetch(`/api/agent/${runId}/${agentId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, [runId, agentId]);

  return (
    <AnimatePresence>
      {agentId && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/60 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            className="fixed right-0 top-0 bottom-0 w-full max-w-md z-50 glass border-l border-line overflow-y-auto"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 280 }}
          >
            <div className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="w-10 h-10 rounded-xl flex items-center justify-center text-base font-bold text-slate-900" style={{ background: data ? groupColor(data.persona.group) : "#334155" }}>
                    {data ? data.persona.name.charAt(0) : "·"}
                  </span>
                  <div>
                    <h2 className="text-base font-semibold text-slate-100">{data?.persona.name ?? "Loading…"}</h2>
                    {data && (
                      <p className="text-xs text-slate-400">
                        {data.persona.age} · {roleShort(data.persona.roles)} · {data.persona.group}
                        {data.persona.nativity === "immigrant" ? " · immigrant" : ""}
                      </p>
                    )}
                  </div>
                </div>
                <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {data && (
                <>
                  <div className="flex items-center gap-2 mt-3">
                    <span
                      className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                      style={{ background: `${OUTCOME_COLORS[data.outcome]}22`, color: OUTCOME_COLORS[data.outcome] }}
                    >
                      {OUTCOME_LABEL[data.outcome]}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      net welfare impact <span className={cn("font-semibold", data.impactScore >= 0 ? "text-emerald-300" : "text-rose-300")}>{data.impactScore > 0 ? "+" : ""}{data.impactScore}</span>
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-4 text-xs">
                    <Fact label="Lives in" value={data.persona.neighborhood} />
                    <Fact label="Tenure" value={data.persona.tenure} />
                    <Fact label="Sector" value={data.persona.sector} />
                    <Fact label="Household" value={`${data.persona.householdSize} ${data.persona.householdSize === 1 ? "person" : "people"}`} />
                  </div>

                  {/* narrative */}
                  <div className="mt-4 rounded-xl bg-ink/50 border border-line p-4">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Quote className="w-3.5 h-3.5 text-signal" />
                      <span className="eyebrow">Their story</span>
                      {data.source === "llm" && (
                        <span className="ml-auto flex items-center gap-1 text-[10px] text-signal-bright">
                          <Sparkles className="w-3 h-3" /> Haiku
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-200 leading-relaxed italic">{data.story}</p>
                    <StoryVoice story={data.story} resetKey={agentId ?? ""} />
                  </div>

                  {/* trajectory */}
                  <div className="mt-4">
                    <h3 className="eyebrow mb-2">Trajectory</h3>
                    <div className="space-y-1.5">
                      {data.history.map((h) => (
                        <div key={h.round} className="flex items-center gap-2 text-xs">
                          <span className="w-16 text-slate-500 shrink-0">{h.label}</span>
                          <div className="flex-1 flex items-center gap-2">
                            <BurdenBar value={h.state.rentBurden} />
                            <span className="text-slate-400 tabular-nums w-12 text-right">{fmtPct(h.state.rentBurden)}</span>
                          </div>
                          <span className="text-slate-500 w-20 text-right tabular-nums">{fmtUSD(h.state.income)}</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-2">Bar = share of income spent on housing · right = annual income</p>
                  </div>
                </>
              )}

              {loading && !data && <div className="mt-10 text-center text-slate-500 text-sm pp-pulse">Generating their story…</div>}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

// Voices the resident's story aloud via Deepgram Aura (server-side proxy).
// Degrades quietly: if voice isn't configured the control hides; any failure
// surfaces a disabled "voice unavailable" state and never touches the text.
function StoryVoice({ story, resetKey }: { story: string; resetKey: string }) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "playing" | "error">("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  // Capability check — only show the control when the server has a Deepgram key.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/speak")
      .then((r) => (r.ok ? r.json() : { configured: false }))
      .then((d: { configured?: boolean }) => !cancelled && setAvailable(!!d.configured))
      .catch(() => !cancelled && setAvailable(false));
    return () => {
      cancelled = true;
    };
  }, []);

  // Reset playback when switching residents.
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    setStatus("idle");
  }, [resetKey]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  const toggle = async () => {
    const audio = audioRef.current;
    if (status === "playing") {
      audio?.pause();
      return;
    }
    // Resume if we already have the audio loaded.
    if (audio && urlRef.current) {
      await audio.play().catch(() => setStatus("error"));
      return;
    }
    setStatus("loading");
    try {
      const res = await fetch("/api/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: story }),
      });
      if (!res.ok) {
        setStatus("error");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      const el = new Audio(url);
      audioRef.current = el;
      el.onplay = () => setStatus("playing");
      el.onpause = () => setStatus((s) => (s === "playing" ? "idle" : s));
      el.onended = () => setStatus("idle");
      el.onerror = () => setStatus("error");
      await el.play();
    } catch {
      setStatus("error");
    }
  };

  if (available === null || available === false) return null;

  return (
    <div className="mt-3 flex items-center gap-2">
      <button
        onClick={toggle}
        disabled={status === "loading"}
        className="flex items-center gap-1.5 text-[12px] font-medium text-ink bg-signal hover:bg-signal-bright disabled:opacity-60 rounded-lg px-3 py-1.5 transition-colors"
      >
        {status === "loading" ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating voice…
          </>
        ) : status === "playing" ? (
          <>
            <Pause className="w-3.5 h-3.5" /> Pause
          </>
        ) : (
          <>
            <Play className="w-3.5 h-3.5" /> Hear their story
          </>
        )}
      </button>
      {status === "error" ? (
        <span className="text-[11px] text-slate-500">Voice unavailable</span>
      ) : (
        <span className="flex items-center gap-1 text-[10px] text-slate-500">
          <Volume2 className="w-3 h-3" /> Deepgram Aura
        </span>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-ink/40 border border-line px-2.5 py-1.5">
      <div className="text-[10px] text-slate-500">{label}</div>
      <div className="text-[12px] text-slate-200 capitalize truncate">{value}</div>
    </div>
  );
}

function BurdenBar({ value }: { value: number }) {
  const pct = Math.min(100, value * 100);
  const color = value > 0.5 ? "#ef4444" : value > 0.35 ? "#f59e0b" : "#34d399";
  return (
    <div className="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden">
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}
