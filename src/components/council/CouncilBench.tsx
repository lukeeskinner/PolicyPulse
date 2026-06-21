"use client";

import { motion } from "framer-motion";
import { Check, Gavel, Minus, Users, X } from "lucide-react";
import type { ConstituentOutcome, Stance, Vote } from "@/lib/council/types";
import type { StakeholderRuntime } from "@/lib/council/useCouncil";
import { STANCE, VOTE_META, phaseActive } from "@/lib/council/ui";
import { cn } from "@/lib/utils";

// The council bench is a positions board: one glanceable row per seat. Stance is
// the row's accent color, the bar shows how that seat's constituents actually
// fared in the simulation, and the vote chip lands once cast. The words live on
// the floor (DebateStream) — the bench is pure state.
export function CouncilBench({ stakeholders, outcomes }: { stakeholders: StakeholderRuntime[]; outcomes?: ConstituentOutcome[] }) {
  const byId = new Map((outcomes ?? []).map((o) => [o.stakeholderId, o] as const));
  return (
    <div className="glass rounded-2xl p-4 flex flex-col h-full min-h-0 flex-1 w-full">
      <div className="flex items-center gap-2 mb-3 shrink-0">
        <Users className={cn("w-4 h-4 text-signal", stakeholders.length && "pp-pulse")} />
        <h3 className="eyebrow">The council</h3>
        <span className="ml-auto text-[10px] text-slate-500 font-data">{stakeholders.length ? `${stakeholders.length} seats` : "—"}</span>
      </div>
      {stakeholders.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-center text-[13px] text-slate-600 px-6 min-h-[120px]">Seats fill once the bill is simulated.</div>
      ) : (
        <div className="space-y-2 overflow-y-auto pr-1 min-h-0">
          {stakeholders.map((s) => (
            <SeatRow key={s.id} seat={s} outcome={byId.get(s.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

const VOTE_ICON: Record<Vote, React.ComponentType<{ className?: string }>> = { aye: Check, nay: X, abstain: Minus };

function SeatRow({ seat, outcome }: { seat: StakeholderRuntime; outcome?: ConstituentOutcome }) {
  const active = phaseActive(seat.phase);
  const stance = seat.position?.stance;
  const vote = seat.vote?.vote;
  // Accent priority: settled vote > stated stance > seat hue (pre-debate).
  const accent = vote ? VOTE_META[vote].color : stance ? STANCE[stance].color : seat.color;

  return (
    <motion.div
      layout
      animate={{ borderColor: active ? `${accent}66` : "rgba(39,44,56,1)", boxShadow: active ? `0 0 18px ${accent}1f` : "0 0 0 rgba(0,0,0,0)" }}
      transition={{ duration: 0.4 }}
      className="relative rounded-xl bg-ink/45 border pl-3 pr-2.5 py-2 overflow-hidden"
    >
      <span className="absolute left-0 top-0 bottom-0 w-[3px] rounded-r" style={{ background: accent, opacity: stance || vote ? 1 : 0.5 }} />
      <div className="flex items-center gap-2">
        <span className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${seat.color}22`, color: seat.color }}>
          {seat.isChair ? <Gavel className={cn("w-3 h-3", active && "pp-pulse")} /> : <Users className={cn("w-3 h-3", active && "pp-pulse")} />}
        </span>
        <span className="text-[13px] font-semibold text-slate-100 truncate flex-1 min-w-0">{seat.name}</span>
        <StatusChip seat={seat} stance={stance} vote={vote} active={active} />
      </div>

      {seat.isChair ? (
        <p className="text-[10px] text-slate-500 mt-1 pl-8">Brokers the floor · no seat vote</p>
      ) : outcome ? (
        <ImpactBar value={outcome.meanImpact} />
      ) : null}
    </motion.div>
  );
}

function StatusChip({ seat, stance, vote, active }: { seat: StakeholderRuntime; stance?: Stance; vote?: Vote; active: boolean }) {
  if (vote) {
    const Icon = VOTE_ICON[vote];
    return (
      <span className="flex items-center gap-1 text-[10px] font-data font-semibold px-1.5 py-0.5 rounded shrink-0" style={{ background: `${VOTE_META[vote].color}1f`, color: VOTE_META[vote].color }}>
        <Icon className="w-3 h-3" />
        {VOTE_META[vote].label}
      </span>
    );
  }
  if (stance) {
    return <span className="text-[10px] font-data px-1.5 py-0.5 rounded shrink-0" style={{ background: `${STANCE[stance].color}1f`, color: STANCE[stance].color }}>{STANCE[stance].label}</span>;
  }
  // pre-stance: a quiet activity dot rather than a wordy phase label
  return <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", active ? "pp-pulse" : "opacity-40")} style={{ background: seat.color }} />;
}

// A thin diverging bar from a center baseline: how this seat's constituents
// fared under the bill (− red / + green), with the signed welfare number.
function ImpactBar({ value }: { value: number }) {
  const pct = Math.min(Math.abs(value) / 40, 1) * 50; // 40 ≈ full half-width
  const pos = value >= 0;
  const color = pos ? "#34d399" : "#fb7185";
  return (
    <div className="flex items-center gap-2 mt-1.5 pl-8">
      <div className="relative flex-1 h-1.5 rounded-full bg-ink/70 overflow-hidden">
        <span className="absolute top-0 bottom-0 left-1/2 w-px bg-slate-600" />
        <motion.span
          className="absolute top-0 bottom-0 rounded-full"
          style={{ background: color, ...(pos ? { left: "50%" } : { right: "50%" }) }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>
      <span className="font-data text-[11px] tabular-nums shrink-0 w-8 text-right" style={{ color }}>{pos ? "+" : ""}{value}</span>
    </div>
  );
}
