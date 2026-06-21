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
const OPENSTATES_BASE = "https://v3.openstates.org";

export type RepLevel = "federal" | "state";
export type RepChamber = "Senate" | "House";

export interface Representative {
  id: string; // bioguideId (federal) / ocd-person id (state)
  level: RepLevel;
  name: string;
  party?: string; // "D" | "R" | "I"
  stateCode: string;
  chamber?: RepChamber;
  district?: string; // district number, when applicable
  title: string; // "U.S. Senator" / "State Senator" / "Assemblymember" ...
  // Federal members publish a contact webform (no raw email); many state
  // legislators expose a real, mailable email. `mailable` flags the latter so
  // the UI can offer a prefilled mailto: vs. an "open contact form" fallback.
  email?: string;
  mailable: boolean;
  contactUrl?: string;
  phone?: string;
}

export interface RepLookupOpts {
  lat?: number;
  lng?: number;
}

function congressKey(): string {
  return process.env.CONGRESS_API_KEY || "";
}

function openStatesKey(): string {
  return process.env.OPENSTATES_API_KEY || "";
}

export function federalRepsConfigured(): boolean {
  return !!congressKey();
}

export function stateRepsConfigured(): boolean {
  return !!openStatesKey();
}

export function representativesConfigured(): boolean {
  return federalRepsConfigured() || stateRepsConfigured();
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
  chamber?: RepChamber;
  district?: string;
}

function chamberFromString(raw?: string): RepChamber | undefined {
  const c = (raw ?? "").toLowerCase();
  if (c.includes("senate")) return "Senate";
  if (c.includes("house")) return "House";
  return undefined;
}

// The member-list endpoint already carries each member's current chamber and
// district (under terms.item), so we read those directly and only hit the
// per-member detail endpoint for the official contact site. The full current
// delegation can exceed 50 (CA), so we request a high page size.
async function fetchDelegation(stateCode: string, k: string): Promise<RawMember[]> {
  const url = `${CONGRESS_BASE}/member/${stateCode}?currentMember=true&limit=250&format=json&api_key=${k}`;
  const data = await getJson(url);
  const members = (data?.members as Array<Record<string, unknown>>) ?? [];
  return members
    .map((m) => {
      const termItems =
        ((m.terms as Record<string, unknown>)?.item as Array<Record<string, unknown>>) ?? [];
      const latest = termItems.length ? termItems[termItems.length - 1] : undefined;
      const districtNum = m.district;
      return {
        bioguideId: String(m.bioguideId ?? ""),
        name: String(m.name ?? ""),
        party: String(m.partyName ?? m.party ?? ""),
        chamber: chamberFromString(latest?.chamber as string | undefined),
        district:
          districtNum != null && String(districtNum) !== "0" ? String(districtNum) : undefined,
      };
    })
    .filter((m) => m.bioguideId);
}

