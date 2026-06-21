"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Dices, FlaskRound, GitCompareArrows, Layers, Loader2, Map as MapIcon, Play, SlidersHorizontal } from "lucide-react";
import { PulseLine } from "@/components/Brand";
import { CompareView } from "@/components/lab/CompareView";
import { MonteCarloView } from "@/components/lab/MonteCarloView";
import { SensitivityView } from "@/components/lab/SensitivityView";
import type { CompareResult, MonteCarloResult, SensitivityResult, SweepParam } from "@/lib/types";
import { JURISDICTIONS, PRESETS } from "@/lib/ui";
import { cn } from "@/lib/utils";

type Tab = "montecarlo" | "compare" | "sensitivity";

const TABS: { id: Tab; label: string; icon: React.ReactNode; blurb: string }[] = [
  { id: "montecarlo", label: "Monte Carlo", icon: <Dices className="w-4 h-4" />, blurb: "Confidence bands from many runs" },
  { id: "compare", label: "Compare", icon: <GitCompareArrows className="w-4 h-4" />, blurb: "Two policies, head-to-head" },
  { id: "sensitivity", label: "Sensitivity", icon: <SlidersHorizontal className="w-4 h-4" />, blurb: "Which assumptions matter" },
];

const SWEEP_PARAMS: { value: string; label: string }[] = [
  { value: "auto", label: "Auto (policy default)" },
  { value: "intensity", label: "Policy intensity" },
  { value: "supplyElasticity", label: "Supply elasticity" },
  { value: "rentCapPct", label: "Rent-increase cap" },
  { value: "wageTarget", label: "Minimum-wage target" },
  { value: "marketRentGrowthPct", label: "Market rent growth" },
];

export default function LabPage() {
  return (
    <Suspense fallback={null}>
      <Lab />
    </Suspense>
  );
}

