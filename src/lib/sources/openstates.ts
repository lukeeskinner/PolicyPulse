import type { Bill } from "../civic";
import { stateByAbbr } from "../states";

// ============================================================================
// Real state-legislature bills from the OpenStates v3 API.
// Pulls the most recently active bills for the user's state, including primary
// sponsor. Free tier is rate-limited, so callers cache aggressively.
// ============================================================================

const BASE = "https://v3.openstates.org";

function key(): string {
  return process.env.OPENSTATES_API_KEY || "";
}

export function openStatesConfigured(): boolean {
  return !!key();
}

function partyAbbr(party?: string): string | undefined {
  if (!party) return undefined;
  const p = party.toLowerCase();
  if (p.startsWith("democ")) return "D";
  if (p.startsWith("repub")) return "R";
  if (p.startsWith("indep")) return "I";
  return party[0]?.toUpperCase();
}

export async function fetchStateBills(stateCode: string, limit = 14): Promise<Bill[]> {
  const k = key();
  if (!k) return [];
  const info = stateByAbbr(stateCode);
  if (!info) return [];

  const url =
    `${BASE}/bills?jurisdiction=${encodeURIComponent(info.name)}` +
    `&sort=latest_action_desc&per_page=${limit}&include=sponsorships`;

  let data: { results?: Array<Record<string, unknown>> } | null = null;
  try {
    const res = await fetch(url, {
      headers: { "X-API-KEY": k },
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) return [];
    data = await res.json();
  } catch {
    return [];
  }

  const results = data?.results ?? [];
  return results.map((r) => {
    const sponsorships = (r.sponsorships as Array<Record<string, unknown>>) ?? [];
    const primary =
      sponsorships.find((s) => s.primary) ?? sponsorships[0];
    const subjects = (r.subject as string[]) ?? [];
    return {
      id: `st-${String(r.id ?? r.identifier)}`,
      level: "state" as const,
      identifier: String(r.identifier ?? "Bill"),
      title: String(r.title ?? "(untitled bill)"),
      status: r.latest_action_description ? String(r.latest_action_description) : undefined,
      latestAction: r.latest_action_description ? String(r.latest_action_description) : undefined,
      latestActionDate: r.latest_action_date ? String(r.latest_action_date) : undefined,
      url: r.openstates_url ? String(r.openstates_url) : undefined,
      sponsor: primary?.name ? String(primary.name) : undefined,
      sponsorParty: partyAbbr(primary?.party as string | undefined),
      jurisdiction: info.name,
      stateCode: info.abbr,
      subjects: subjects.slice(0, 4),
      updatedAt: r.updated_at ? String(r.updated_at) : undefined,
    };
  });
}
