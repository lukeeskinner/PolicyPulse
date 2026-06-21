"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, ExternalLink, Landmark, X } from "lucide-react";
import type { Bill, PolicyMarker } from "@/lib/civic";

interface PolicyDetailProps {
  marker: PolicyMarker | null;
  onClose: () => void;
  onSimulate: (bill: Bill) => void;
}

export function PolicyDetail({ marker, onClose, onSimulate }: PolicyDetailProps) {
  return (
    <AnimatePresence>
      {marker && (
        <motion.aside
          key={marker.id}
          initial={{ x: -380, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -380, opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 32 }}
          className="absolute top-3 left-3 bottom-3 w-[360px] max-w-[88vw] glass rounded-2xl z-20 flex flex-col overflow-hidden"
        >
          <header className="px-4 py-3.5 border-b border-slate-800/70 flex items-start justify-between shrink-0">
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-violet-500/15 flex items-center justify-center mt-0.5">
                <Landmark className="w-4 h-4 text-violet-300" />
              </div>
              <div>
                <h2 className="font-display text-base text-slate-50 leading-tight">{marker.title}</h2>
                <p className="text-[11px] text-slate-400 mt-0.5">{marker.subtitle}</p>
              </div>
            </div>
            <button onClick={onClose} className="text-slate-500 hover:text-slate-200 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </header>

          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">
            {marker.bills.map((bill) => (
              <BillCard key={bill.id} bill={bill} onSimulate={onSimulate} />
            ))}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

function BillCard({ bill, onSimulate }: { bill: Bill; onSimulate: (b: Bill) => void }) {
  return (
    <div className="rounded-xl border border-slate-800/70 bg-slate-900/40 p-3 hover:border-slate-700 transition-colors">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="font-data text-[11px] text-cyan-300 font-semibold">{bill.identifier}</span>
        <LevelBadge level={bill.level} />
        {bill.sponsorParty && <PartyChip party={bill.sponsorParty} />}
      </div>

      <h3 className="text-[13px] text-slate-100 leading-snug font-medium">{bill.title}</h3>

      {bill.sponsor && (
        <p className="text-[11px] text-slate-500 mt-1">Sponsored by {bill.sponsor}</p>
      )}

      {bill.latestAction && (
        <p className="text-[11px] text-slate-400 mt-1.5 line-clamp-2 leading-relaxed">
          <span className="text-slate-500">Latest:</span> {bill.latestAction}
          {bill.latestActionDate ? ` (${bill.latestActionDate})` : ""}
        </p>
      )}

      <div className="flex items-center gap-2 mt-2.5">
        <button
          onClick={() => onSimulate(bill)}
          className="flex-1 flex items-center justify-center gap-1.5 text-[12px] font-medium text-slate-950 bg-gradient-to-r from-cyan-300 to-violet-300 hover:from-cyan-200 hover:to-violet-200 rounded-lg px-3 py-1.5 transition-colors"
        >
          Simulate the impact <ArrowRight className="w-3.5 h-3.5" />
        </button>
        {bill.url && (
          <a
            href={bill.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-cyan-200 border border-slate-700/70 rounded-lg px-2.5 py-1.5 transition-colors"
            title="Read the official text"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
    </div>
  );
}

function LevelBadge({ level }: { level: Bill["level"] }) {
  const fed = level === "federal";
  return (
    <span
      className={`text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded font-semibold ${
        fed ? "bg-violet-500/15 text-violet-300" : "bg-cyan-500/15 text-cyan-300"
      }`}
    >
      {fed ? "Federal" : "State"}
    </span>
  );
}

function PartyChip({ party }: { party: string }) {
  const p = party.toUpperCase();
  const cls =
    p === "D" ? "bg-blue-500/15 text-blue-300" : p === "R" ? "bg-rose-500/15 text-rose-300" : "bg-slate-500/15 text-slate-300";
  return <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${cls}`}>{p}</span>;
}
