import type { Bill } from "../civic";

// ============================================================================
// Real federal bills from the Congress.gov API (v3).
//
// "Federal bills near you" = legislation sponsored by your state's current
// congressional delegation. We list the delegation, pull each member's most
// recent sponsored measures in parallel, then dedupe + sort by latest action.
// ============================================================================

const BASE = "https://api.congress.gov/v3";

function key(): string {
  return process.env.CONGRESS_API_KEY || "";
}

export function congressConfigured(): boolean {
  return !!key();
}

const BILL_TYPES = new Set([
  "HR", "S", "HJRES", "SJRES", "HCONRES", "SCONRES", "HRES", "SRES",
]);

const PRETTY: Record<string, string> = {
  HR: "H.R.", S: "S.", HJRES: "H.J.Res.", SJRES: "S.J.Res.",
  HCONRES: "H.Con.Res.", SCONRES: "S.Con.Res.", HRES: "H.Res.", SRES: "S.Res.",
};

const URL_PATH: Record<string, string> = {
  HR: "house-bill", S: "senate-bill", HJRES: "house-joint-resolution",
  SJRES: "senate-joint-resolution", HCONRES: "house-concurrent-resolution",
  SCONRES: "senate-concurrent-resolution", HRES: "house-resolution", SRES: "senate-resolution",
};

interface Member {
  bioguideId: string;
  name: string;
  party: string;
}

function partyAbbr(party?: string): string {
  const p = (party ?? "").toLowerCase();
  if (p.startsWith("democ")) return "D";
  if (p.startsWith("repub")) return "R";
  if (p.startsWith("indep")) return "I";
  return party?.[0]?.toUpperCase() ?? "";
}

function cleanName(name?: string): string {
  if (!name) return "";
  // Congress returns "Last, First" — flip to "First Last".
  const m = name.match(/^([^,]+),\s*(.+)$/);
  return m ? `${m[2].trim()} ${m[1].trim()}` : name;
}

async function getJson(url: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(9000) });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function fetchDelegation(stateCode: string, k: string): Promise<Member[]> {
  const url = `${BASE}/member/${stateCode}?currentMember=true&limit=25&format=json&api_key=${k}`;
  const data = await getJson(url);
  const members = (data?.members as Array<Record<string, unknown>>) ?? [];
  return members
    .map((m) => ({
      bioguideId: String(m.bioguideId ?? ""),
      name: String(m.name ?? ""),
      party: String(m.partyName ?? m.party ?? ""),
    }))
    .filter((m) => m.bioguideId);
}

async function fetchSponsored(m: Member, stateCode: string, k: string): Promise<Bill[]> {
  const url = `${BASE}/member/${m.bioguideId}/sponsored-legislation?limit=5&format=json&api_key=${k}`;
  const data = await getJson(url);
  const items = (data?.sponsoredLegislation as Array<Record<string, unknown>>) ?? [];
  const out: Bill[] = [];
  for (const item of items) {
    const type = String(item.type ?? "").toUpperCase();
    const number = item.number != null ? String(item.number) : "";
    if (!BILL_TYPES.has(type) || !number) continue; // skip amendments / malformed
    const congress = Number(item.congress) || 0;
    const latest = (item.latestAction as Record<string, unknown>) ?? {};
    const policy = (item.policyArea as Record<string, unknown>) ?? {};
    out.push({
      id: `fed-${congress}-${type}-${number}`,
      level: "federal",
      identifier: `${PRETTY[type] ?? type} ${number}`,
      title: String(item.title ?? "(untitled measure)"),
      status: latest.text ? String(latest.text) : undefined,
      latestAction: latest.text ? String(latest.text) : undefined,
      latestActionDate: latest.actionDate ? String(latest.actionDate) : undefined,
      url: `https://www.congress.gov/bill/${congress}th-congress/${URL_PATH[type] ?? "house-bill"}/${number}`,
      sponsor: cleanName(m.name),
      sponsorParty: partyAbbr(m.party),
      chamber: type.startsWith("S") ? "Senate" : "House",
      jurisdiction: "United States",
      stateCode,
      subjects: policy.name ? [String(policy.name)] : [],
      updatedAt: item.updateDate ? String(item.updateDate) : undefined,
    });
  }
  return out;
}

export async function fetchFederalBills(stateCode: string, limit = 12): Promise<Bill[]> {
  const k = key();
  if (!k) return [];
  const delegation = await fetchDelegation(stateCode, k);
  if (delegation.length === 0) return [];

  // Prioritize a manageable subset (senators tend to sponsor higher-profile bills).
  const subset = delegation.slice(0, 8);
  const lists = await Promise.all(subset.map((m) => fetchSponsored(m, stateCode, k)));

  const seen = new Set<string>();
  const all = lists
    .flat()
    .sort((a, b) => (b.latestActionDate ?? "").localeCompare(a.latestActionDate ?? ""));

  const out: Bill[] = [];
  for (const b of all) {
    if (seen.has(b.id)) continue;
    seen.add(b.id);
    out.push(b);
    if (out.length >= limit) break;
  }
  return out;
}
