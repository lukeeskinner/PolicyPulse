"use client";

import { motion } from "framer-motion";
import { Gavel, Scale } from "lucide-react";
import type { Stakeholder, Verdict as V, Vote } from "@/lib/council/types";
import { OUTCOME_META, VOTE_META } from "@/lib/council/ui";

export function Verdict({ verdict, stakeholders }: { verdict: V; stakeholders: Stakeholder[] }) {
  const meta = OUTCOME_META[verdict.outcome];
  const nameOf = (id: string) => stakeholders.find((s) => s.id === id)?.name ?? id;
  const colorOf = (id: string) => stakeholders.find((s) => s.id === id)?.color ?? "#94a3b8";
  const { aye, nay, abstain } = verdict.tally;
  const total = Math.max(aye + nay + abstain, 1);

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} className="glass rounded-2xl p-5 grid-bg">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${meta.color}1f`, color: meta.color }}>
            <Gavel className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <span className="text-[11px] uppercase tracking-wider font-data" style={{ color: meta.color }}>{meta.label}</span>
            <h3 className="font-display text-lg text-slate-100 leading-tight">{verdict.headline}</h3>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-data text-3xl text-slate-100 leading-none tabular-nums">
            {aye}<span className="text-slate-600">–</span>{nay}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">{abstain ? `${abstain} abstain` : "decided"}</div>
        </div>
      </div>

      {/* Visual tally bar */}
      <div className="mt-4 flex h-2.5 rounded-full overflow-hidden bg-ink/60">
        {([["aye", aye], ["nay", nay], ["abstain", abstain]] as [Vote, number][]).map(([v, n]) =>
          n > 0 ? <motion.span key={v} initial={{ width: 0 }} animate={{ width: `${(n / total) * 100}%` }} transition={{ duration: 0.6, ease: "easeOut" }} style={{ background: VOTE_META[v].color }} title={`${n} ${VOTE_META[v].label}`} /> : null,
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {verdict.votes.map((v) => (
          <span key={v.stakeholderId} title={v.rationale} className="text-[11px] px-2 py-0.5 rounded-full border flex items-center gap-1.5" style={{ borderColor: `${colorOf(v.stakeholderId)}55` }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: VOTE_META[v.vote].color }} />
            <span className="text-slate-300">{nameOf(v.stakeholderId)}</span>
          </span>
        ))}
      </div>

      {/* The pivotal move — the one insight worth keeping */}
      <div className="mt-4 rounded-xl border border-line bg-ink/40 p-3">
        <div className="flex items-center gap-2 mb-1.5">
          <Scale className="w-3.5 h-3.5 text-signal" />
          <span className="text-[10px] uppercase tracking-wider text-slate-500 font-data">Pivotal move</span>
        </div>
        <p className="text-[13px] text-slate-200 leading-snug">
          <span className="font-semibold" style={{ color: colorOf(verdict.criticalConcession.stakeholderId) }}>{nameOf(verdict.criticalConcession.stakeholderId)}</span> — {verdict.criticalConcession.what}
        </p>
        <p className="text-[12px] mt-1.5 leading-snug text-amber-300/90">
          <span className="font-data text-amber-400/80">Without it →</span> {verdict.criticalConcession.counterfactual}
        </p>
      </div>
    </motion.div>
  );
}
