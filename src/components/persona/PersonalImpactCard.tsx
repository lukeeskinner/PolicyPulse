"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, Minus, Scale, TrendingDown, TrendingUp } from "lucide-react";
import type { UserArea } from "@/lib/civic";
import type { PersonalImpact, PersonalPolicyDigest } from "@/lib/types";
import { OUTCOME_COLORS, OUTCOME_LABEL } from "@/lib/ui";
import { cn, fmtPct, fmtUSD } from "@/lib/utils";

interface Props {
  impact: PersonalImpact;
  model: PersonalPolicyDigest;
  personaName: string;
  policyText: string;
  area: UserArea | null;
}

export function PersonalImpactCard({ impact, model, personaName, policyText, area }: Props) {
  const { outcome, deltas } = impact;
  const net = deltas.netAnnual;
  const netTone = Math.abs(net) < 200 ? "neutral" : net > 0 ? "good" : "bad";

  return (
    <div className="glass rounded-2xl overflow-hidden grid-bg">
      {/* verdict ---------------------------------------------------------- */}
      <header className="px-5 pt-5 pb-4 border-b border-line">
        <div className="flex items-center justify-between gap-3 mb-3">
          <span className="eyebrow">How this lands on {personaName === "You" ? "you" : personaName}</span>
          <OutcomePill outcome={outcome} />
        </div>
        <h2 className="font-display text-xl text-slate-50 leading-tight">{impact.headline}</h2>
        {impact.summary && (
          <p className="font-serif-editorial text-[15px] text-slate-300 leading-snug mt-2">{impact.summary}</p>
        )}
      </header>

      {/* signature: the net annual cash figure ---------------------------- */}
      <div className="px-5 py-5 flex items-end justify-between gap-4 border-b border-line">
        <div>
          <div
            className={cn(
              "font-display text-4xl sm:text-5xl tracking-tight tabular-nums",
              netTone === "good" && "text-emerald-300",
              netTone === "bad" && "text-rose-400",
              netTone === "neutral" && "text-slate-300",
            )}
          >
            {net > 0 ? "+" : net < 0 ? "−" : ""}
            {fmtUSD(Math.abs(net))}
          </div>
          <p className="text-[12px] text-slate-400 mt-1">Estimated net effect on your household, per year</p>
        </div>
        <ImpactDial score={impact.impactScore} />
      </div>

      {/* before -> after -------------------------------------------------- */}
      <div className="px-5 py-4 space-y-2.5 border-b border-line">
        <DeltaRow
          label="Annual income"
          beforeText={fmtUSD(impact.before.income)}
          afterText={fmtUSD(impact.after.income)}
          delta={deltas.incomeAnnual}
          betterWhenLower={false}
          format={(n) => fmtUSD(Math.abs(n))}
        />
        <DeltaRow
          label="Monthly housing"
          beforeText={fmtUSD(impact.before.monthlyHousingCost)}
          afterText={fmtUSD(impact.after.monthlyHousingCost)}
          delta={impact.after.monthlyHousingCost - impact.before.monthlyHousingCost}
          betterWhenLower
          format={(n) => fmtUSD(Math.abs(n))}
        />
        <DeltaRow
          label="Rent / housing burden"
          beforeText={fmtPct(impact.before.rentBurden)}
          afterText={fmtPct(impact.after.rentBurden)}
          delta={deltas.rentBurdenPts}
          betterWhenLower
          format={(n) => `${Math.abs(n * 100).toFixed(1)} pts`}
        />
      </div>

      {/* why -------------------------------------------------------------- */}
      {impact.reasons.length > 0 && (
        <Block title="Why it lands this way">
          <ul className="space-y-2">
            {impact.reasons.map((r) => (
              <li key={`${r.kind}-${r.key}`} className="flex items-start gap-2.5 text-[13px] leading-snug">
                <span
                  className={cn(
                    "mt-1 w-2 h-2 rounded-full shrink-0",
                    r.kind === "benefit" ? "bg-emerald-400" : "bg-rose-400",
                  )}
                />
                <span className="text-slate-300">
                  <span className="text-slate-100 font-medium">{r.label}</span>
                  {r.kind === "benefit" ? ", the policy is meant to help you." : ", you bear some of its cost."}
                </span>
              </li>
            ))}
          </ul>
        </Block>
      )}

      {/* channels --------------------------------------------------------- */}
      {impact.channels.length > 0 && (
        <Block title="What this policy moves">
          <div className="flex flex-wrap gap-2">
            {impact.channels.map((c) => (
              <span
                key={c.channel}
                className="flex items-center gap-1.5 text-[12px] text-slate-300 border border-line rounded-full px-2.5 py-1"
              >
                {c.value > 0 ? (
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
                )}
                {c.label}
              </span>
            ))}
          </div>
        </Block>
      )}

      {/* risks ------------------------------------------------------------ */}
      {impact.risks.length > 0 && (
        <Block title="Watch for">
          <ul className="space-y-2.5">
            {impact.risks.map((r) => (
              <li key={r.flag} className="flex items-start gap-2.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-300 shrink-0 mt-0.5" />
                <div className="text-[12px] leading-snug">
                  <span className="text-amber-200 font-medium">{r.flag}.</span>{" "}
                  <span className="text-slate-400">{r.statement}</span>
                </div>
              </li>
            ))}
          </ul>
        </Block>
      )}

      {/* footer: honesty + escalate to the full sim ----------------------- */}
      <footer className="px-5 py-4 bg-surface/30 space-y-3">
        <p className="text-[11px] text-slate-500 leading-relaxed flex items-start gap-1.5">
          <Scale className="w-3.5 h-3.5 shrink-0 mt-px text-slate-500" />
          A direct estimate from the {model.modelSource === "llm" ? "AI" : "built-in"} policy model applied to your
          profile over ~3 years — not the full agent-based simulation. Model confidence {Math.round(model.confidence * 100)}%.
        </p>
        <Link
          href={simulateHref(policyText, area)}
          className="w-full flex items-center justify-center gap-1.5 text-[13px] font-medium text-slate-200 hover:text-signal-bright border border-line hover:border-signal/50 rounded-lg px-3 py-2 transition-colors"
        >
          See who else it affects — run the full community simulation <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </footer>
    </div>
  );
}

