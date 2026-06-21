"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, ExternalLink, Loader2, Mail, Send } from "lucide-react";
import type { Representative } from "@/lib/sources/representatives";
import type { Analysis } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  stateCode?: string;
  jurisdiction: string;
  billIdentifier: string;
  billTitle: string;
  analysis: Analysis;
}

interface Draft {
  subject: string;
  body: string;
  source: "llm" | "template";
}

export function ContactRep({ stateCode, jurisdiction, billIdentifier, billTitle, analysis }: Props) {
  const [reps, setReps] = useState<Representative[]>([]);
  const [repsState, setRepsState] = useState<"loading" | "ready" | "empty" | "missing_key">("loading");
  const [selectedId, setSelectedId] = useState<string>("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!stateCode) {
      setRepsState("empty");
      return;
    }
    let cancelled = false;
    setRepsState("loading");
    fetch(`/api/representatives?state=${stateCode}`)
      .then((r) => r.json())
      .then((data: { reps?: Representative[]; sources?: { federal?: string } }) => {
        if (cancelled) return;
        const list = data.reps ?? [];
        setReps(list);
        setSelectedId(list[0]?.id ?? "");
        if (list.length > 0) setRepsState("ready");
        else setRepsState(data.sources?.federal === "missing_key" ? "missing_key" : "empty");
      })
      .catch(() => !cancelled && setRepsState("empty"));
    return () => {
      cancelled = true;
    };
  }, [stateCode]);

  const selected = reps.find((r) => r.id === selectedId);

  const generate = useCallback(async () => {
    if (!selected) return;
    setDrafting(true);
    setDraft(null);
    setCopied(false);
    try {
      const res = await fetch("/api/draft-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repName: selected.name,
          repTitle: selected.title,
          billIdentifier,
          billTitle,
          jurisdiction,
          whoGetsHurt: analysis.whoGetsHurt,
          winners: analysis.winners,
          headline: analysis.headline,
        }),
      });
      const data = (await res.json()) as Draft;
      if (data.subject) setDraft(data);
    } finally {
      setDrafting(false);
    }
  }, [selected, billIdentifier, billTitle, jurisdiction, analysis]);

  const mailto = selected && draft
    ? `mailto:${selected.email ?? ""}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`
    : undefined;

  const copy = useCallback(async () => {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }, [draft]);

  return (
    <div className="glass rounded-2xl p-5 border-l-2 border-l-signal/60">
      <div className="flex items-center gap-2 mb-1.5">
        <Send className="w-4 h-4 text-signal" />
        <h2 className="eyebrow">Close the loop — email your representative</h2>
      </div>
      <p className="text-sm text-slate-400 leading-relaxed">
        You&apos;ve seen who this bill helps and hurts. Tell the people who vote on it. We&apos;ll draft a
        respectful constituent email citing <span className="text-slate-200 font-medium">{billIdentifier}</span> and
        these findings — you review and send.
      </p>

      {repsState === "loading" && (
        <p className="mt-4 text-xs text-slate-500 flex items-center gap-1.5">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Finding your representatives…
        </p>
      )}

      {repsState === "missing_key" && (
        <p className="mt-4 text-xs text-slate-500">
          Connect a <span className="font-data text-slate-400">CONGRESS_API_KEY</span> to look up your federal
          delegation.
        </p>
      )}

      {repsState === "empty" && (
        <p className="mt-4 text-xs text-slate-500">
          No representatives found for this area. Try running a bill from the Pulse Map so we know your state.
        </p>
      )}

      {repsState === "ready" && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[11px] text-slate-500">Send to</label>
            <select
              value={selectedId}
              onChange={(e) => {
                setSelectedId(e.target.value);
                setDraft(null);
              }}
              className="flex-1 min-w-[200px] bg-surface/60 border border-line rounded-lg px-3 py-1.5 text-[13px] text-slate-100 focus:outline-none focus:border-signal/50"
            >
              {reps.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title} {r.name}
                  {r.party ? ` (${r.party})` : ""}
                  {r.chamber === "House" && r.district ? ` — District ${r.district}` : ""}
                </option>
              ))}
            </select>
            <button
              onClick={generate}
              disabled={drafting}
              className="flex items-center gap-1.5 text-[12px] font-medium text-ink bg-signal hover:bg-signal-bright disabled:opacity-60 rounded-lg px-3 py-1.5 transition-colors"
            >
              {drafting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
              {draft ? "Redraft" : "Draft email"}
            </button>
          </div>

          {draft && selected && (
            <div className="rounded-xl border border-line bg-ink/40 p-3 space-y-2">
              <div className="text-[12px] text-slate-300">
                <span className="text-slate-500">Subject:</span> {draft.subject}
              </div>
              <textarea
                readOnly
                value={draft.body}
                rows={10}
                className="w-full bg-surface/40 border border-line rounded-lg p-2.5 text-[12px] text-slate-200 leading-relaxed resize-y focus:outline-none"
              />
              <div className="flex flex-wrap items-center gap-2">
                {selected.email ? (
                  <a
                    href={mailto}
                    className="flex items-center gap-1.5 text-[12px] font-medium text-ink bg-signal hover:bg-signal-bright rounded-lg px-3 py-1.5 transition-colors"
                  >
                    <Mail className="w-3.5 h-3.5" /> Open in email
                  </a>
                ) : selected.contactUrl ? (
                  <a
                    href={selected.contactUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 text-[12px] font-medium text-ink bg-signal hover:bg-signal-bright rounded-lg px-3 py-1.5 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Open contact form
                  </a>
                ) : null}
                <button
                  onClick={copy}
                  className="flex items-center gap-1.5 text-[12px] text-slate-300 hover:text-signal-bright border border-line rounded-lg px-3 py-1.5 transition-colors"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </button>
                {!selected.email && !selected.contactUrl && (
                  <span className="text-[11px] text-slate-500">
                    No public email or form listed — copy the draft and use their office contact page.
                  </span>
                )}
                <span className={cn("text-[10px] ml-auto", draft.source === "llm" ? "text-signal-bright" : "text-slate-500")}>
                  {draft.source === "llm" ? "AI-drafted" : "template draft"}
                </span>
              </div>
              <p className="text-[10px] text-slate-600 leading-relaxed">
                Review and edit before sending — this draft reflects a simulation, not a forecast.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
