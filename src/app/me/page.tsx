"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  FlaskRound,
  Ghost,
  Landmark,
  Layers,
  Loader2,
  Map as MapIcon,
  Pencil,
  Radar,
  Sparkles,
  UserRound,
} from "lucide-react";
import { PulseLine } from "@/components/Brand";
import { ThemeToggle } from "@/components/ThemeToggle";
import { PersonaForm } from "@/components/persona/PersonaForm";
import { PersonalImpactCard } from "@/components/persona/PersonalImpactCard";
import type { Bill, SourceState, UserArea } from "@/lib/civic";
import { roleShort } from "@/lib/ui";
import type { PersonalImpact, PersonalPolicyDigest, UserPersona } from "@/lib/types";
import { usePersona } from "@/lib/usePersona";
import { cn, fmtUSD } from "@/lib/utils";

interface ImpactResult {
  model: PersonalPolicyDigest;
  impact: PersonalImpact;
}

interface Selected {
  // Rich text sent to the analyst (title + summary); link text kept short.
  impactText: string;
  linkText: string;
  label: string;
}

export default function MyPulsePage() {
  const { persona, area, hydrated, save, clear } = usePersona();
  const [editing, setEditing] = useState(false);

  // Default to the editor only once we know there's no saved persona.
  useEffect(() => {
    if (hydrated && !persona) setEditing(true);
  }, [hydrated, persona]);

  const onSave = (p: UserPersona, a: UserArea | null) => {
    save(p, a);
    setEditing(false);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 w-full max-w-[1400px] mx-auto px-4 lg:px-6 py-4 w-full">
        <Intro hasPersona={!!persona} />

        {!hydrated ? (
          <div className="glass rounded-2xl h-64 flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-signal-bright animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-12 gap-4 mt-4">
            <div className="col-span-12 lg:col-span-5 xl:col-span-4">
              {editing || !persona ? (
                <PersonaForm initial={persona} initialArea={area} onSave={onSave} />
              ) : (
                <PersonaSummary persona={persona} area={area} onEdit={() => setEditing(true)} onClear={clear} />
              )}
            </div>

            <div className="col-span-12 lg:col-span-7 xl:col-span-8">
              {persona && !editing ? (
                <PolicyTester persona={persona} area={area} />
              ) : (
                <PlaceholderPanel />
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// --- policy tester (bills near you + custom) + impact -----------------------

function PolicyTester({ persona, area }: { persona: UserPersona; area: UserArea | null }) {
  const [selected, setSelected] = useState<Selected | null>(null);
  const [result, setResult] = useState<ImpactResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  const test = useCallback(
    async (sel: Selected) => {
      const id = ++reqId.current;
      setSelected(sel);
      setResult(null);
      setError(null);
      setLoading(true);
      try {
        const res = await fetch("/api/impact", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            persona,
            policy: sel.impactText,
            jurisdiction: area?.label ?? area?.region,
            stateCode: area?.regionCode,
          }),
        });
        if (id !== reqId.current) return; // a newer request superseded this one
        if (!res.ok) {
          setError("Couldn’t assess that policy. Try again.");
          return;
        }
        setResult((await res.json()) as ImpactResult);
      } catch {
        if (id === reqId.current) setError("Couldn’t reach the impact service. Try again.");
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    },
    [persona, area],
  );

  return (
    <div className="space-y-4">
      <PolicyPicker area={area} selectedLabel={selected?.label ?? null} onPick={test} />

      {loading && (
        <div className="glass rounded-2xl h-48 flex flex-col items-center justify-center gap-3 grid-bg">
          <Loader2 className="w-6 h-6 text-signal-bright animate-spin" />
          <p className="text-sm text-slate-400">Measuring how it lands on you…</p>
        </div>
      )}

      {error && !loading && (
        <div className="glass rounded-2xl p-5 text-sm text-amber-300">{error}</div>
      )}

      {result && !loading && (
        <PersonalImpactCard
          impact={result.impact}
          model={result.model}
          personaName={persona.name?.trim() || "You"}
          policyText={selected?.linkText ?? ""}
          area={area}
        />
      )}
    </div>
  );
}

function PolicyPicker({
  area,
  selectedLabel,
  onPick,
}: {
  area: UserArea | null;
  selectedLabel: string | null;
  onPick: (sel: Selected) => void;
}) {
  const [federal, setFederal] = useState<Bill[]>([]);
  const [state, setState] = useState<Bill[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "empty">("idle");
  const [custom, setCustom] = useState("");

  useEffect(() => {
    if (!area) {
      setStatus("idle");
      return;
    }
    let cancelled = false;
    setStatus("loading");
    fetch(`/api/policies?state=${area.regionCode}`)
      .then((r) => r.json())
      .then((d: { federal: Bill[]; state: Bill[]; sources: { congress: SourceState; openstates: SourceState } }) => {
        if (cancelled) return;
        setFederal(d.federal ?? []);
        setState(d.state ?? []);
        setStatus((d.federal?.length ?? 0) + (d.state?.length ?? 0) > 0 ? "ready" : "empty");
      })
      .catch(() => !cancelled && setStatus("empty"));
    return () => {
      cancelled = true;
    };
  }, [area]);

  const pickBill = (b: Bill) =>
    onPick({
      impactText: `${b.identifier} — ${b.title}${b.summary ? `\n\n${b.summary}` : ""}`,
      linkText: `${b.identifier} — ${b.title}`,
      label: `${b.identifier} — ${b.title}`,
    });

  const pickCustom = () => {
    const t = custom.trim();
    if (!t) return;
    onPick({ impactText: t, linkText: t, label: "Your policy" });
  };

  return (
    <div className="glass rounded-2xl overflow-hidden">
      <header className="px-5 py-4 border-b border-line flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-signal/15 flex items-center justify-center">
          <Landmark className="w-4 h-4 text-signal" />
        </div>
        <div className="flex-1">
          <h2 className="font-display text-base text-slate-50 leading-none">
            {area ? `Bills moving around ${area.label}` : "Test a policy"}
          </h2>
          <p className="eyebrow mt-1.5">Pick one to see how it lands on you</p>
        </div>
      </header>

      <div className="p-4 space-y-4">
        {!area && (
          <p className="text-sm text-slate-400">
            Add your location in your persona to surface the real bills near you — or paste any policy below.
          </p>
        )}

        {status === "loading" && (
          <div className="flex items-center gap-2 text-sm text-slate-400 py-4 justify-center">
            <Loader2 className="w-4 h-4 animate-spin text-signal-bright" /> Loading bills near you…
          </div>
        )}

        {status === "empty" && area && (
          <p className="text-sm text-slate-400">
            No live bills came back for {area.region} right now (or the bill feeds aren’t configured). Paste a policy
            below to test it.
          </p>
        )}

        {(federal.length > 0 || state.length > 0) && (
          <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
            {state.map((b) => (
              <BillRow key={b.id} bill={b} active={selectedLabel === `${b.identifier} — ${b.title}`} onPick={() => pickBill(b)} />
            ))}
            {federal.map((b) => (
              <BillRow key={b.id} bill={b} active={selectedLabel === `${b.identifier} — ${b.title}`} onPick={() => pickBill(b)} />
            ))}
          </div>
        )}

        <div className="space-y-2 pt-1">
          <label className="text-[12px] text-slate-400">…or paste your own policy</label>
          <textarea
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            rows={3}
            placeholder="e.g. Cap annual rent increases at 3% for existing tenants, with just-cause eviction protections."
            className="w-full bg-surface/40 border border-line rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-signal/50 focus:ring-2 focus:ring-signal/40 transition-colors resize-y"
          />
          <button
            onClick={pickCustom}
            disabled={!custom.trim()}
            className={cn(
              "flex items-center gap-1.5 text-sm font-medium rounded-lg px-3.5 py-2 transition-colors",
              custom.trim()
                ? "text-ink bg-signal hover:bg-signal-bright"
                : "text-slate-500 bg-surface-2 cursor-not-allowed",
            )}
          >
            <Sparkles className="w-4 h-4" /> Test on me
          </button>
        </div>
      </div>
    </div>
  );
}

function BillRow({ bill, active, onPick }: { bill: Bill; active: boolean; onPick: () => void }) {
  return (
    <button
      onClick={onPick}
      className={cn(
        "w-full text-left rounded-xl border p-3 transition-colors group",
        active ? "border-signal/60 bg-signal/10" : "border-line bg-surface/40 hover:border-signal/40",
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="font-data text-[11px] text-signal-bright font-semibold">{bill.identifier}</span>
        <span
          className={cn(
            "font-data text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded font-semibold",
            bill.level === "federal" ? "bg-signal/15 text-signal-bright" : "bg-purple-500/15 text-purple-300",
          )}
        >
          {bill.level}
        </span>
      </div>
      <p className="text-[13px] text-slate-100 leading-snug font-medium line-clamp-2">{bill.title}</p>
      <span className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-slate-500 group-hover:text-signal-bright transition-colors">
        Test on me <ArrowRight className="w-3 h-3" />
      </span>
    </button>
  );
}

// --- saved persona summary --------------------------------------------------

function PersonaSummary({
  persona,
  area,
  onEdit,
  onClear,
}: {
  persona: UserPersona;
  area: UserArea | null;
  onEdit: () => void;
  onClear: () => void;
}) {
  const chips: string[] = [
    persona.tenure === "owner" ? "Homeowner" : "Renter",
    roleShort([persona.role]),
    `${persona.householdSize}-person household`,
    `Age ${persona.age}`,
    `${fmtUSD(persona.income)}/yr`,
    `${fmtUSD(persona.monthlyHousingCost)}/mo housing`,
  ];
  if (persona.group) chips.push(persona.group);
  if (persona.nativity === "immigrant") chips.push("Immigrant");

  return (
    <div className="glass rounded-2xl overflow-hidden">
      <header className="px-5 py-4 border-b border-line flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-signal/15 flex items-center justify-center">
            <UserRound className="w-4 h-4 text-signal" />
          </div>
          <div>
            <h2 className="font-display text-base text-slate-50 leading-none">{persona.name?.trim() || "You"}</h2>
            <p className="eyebrow mt-1.5">{area ? area.label : "No location set"}</p>
          </div>
        </div>
        <button
          onClick={onEdit}
          className="flex items-center gap-1.5 text-[12px] text-slate-300 hover:text-signal-bright border border-line hover:border-signal/50 rounded-full px-3 py-1.5 transition-colors"
        >
          <Pencil className="w-3.5 h-3.5" /> Edit
        </button>
      </header>
      <div className="p-5">
        <div className="flex flex-wrap gap-2">
          {chips.map((c) => (
            <span key={c} className="text-[12px] text-slate-300 border border-line rounded-full px-2.5 py-1">
              {c}
            </span>
          ))}
        </div>
        <button onClick={onClear} className="mt-4 text-[11px] text-slate-500 hover:text-rose-400 transition-colors">
          Clear this persona
        </button>
      </div>
    </div>
  );
}

function PlaceholderPanel() {
  return (
    <div className="glass rounded-2xl grid-bg h-full min-h-[320px] flex flex-col items-center justify-center text-center p-8">
      <div className="w-12 h-12 rounded-2xl bg-signal/15 flex items-center justify-center mb-4">
        <Radar className="w-6 h-6 text-signal-bright" />
      </div>
      <h3 className="font-display text-lg text-slate-100">Build your persona to begin</h3>
      <p className="text-sm text-slate-400 mt-1.5 max-w-sm leading-relaxed">
        Tell us a little about your household and where you live. Then test the real bills moving near you against your
        own situation — no simulation required.
      </p>
    </div>
  );
}

// --- chrome -----------------------------------------------------------------

function Intro({ hasPersona }: { hasPersona: boolean }) {
  return (
    <div className="glass rounded-2xl px-5 py-4">
      <h2 className="font-display text-xl sm:text-2xl text-slate-100 leading-tight">
        Test policy on a twin of{" "}
        <span className="font-serif-editorial italic text-signal-bright">your own life.</span>
      </h2>
      <p className="text-sm text-slate-400 mt-1 max-w-2xl">
        {hasPersona
          ? "Pick a bill moving near you, or paste any policy, to see how it would land on your household."
          : "Save a private persona — it stays in your browser — then see how the bills near you would affect you specifically."}
      </p>
    </div>
  );
}

function Header() {
  return (
    <header className="relative border-b border-line backdrop-blur sticky top-0 z-30 bg-ink/80">
      <div className="max-w-[1400px] mx-auto px-4 lg:px-6 py-3 flex items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="relative w-9 h-9 overflow-hidden rounded-xl ring-1 ring-line shadow-[0_0_18px_rgba(110,139,255,0.28)] bg-surface">
            <Image
              src="/policypulse-icon.png"
              alt="PolicyPulse logo"
              width={54}
              height={54}
              priority
              className="absolute left-1/2 top-1/2 w-[54px] h-[54px] max-w-none -translate-x-1/2 -translate-y-1/2 object-cover"
            />
          </div>
          <div>
            <h1 className="font-display text-base font-semibold tracking-tight text-slate-50 leading-none">
              Policy<span className="text-signal-bright">Pulse</span>{" "}
              <span className="text-slate-600 font-normal">/ My Pulse</span>
            </h1>
            <p className="eyebrow mt-1.5">Policy, tested on you</p>
          </div>
        </Link>
        <div className="flex items-center gap-2.5">
          <NavPill href="/" icon={<MapIcon className="w-3.5 h-3.5" />} label="Pulse Map" />
          <NavPill href="/simulate" icon={<Radar className="w-3.5 h-3.5" />} label="Simulator" />
          <NavPill href="/lab" icon={<Layers className="w-3.5 h-3.5" />} label="Lab" />
          <NavPill href="/ghost" icon={<Ghost className="w-3.5 h-3.5" />} label="Ghost" />
          <NavPill href="/runs" icon={<FlaskRound className="w-3.5 h-3.5" />} label="Runs" />
          <ThemeToggle />
        </div>
      </div>
      <PulseLine width={2000} height={20} className="absolute inset-x-0 -bottom-px h-5 opacity-70" />
    </header>
  );
}

function NavPill({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="hidden sm:flex items-center gap-1.5 text-xs text-slate-300 hover:text-signal-bright border border-line hover:border-signal/50 rounded-full px-3 py-1.5 transition-colors"
    >
      {icon} {label}
    </Link>
  );
}
