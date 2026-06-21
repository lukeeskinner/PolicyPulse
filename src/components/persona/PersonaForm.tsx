"use client";

import { useCallback, useState } from "react";
import {
  AlertTriangle,
  Briefcase,
  Crosshair,
  Home,
  Loader2,
  MapPin,
  Save,
  Search,
  ShieldQuestion,
  UserRound,
} from "lucide-react";
import type { SourceState, UserArea } from "@/lib/civic";
import type { PersonaGroup, Role, Tenure, UserPersona } from "@/lib/types";
import { cn } from "@/lib/utils";

// A "primary role" is the user's main economic identity. Tenure (rent/own) is
// captured separately, so the role list omits the tenure-derived role keys.
const PRIMARY_ROLES: { value: Role; label: string }[] = [
  { value: "worker", label: "Employed / wage worker" },
  { value: "business_owner", label: "Business owner" },
  { value: "small_landlord", label: "Small landlord" },
  { value: "retiree", label: "Retired" },
  { value: "student", label: "Student" },
];

const GROUPS: PersonaGroup[] = ["Black", "Hispanic", "Asian", "White", "Other"];

interface Draft {
  name: string;
  age: string;
  householdSize: string;
  tenure: Tenure;
  role: Role;
  sector: string;
  income: string;
  monthlyHousingCost: string;
  savings: string;
  group: "" | PersonaGroup;
  nativity: "" | "native" | "immigrant";
}

function toDraft(p: UserPersona | null): Draft {
  return {
    name: p?.name ?? "",
    age: p ? String(p.age) : "35",
    householdSize: p ? String(p.householdSize) : "2",
    tenure: p?.tenure ?? "renter",
    role: p?.role ?? "worker",
    sector: p?.sector ?? "",
    income: p ? String(p.income) : "60000",
    monthlyHousingCost: p ? String(p.monthlyHousingCost) : "1800",
    savings: p?.savings != null ? String(p.savings) : "",
    group: p?.group ?? "",
    nativity: p?.nativity ?? "",
  };
}