// Enrich a delegation member with their official contact site + phone.
async function enrichMember(m: RawMember, stateCode: string, k: string): Promise<Representative> {
  const url = `${CONGRESS_BASE}/member/${m.bioguideId}?format=json&api_key=${k}`;
  const data = await getJson(url);
  const detail = (data?.member as Record<string, unknown>) ?? {};

  const addr = (detail.addressInformation as Record<string, unknown>) ?? {};
  const contactUrl = detail.officialWebsiteUrl ? String(detail.officialWebsiteUrl) : undefined;
  const phone = addr.phoneNumber ? String(addr.phoneNumber) : undefined;

  const title =
    m.chamber === "Senate"
      ? "U.S. Senator"
      : m.chamber === "House"
        ? "U.S. Representative"
        : "Member of Congress";

  return {
    id: m.bioguideId,
    level: "federal",
    name: cleanName(m.name),
    party: partyAbbr(m.party),
    stateCode,
    chamber: m.chamber,
    district: m.district,
    title,
    // Federal members publish webforms, not raw emails.
    mailable: false,
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

// ----------------------------------------------------------------------------
// State legislators (OpenStates v3)
// ----------------------------------------------------------------------------

async function getOpenStatesJson(url: string, k: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, {
      headers: { "X-API-KEY": k },
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function stateChamber(orgClassification?: string): RepChamber | undefined {
  // OpenStates uses upper/lower for state chambers.
  if (orgClassification === "upper") return "Senate";
  if (orgClassification === "lower") return "House";
  return undefined;
}

function mapStatePerson(p: Record<string, unknown>, stateCode: string): Representative | null {
  const id = String(p.id ?? "");
  const name = String(p.name ?? "").trim();
  if (!id || !name) return null;

  const role = (p.current_role as Record<string, unknown>) ?? {};
  const roleTitle = String(role.title ?? "").trim(); // "Senator" / "Assemblymember" / "Representative"
  const chamber = stateChamber(role.org_classification as string | undefined);
  const district = role.district != null && String(role.district) !== "" ? String(role.district) : undefined;

  // OpenStates puts a real email OR sometimes a contact URL in `email`.
  const rawEmail = typeof p.email === "string" ? p.email.trim() : "";
  const isMail = rawEmail.includes("@");
  const email = isMail ? rawEmail : undefined;
  const contactUrl =
    (!isMail && rawEmail.startsWith("http") ? rawEmail : undefined) ??
    (p.openstates_url ? String(p.openstates_url) : undefined);

  // First office phone, capitol preferred.
  const offices = (p.offices as Array<Record<string, unknown>>) ?? [];
  const office =
    offices.find((o) => o.classification === "capitol" && o.voice) ?? offices.find((o) => o.voice);
  const phone = office?.voice ? String(office.voice) : undefined;

  const title = roleTitle
    ? roleTitle === "Senator"
      ? "State Senator"
      : roleTitle
    : chamber === "Senate"
      ? "State Senator"
      : "State Representative";

  return {
    id,
    level: "state",
    name,
    party: partyAbbr(String(p.party ?? "")),
    stateCode,
    chamber,
    district,
    title,
    email,
    mailable: !!email,
    contactUrl,
    phone,
  };
}

// Look up the user's state legislators. Precise when lat/lng are supplied
// (OpenStates geo returns just the resident's districts); otherwise empty,
// since a whole-chamber roster isn't a useful "email your rep" affordance.
export async function fetchStateReps(
  stateCode: string,
  opts: RepLookupOpts = {},
): Promise<Representative[]> {
  const k = openStatesKey();
  if (!k) return [];
  const info = stateByAbbr(stateCode);
  if (!info) return [];
  if (opts.lat == null || opts.lng == null) return [];

  const url = `${OPENSTATES_BASE}/people.geo?lat=${opts.lat}&lng=${opts.lng}&include=offices`;
  const data = await getOpenStatesJson(url, k);
  const results = (data?.results as Array<Record<string, unknown>>) ?? [];

  const reps = results
    // Keep only state-level legislators (geo also returns federal members).
    .filter((p) => (p.jurisdiction as Record<string, unknown>)?.classification === "state")
    .map((p) => mapStatePerson(p, stateCode))
    .filter((r): r is Representative => r !== null);

  // Senate (upper) first, then House (lower).
  const rank = (c?: RepChamber) => (c === "Senate" ? 0 : c === "House" ? 1 : 2);
  return reps.sort((a, b) => rank(a.chamber) - rank(b.chamber) || a.name.localeCompare(b.name));
}

// Merged federal + state delegation for a state (state requires lat/lng).
export async function fetchRepresentatives(
  stateCode: string,
  opts: RepLookupOpts = {},
): Promise<Representative[]> {
  const code = stateCode.toUpperCase();
  const [federal, state] = await Promise.all([
    fetchFederalReps(code).catch(() => [] as Representative[]),
    fetchStateReps(code, opts).catch(() => [] as Representative[]),
  ]);
  return [...federal, ...state];
}
