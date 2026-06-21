import { stateByAbbr } from "../states";

// ============================================================================
// Real elected representatives for a user's area, used by the "Email your
// representative" feature.
//
// Federal members come from the Congress.gov API (v3) — the same source the
// Pulse Map uses for the state delegation. We list the current delegation,
// then enrich each member with their official contact page + district.
//
// State legislators (OpenStates) are added in a later pass.
//
// Graceful degradation: no key -> empty list (the UI shows an honest empty
// state); any upstream failure -> empty list, never invented contacts.
// ============================================================================

const CONGRESS_BASE = "https://api.congress.gov/v3";

export type RepLevel = "federal";
export type RepChamber = "Senate" | "House";

export interface Representative {
  id: string; // bioguideId (federal)
  level: RepLevel;
  name: string;
  party?: string; // "D" | "R" | "I"
  stateCode: string;
  chamber?: RepChamber;
  district?: string; // House district number, when applicable
  title: string; // "U.S. Senator" / "U.S. Representative"
  // Most legislators publish a contact webform rather than a raw email, so we
  // surface the official site and let the UI link to it when email is absent.
  email?: string;
  contactUrl?: string;
  phone?: string;
}

function congressKey(): string {
  return process.env.CONGRESS_API_KEY || "";
}

export function federalRepsConfigured(): boolean {
  return !!congressKey();
}

export function representativesConfigured(): boolean {
  return federalRepsConfigured();
}

function partyAbbr(party?: string): string | undefined {
  const p = (party ?? "").toLowerCase();
  if (p.startsWith("democ")) return "D";
  if (p.startsWith("repub")) return "R";
  if (p.startsWith("indep")) return "I";
  return party?.[0]?.toUpperCase();
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

interface RawMember {
  bioguideId: string;
  name: string;
  party: string;
}

async function fetchDelegation(stateCode: string, k: string): Promise<RawMember[]> {
  const url = `${CONGRESS_BASE}/member/${stateCode}?currentMember=true&limit=25&format=json&api_key=${k}`;
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

// Enrich a delegation member with chamber/district + official contact site.
async function enrichMember(m: RawMember, stateCode: string, k: string): Promise<Representative> {
  const url = `${CONGRESS_BASE}/member/${m.bioguideId}?format=json&api_key=${k}`;
  const data = await getJson(url);
  const detail = (data?.member as Record<string, unknown>) ?? {};

  const terms = (detail.terms as Array<Record<string, unknown>>) ?? [];
  const latest = terms.length ? terms[terms.length - 1] : undefined;
  const rawChamber = String(latest?.chamber ?? "");
  const chamber: RepChamber | undefined = rawChamber.toLowerCase().includes("senate")
    ? "Senate"
    : rawChamber.toLowerCase().includes("house")
      ? "House"
      : undefined;

  const districtNum = detail.district;
  const district =
    districtNum != null && String(districtNum) !== "0" ? String(districtNum) : undefined;

  const addr = (detail.addressInformation as Record<string, unknown>) ?? {};
  const contactUrl = detail.officialWebsiteUrl ? String(detail.officialWebsiteUrl) : undefined;
  const phone = addr.phoneNumber ? String(addr.phoneNumber) : undefined;

  const title =
    chamber === "Senate"
      ? "U.S. Senator"
      : chamber === "House"
        ? "U.S. Representative"
        : "Member of Congress";

  return {
    id: m.bioguideId,
    level: "federal",
    name: cleanName(m.name),
    party: partyAbbr(m.party),
    stateCode,
    chamber,
    district,
    title,
    contactUrl,
    phone,
  };
}

export async function fetchFederalReps(stateCode: string): Promise<Representative[]> {
  const k = congressKey();
  if (!k) return [];
  if (!stateByAbbr(stateCode)) return [];

  const delegation = await fetchDelegation(stateCode, k);
  if (delegation.length === 0) return [];

  const reps = await Promise.all(delegation.map((m) => enrichMember(m, stateCode, k)));

  // Senators first (statewide), then House members; stable by name within group.
  const rank = (c?: RepChamber) => (c === "Senate" ? 0 : c === "House" ? 1 : 2);
  return reps.sort((a, b) => rank(a.chamber) - rank(b.chamber) || a.name.localeCompare(b.name));
}

export async function fetchRepresentatives(stateCode: string): Promise<Representative[]> {
  return fetchFederalReps(stateCode.toUpperCase());
}