function intIn(v: string, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

interface Props {
  initial: UserPersona | null;
  initialArea: UserArea | null;
  onSave: (persona: UserPersona, area: UserArea | null) => void;
}

export function PersonaForm({ initial, initialArea, onSave }: Props) {
  const [d, setD] = useState<Draft>(() => toDraft(initial));
  const [area, setArea] = useState<UserArea | null>(initialArea);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((prev) => ({ ...prev, [k]: v }));

  const incomeNum = Number(d.income);
  const valid = Number.isFinite(incomeNum) && incomeNum > 0;

  const submit = () => {
    if (!valid) return;
    const persona: UserPersona = {
      name: d.name.trim() || undefined,
      age: intIn(d.age, 16, 110, 35),
      householdSize: intIn(d.householdSize, 1, 15, 1),
      tenure: d.tenure,
      role: d.role,
      sector: d.sector.trim() || undefined,
      income: intIn(d.income, 0, 10_000_000, 0),
      monthlyHousingCost: intIn(d.monthlyHousingCost, 0, 200_000, 0),
      savings: d.savings.trim() ? intIn(d.savings, 0, 50_000_000, 0) : undefined,
      group: d.group || undefined,
      nativity: d.nativity || undefined,
    };
    onSave(persona, area);
  };

  return (
    <div className="glass rounded-2xl overflow-hidden">
      <header className="px-5 py-4 border-b border-line flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-signal/15 flex items-center justify-center">
          <UserRound className="w-4 h-4 text-signal" />
        </div>
        <div>
          <h2 className="font-display text-base text-slate-50 leading-none">Your persona</h2>
          <p className="eyebrow mt-1.5">Stays on this device</p>
        </div>
      </header>

      <div className="p-5 space-y-6">
        {/* About you ------------------------------------------------------- */}
        <Section icon={<UserRound className="w-3.5 h-3.5" />} title="About you">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name (optional)" className="col-span-2">
              <TextInput value={d.name} onChange={(v) => set("name", v)} placeholder="You" />
            </Field>
            <Field label="Age">
              <TextInput value={d.age} onChange={(v) => set("age", v)} inputMode="numeric" />
            </Field>
            <Field label="People in household">
              <TextInput value={d.householdSize} onChange={(v) => set("householdSize", v)} inputMode="numeric" />
            </Field>
          </div>
        </Section>

        {/* Your home ------------------------------------------------------- */}
        <Section icon={<Home className="w-3.5 h-3.5" />} title="Your home">
          <Field label="Do you rent or own?">
            <Segmented
              value={d.tenure}
              onChange={(v) => set("tenure", v)}
              options={[
                { value: "renter", label: "Rent" },
                { value: "owner", label: "Own" },
              ]}
            />
          </Field>
          <Field label={d.tenure === "owner" ? "Monthly mortgage / housing cost" : "Monthly rent"}>
            <TextInput value={d.monthlyHousingCost} onChange={(v) => set("monthlyHousingCost", v)} inputMode="numeric" prefix="$" />
          </Field>
          <Field label="Where you live">
            <LocationPicker area={area} onResolve={setArea} />
          </Field>
        </Section>

        {/* Work & money ---------------------------------------------------- */}
        <Section icon={<Briefcase className="w-3.5 h-3.5" />} title="Work & money">
          <Field label="What best describes you?">
            <SelectInput
              value={d.role}
              onChange={(v) => set("role", v as Role)}
              options={PRIMARY_ROLES.map((r) => ({ value: r.value, label: r.label }))}
            />
          </Field>
          {(d.role === "worker" || d.role === "business_owner") && (
            <Field label="Industry (optional)">
              <TextInput value={d.sector} onChange={(v) => set("sector", v)} placeholder="e.g. Healthcare, Retail, Construction" />
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Annual household income">
              <TextInput value={d.income} onChange={(v) => set("income", v)} inputMode="numeric" prefix="$" />
            </Field>
            <Field label="Savings (optional)">
              <TextInput value={d.savings} onChange={(v) => set("savings", v)} inputMode="numeric" prefix="$" placeholder="—" />
            </Field>
          </div>
        </Section>

        {/* Optional demographics ------------------------------------------ */}
        <Section icon={<ShieldQuestion className="w-3.5 h-3.5" />} title="Demographics — optional">
          <p className="text-[11px] text-slate-500 -mt-1 leading-relaxed">
            Only used so group-targeted and immigration policies apply to you. Leave as
            “Prefer not to say” to skip — it never leaves your device.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Race / ethnicity">
              <SelectInput
                value={d.group}
                onChange={(v) => set("group", v as Draft["group"])}
                options={[
                  { value: "", label: "Prefer not to say" },
                  ...GROUPS.map((g) => ({ value: g, label: g })),
                ]}
              />
            </Field>
            <Field label="Immigration status">
              <SelectInput
                value={d.nativity}
                onChange={(v) => set("nativity", v as Draft["nativity"])}
                options={[
                  { value: "", label: "Prefer not to say" },
                  { value: "native", label: "U.S.-born" },
                  { value: "immigrant", label: "Immigrant" },
                ]}
              />
            </Field>
          </div>
        </Section>
      </div>

      <footer className="px-5 py-4 border-t border-line flex items-center justify-between gap-3">
        {!valid ? (
          <p className="text-[11px] text-amber-300 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> Enter your annual income to continue
          </p>
        ) : (
          <p className="text-[11px] text-slate-500">{initial ? "Update your saved persona" : "Saved only in this browser"}</p>
        )}
        <button
          onClick={submit}
          disabled={!valid}
          className={cn(
            "flex items-center gap-1.5 text-sm font-medium rounded-xl px-4 py-2 transition-colors",
            valid
              ? "text-ink bg-signal hover:bg-signal-bright"
              : "text-slate-500 bg-surface-2 cursor-not-allowed",
          )}
        >
          <Save className="w-4 h-4" /> {initial ? "Save changes" : "Save persona"}
        </button>
      </footer>
    </div>
  );
}

// --- location ---------------------------------------------------------------

function LocationPicker({ area, onResolve }: { area: UserArea | null; onResolve: (a: UserArea | null) => void }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const resolve = useCallback(async (url: string) => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(url);
      const data = (await res.json()) as { area: UserArea | null; status: SourceState };
      if (data.area) onResolve(data.area);
      else setErr(data.status === "missing_key" ? "Location lookup isn’t configured." : "Couldn’t match that to a U.S. area.");
    } catch {
      setErr("Couldn’t look that up. Try again.");
    } finally {
      setBusy(false);
    }
  }, [onResolve]);

  const useMyLocation = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setErr("This browser can’t share your location — search instead.");
      return;
    }
    setBusy(true);
    setErr(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(`/api/geo?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}`),
      () => {
        setErr("Location unavailable — search by ZIP or city.");
        setBusy(false);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 },
    );
  };

  return (
    <div className="space-y-2">
      {area && (
        <div className="flex items-center gap-2 text-sm text-slate-200 rounded-lg border border-signal/30 bg-signal/5 px-3 py-1.5">
          <MapPin className="w-3.5 h-3.5 text-signal-bright shrink-0" />
          <span className="flex-1 truncate">{area.label}</span>
          <button onClick={() => onResolve(null)} className="text-[11px] text-slate-400 hover:text-slate-200">
            Change
          </button>
        </div>
      )}
      {!area && (
        <div className="flex items-center gap-1.5">
          <div className="search-pill flex-1 flex items-center gap-1.5 border border-line rounded-lg px-3 py-1.5 focus-within:border-signal/50 focus-within:ring-2 focus-within:ring-signal/40 transition-colors">
            <Search className="w-3.5 h-3.5 text-slate-500" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && q.trim() && resolve(`/api/geo?q=${encodeURIComponent(q.trim())}`)}
              placeholder="ZIP or city"
              className="bg-transparent text-sm text-slate-100 placeholder:text-slate-500 outline-none flex-1 w-full"
            />
            {busy ? (
              <Loader2 className="w-3.5 h-3.5 text-signal-bright animate-spin" />
            ) : (
              <button
                onClick={() => q.trim() && resolve(`/api/geo?q=${encodeURIComponent(q.trim())}`)}
                className="text-[11px] text-ink bg-signal hover:bg-signal-bright rounded px-2 py-1 font-medium transition-colors"
              >
                Go
              </button>
            )}
          </div>
          <button
            onClick={useMyLocation}
            title="Use my location"
            className="flex items-center justify-center w-9 h-9 border border-line hover:border-signal/50 rounded-lg text-slate-300 hover:text-signal-bright transition-colors"
          >
            <Crosshair className="w-4 h-4" />
          </button>
        </div>
      )}
      {err && (
        <p className="text-[11px] text-amber-300 flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {err}
        </p>
      )}
    </div>
  );
}