function simulateHref(policyText: string, area: UserArea | null): string {
  const qs = new URLSearchParams({ policy: policyText });
  if (area) {
    qs.set("jurisdiction", area.region);
    qs.set("state", area.regionCode);
    qs.set("label", area.label);
    if (Number.isFinite(area.lat) && Number.isFinite(area.lng)) {
      qs.set("lat", String(area.lat));
      qs.set("lng", String(area.lng));
    }
  }
  return `/simulate?${qs.toString()}`;
}

function OutcomePill({ outcome }: { outcome: PersonalImpact["outcome"] }) {
  return (
    <span
      className="flex items-center gap-1.5 text-[12px] font-medium rounded-full px-2.5 py-1 border"
      style={{ color: OUTCOME_COLORS[outcome], borderColor: `${OUTCOME_COLORS[outcome]}55` }}
    >
      <span className="w-2 h-2 rounded-full" style={{ background: OUTCOME_COLORS[outcome] }} />
      {OUTCOME_LABEL[outcome]}
    </span>
  );
}

// A compact gauge for the -100..100 net welfare score.
function ImpactDial({ score }: { score: number }) {
  const pct = (score + 100) / 200; // 0..1
  const tone = score > 8 ? "#34d399" : score < -8 ? "#f59e0b" : "#64748b";
  return (
    <div className="text-right shrink-0">
      <div className="font-data text-lg tabular-nums" style={{ color: tone }}>
        {score > 0 ? "+" : ""}
        {score}
      </div>
      <div className="w-24 h-1.5 rounded-full bg-surface-2 mt-1 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct * 100}%`, background: tone }} />
      </div>
      <div className="text-[10px] text-slate-500 mt-1">impact score</div>
    </div>
  );
}

function DeltaRow({
  label,
  beforeText,
  afterText,
  delta,
  betterWhenLower,
  format,
}: {
  label: string;
  beforeText: string;
  afterText: string;
  delta: number;
  betterWhenLower: boolean;
  format: (n: number) => string;
}) {
  const flat = Math.abs(delta) < (label.includes("burden") ? 0.001 : 1);
  const improved = !flat && (betterWhenLower ? delta < 0 : delta > 0);
  const tone = flat ? "text-slate-500" : improved ? "text-emerald-300" : "text-rose-400";
  const Icon = flat ? Minus : improved ? TrendingUp : TrendingDown;
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[13px] text-slate-400">{label}</span>
      <div className="flex items-center gap-2.5">
        <span className="font-data text-[13px] text-slate-500 tabular-nums">{beforeText}</span>
        <ArrowRight className="w-3 h-3 text-slate-600" />
        <span className="font-data text-[13px] text-slate-100 tabular-nums">{afterText}</span>
        <span className={cn("flex items-center gap-1 font-data text-[12px] tabular-nums w-[88px] justify-end", tone)}>
          <Icon className="w-3.5 h-3.5" />
          {flat ? "no change" : `${sign}${format(delta)}`}
        </span>
      </div>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="px-5 py-4 border-b border-line last:border-b-0">
      <h3 className="eyebrow mb-3">{title}</h3>
      {children}
    </section>
  );
}