function Lab() {
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>("montecarlo");

  const [policy, setPolicy] = useState(params.get("policy") ?? PRESETS[0].policy);
  const [jurisdiction, setJurisdiction] = useState(params.get("jurisdiction") ?? params.get("label") ?? PRESETS[0].jurisdiction);
  const [stateCode, setStateCode] = useState(params.get("state") ?? "");
  const [agentCount, setAgentCount] = useState(60);

  // tab-specific controls
  const [draws, setDraws] = useState(40);
  const [policyB, setPolicyB] = useState("");
  const [vsStatusQuo, setVsStatusQuo] = useState(true);
  const [labelA, setLabelA] = useState("Policy A");
  const [labelB, setLabelB] = useState("Policy B");
  const [cmpDraws, setCmpDraws] = useState(24);
  const [param, setParam] = useState("auto");
  const [drawsPerPoint, setDrawsPerPoint] = useState(10);

  // results
  const [mc, setMc] = useState<MonteCarloResult | null>(null);
  const [cmp, setCmp] = useState<CompareResult | null>(null);
  const [sens, setSens] = useState<SensitivityResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Recharts' ResponsiveContainer can measure a 0-width parent if it mounts
  // before layout settles (e.g. just after results arrive or a tab switch),
  // leaving the chart collapsed in the corner. A resize event forces it to
  // re-measure on the next frame.
  useEffect(() => {
    if (loading) return;
    const id = requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    return () => cancelAnimationFrame(id);
  }, [loading, tab, mc, cmp, sens]);

  const base = () => ({ policy, jurisdiction, agentCount, stateCode: stateCode || undefined });

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      if (tab === "montecarlo") {
        const res = await post("/api/montecarlo", { ...base(), draws });
        setMc(res as MonteCarloResult);
      } else if (tab === "compare") {
        const res = await post("/api/compare", {
          ...base(),
          policyA: policy,
          policyB: vsStatusQuo ? "" : policyB,
          draws: cmpDraws,
          labelA,
          labelB,
        });
        setCmp(res as CompareResult);
      } else {
        const res = await post("/api/sensitivity", {
          ...base(),
          drawsPerPoint,
          param: param === "auto" ? undefined : (param as SweepParam),
        });
        setSens(res as SensitivityResult);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const runDisabled = loading || policy.trim().length < 8 || (tab === "compare" && !vsStatusQuo && policyB.trim().length < 8);
  const runLabel = tab === "montecarlo" ? "Run Monte Carlo" : tab === "compare" ? "Run comparison" : "Run sweep";
  const result = tab === "montecarlo" ? mc : tab === "compare" ? cmp : sens;

  return (
    <div className="min-h-screen">
      <header className="relative border-b border-line backdrop-blur sticky top-0 z-30 bg-ink/80">
        <div className="max-w-[1500px] mx-auto px-4 lg:px-6 py-3 flex items-center justify-between">
          <Link href="/simulate" className="flex items-center gap-2 text-sm text-slate-300 hover:text-signal-bright transition-colors">
            <ArrowLeft className="w-4 h-4" /> Simulator
          </Link>
          <div className="flex items-center gap-2 text-slate-200">
            <Layers className="w-4 h-4 text-signal" />
            <span className="font-display text-sm font-semibold text-slate-100">Policy Lab</span>
          </div>
          <div className="flex items-center gap-2">
            <NavPill href="/" icon={<MapIcon className="w-3.5 h-3.5" />} label="Map" />
            <NavPill href="/runs" icon={<FlaskRound className="w-3.5 h-3.5" />} label="Runs" />
          </div>
        </div>
        <PulseLine width={2000} height={20} className="absolute inset-x-0 -bottom-px h-5 opacity-70" />
      </header>

      <main className="max-w-[1500px] mx-auto px-4 lg:px-6 py-4 pb-20">
        {/* tab bar */}
        <div className="flex flex-wrap gap-2 mb-4">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium border transition-colors",
                tab === t.id
                  ? "border-signal/50 bg-signal/10 text-signal-bright"
                  : "border-line text-slate-300 hover:text-white hover:border-slate-500",
              )}
            >
              {t.icon}
              <span>{t.label}</span>
              <span className="hidden sm:inline text-[11px] text-slate-500 font-normal">· {t.blurb}</span>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-12 gap-4">
          {/* controls */}
          <div className="col-span-12 lg:col-span-3 space-y-4">
            <div className="glass rounded-2xl p-5 space-y-4">
              <Field label={tab === "compare" ? "Policy A — paste a bill or describe it" : "Paste a bill or describe a policy"}>
                <textarea
                  value={policy}
                  onChange={(e) => setPolicy(e.target.value)}
                  rows={4}
                  className="w-full resize-none rounded-xl bg-ink/60 border border-line px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-signal/40 focus:border-signal/50"
                />
              </Field>

              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => { setPolicy(p.policy); setJurisdiction(p.jurisdiction); setStateCode(""); }}
                    className="text-[11px] px-2.5 py-1 rounded-full border border-line text-slate-300 hover:border-signal/60 hover:text-signal-bright transition-colors"
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <Field label="Jurisdiction">
                <input
                  list="lab-jurisdictions"
                  value={jurisdiction}
                  onChange={(e) => { setJurisdiction(e.target.value); setStateCode(""); }}
                  className="w-full rounded-lg bg-ink/60 border border-line px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-signal/40 focus:border-signal/50"
                />
                <datalist id="lab-jurisdictions">
                  {JURISDICTIONS.map((j) => <option key={j} value={j} />)}
                </datalist>
              </Field>

              <Field label={<>Residents per run: <span className="font-data text-signal-bright font-semibold">{agentCount}</span></>}>
                <input type="range" min={20} max={100} step={10} value={agentCount} onChange={(e) => setAgentCount(Number(e.target.value))} className="w-full accent-signal" />
              </Field>

              {/* tab-specific controls */}
              {tab === "montecarlo" && (
                <Field label={<>Draws: <span className="font-data text-signal-bright font-semibold">{draws}</span></>}>
                  <input type="range" min={10} max={100} step={10} value={draws} onChange={(e) => setDraws(Number(e.target.value))} className="w-full accent-signal" />
                </Field>
              )}

              {tab === "compare" && (
                <div className="space-y-3 border-t border-line pt-3">
                  <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                    <input type="checkbox" checked={vsStatusQuo} onChange={(e) => setVsStatusQuo(e.target.checked)} className="accent-signal" />
                    Compare against the status-quo (no policy)
                  </label>
                  {!vsStatusQuo && (
                    <Field label="Policy B — the alternative">
                      <textarea
                        value={policyB}
                        onChange={(e) => setPolicyB(e.target.value)}
                        rows={3}
                        placeholder="e.g. Cap rent increases at 7% instead of 3%…"
                        className="w-full resize-none rounded-xl bg-ink/60 border border-line px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-signal/40 focus:border-signal/50"
                      />
                    </Field>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Label A"><input value={labelA} onChange={(e) => setLabelA(e.target.value)} className="w-full rounded-lg bg-ink/60 border border-line px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-signal/40" /></Field>
                    {!vsStatusQuo && <Field label="Label B"><input value={labelB} onChange={(e) => setLabelB(e.target.value)} className="w-full rounded-lg bg-ink/60 border border-line px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-signal/40" /></Field>}
                  </div>
                  <Field label={<>Paired draws each: <span className="font-data text-signal-bright font-semibold">{cmpDraws}</span></>}>
                    <input type="range" min={8} max={48} step={4} value={cmpDraws} onChange={(e) => setCmpDraws(Number(e.target.value))} className="w-full accent-signal" />
                  </Field>
                </div>
              )}

              {tab === "sensitivity" && (
                <div className="space-y-3 border-t border-line pt-3">
                  <Field label="Parameter to sweep">
                    <select value={param} onChange={(e) => setParam(e.target.value)} className="w-full rounded-lg bg-ink/60 border border-line px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-signal/40">
                      {SWEEP_PARAMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                  </Field>
                  <Field label={<>Draws per point: <span className="font-data text-signal-bright font-semibold">{drawsPerPoint}</span></>}>
                    <input type="range" min={4} max={24} step={2} value={drawsPerPoint} onChange={(e) => setDrawsPerPoint(Number(e.target.value))} className="w-full accent-signal" />
                  </Field>
                </div>
              )}

              <button
                onClick={run}
                disabled={runDisabled}
                className={cn(
                  "w-full flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all",
                  loading ? "bg-surface-2 text-slate-400 cursor-wait" : "bg-signal text-ink hover:bg-signal-bright hover:shadow-[0_0_24px_rgba(110,139,255,0.3)] disabled:opacity-50",
                )}
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                {loading ? "Running…" : runLabel}
              </button>
              {error && <p className="text-[12px] text-rose-400">{error}</p>}
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Ingestion &amp; policy analysis run once; the engine then re-runs many times. Larger draw counts are more stable but slower.
              </p>
            </div>
          </div>

          {/* results */}
          <div className="col-span-12 lg:col-span-9">
            {loading ? (
              <LoadingState tab={tab} />
            ) : result ? (
              tab === "montecarlo" && mc ? <MonteCarloView result={mc} />
                : tab === "compare" && cmp ? <CompareView result={cmp} />
                : tab === "sensitivity" && sens ? <SensitivityView result={sens} />
                : <EmptyState tab={tab} />
            ) : (
              <EmptyState tab={tab} />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function post(url: string, body: unknown): Promise<unknown> {
  return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => {
    const data = await r.json();
    if (!r.ok) throw new Error(data?.error || "Request failed");
    return data;
  });
}

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function NavPill({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link href={href} className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-signal-bright border border-line hover:border-signal/50 rounded-full px-3 py-1.5 transition-colors">
      {icon} {label}
    </Link>
  );
}

function LoadingState({ tab }: { tab: Tab }) {
  const msg = tab === "montecarlo" ? "Rolling the dice across many populations…" : tab === "compare" ? "Running both policies on matched populations…" : "Sweeping the assumptions…";
  return (
    <div className="glass rounded-2xl p-10 grid-bg min-h-[420px] flex flex-col items-center justify-center text-center">
      <Loader2 className="w-7 h-7 text-signal animate-spin mb-3" />
      <p className="text-slate-200 font-medium">{msg}</p>
      <p className="text-sm text-slate-500 mt-1">Ingesting the community and analyzing the policy, then re-running the engine.</p>
    </div>
  );
}

function EmptyState({ tab }: { tab: Tab }) {
  const t = TABS.find((x) => x.id === tab)!;
  return (
    <div className="glass rounded-2xl p-10 grid-bg min-h-[420px] flex flex-col justify-center">
      <span className="eyebrow mb-3">{t.label}</span>
      <h2 className="font-display text-2xl font-semibold text-slate-100 leading-tight max-w-lg">
        {tab === "montecarlo" && <>One run is an anecdote. <span className="font-serif-editorial italic text-signal-bright">Many runs are evidence.</span></>}
        {tab === "compare" && <>Every policy has an alternative. <span className="font-serif-editorial italic text-signal-bright">See the tradeoff.</span></>}
        {tab === "sensitivity" && <>Conclusions rest on assumptions. <span className="font-serif-editorial italic text-signal-bright">Find the load-bearing ones.</span></>}
      </h2>
      <p className="text-sm text-slate-400 mt-3 max-w-xl leading-relaxed">
        {tab === "montecarlo" && "Re-run the same policy across dozens of seeded populations to turn each point estimate into a distribution with 10th–90th percentile bands."}
        {tab === "compare" && "Pit two policies (or a policy against the status quo) on identical populations and read off exactly who wins and who loses under each."}
        {tab === "sensitivity" && "Sweep a model parameter and rank every tunable assumption by how much it moves the displacement outcome."}
      </p>
      <p className="text-[11px] text-slate-500 mt-5">Set up the policy on the left, then run →</p>
    </div>
  );
}