// --- small inputs -----------------------------------------------------------

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-1.5 text-signal">
        {icon}
        <span className="eyebrow text-slate-400">{title}</span>
      </div>
      {children}
    </section>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="text-[12px] text-slate-400">{label}</span>
      {children}
    </label>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  inputMode,
  prefix,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  inputMode?: "numeric" | "text";
  prefix?: string;
}) {
  return (
    <div className="flex items-center gap-1.5 border border-line rounded-lg px-3 py-2 bg-surface/40 focus-within:border-signal/50 focus-within:ring-2 focus-within:ring-signal/40 transition-colors">
      {prefix && <span className="text-slate-500 text-sm font-data">{prefix}</span>}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        className="bg-transparent text-sm text-slate-100 placeholder:text-slate-500 outline-none flex-1 w-full"
      />
    </div>
  );
}

function SelectInput<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="border border-line rounded-lg bg-surface/40 focus-within:border-signal/50 focus-within:ring-2 focus-within:ring-signal/40 transition-colors">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="w-full bg-transparent text-sm text-slate-100 outline-none px-3 py-2 appearance-none cursor-pointer"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-surface text-slate-100">
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-lg border border-line p-0.5 bg-surface/40">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "px-4 py-1.5 text-sm rounded-md transition-colors",
            value === o.value ? "bg-signal text-ink font-medium" : "text-slate-400 hover:text-slate-200",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
