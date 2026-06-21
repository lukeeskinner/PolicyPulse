// ============================================================================
// Resident voice selection for Deepgram Aura playback.
//
// Personas have no explicit gender field, but their names are drawn from the
// fixed, gendered first-name pools in personas.ts. We derive a voice gender
// from the first name (only names we ourselves generate), then map it to a
// natural Aura voice. We map ONLY on gender (primary) and age (secondary lean)
// — never on race/ethnicity. Selection is deterministic, so a given resident
// always gets the same voice across plays.
// ============================================================================

export type VoiceGender = "male" | "female" | "neutral";

// First names we treat as male / female, taken from the personas.ts pools.
// Anything not listed (the intentionally androgynous "Other" pool, ambiguous
// names like Wei/Jin/Thuy) resolves to "neutral" and uses the default voice.
const MALE_NAMES = new Set(
  [
    // Black
    "andre", "marcus", "darnell", "terrence", "jamal",
    // Hispanic
    "mateo", "diego", "javier", "esteban", "hector",
    // Asian
    "hiro", "kenji", "raj",
    // White
    "ethan", "logan", "brett", "cole", "derek",
    // Other (clearly masculine)
    "yusuf",
  ],
);

const FEMALE_NAMES = new Set(
  [
    // Black
    "imani", "tasha", "keisha", "aaliyah", "nia",
    // Hispanic
    "lucia", "rosa", "carmen", "marisol", "valeria",
    // Asian
    "mei", "linh", "priya", "anjali",
    // White
    "claire", "megan", "hannah", "sarah", "emily",
    // Other (clearly feminine)
    "aya", "leila", "amara",
  ],
);

export function genderFromName(name?: string): VoiceGender {
  if (!name) return "neutral";
  const first = name.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  if (MALE_NAMES.has(first)) return "male";
  if (FEMALE_NAMES.has(first)) return "female";
  return "neutral";
}

// Two natural Aura voices per gender. Index 0 = younger lean, 1 = older lean.
const VOICES: Record<"male" | "female", [string, string]> = {
  female: ["aura-2-andromeda-en", "aura-2-thalia-en"],
  male: ["aura-2-orion-en", "aura-2-arcas-en"],
};

// The default voice for residents without a resolvable gender. Respects the
// global DEEPGRAM_TTS_MODEL override so operators can still force one voice.
function defaultVoice(): string {
  return process.env.DEEPGRAM_TTS_MODEL || "aura-2-thalia-en";
}

// Pick an Aura voice from gender (primary) + age (secondary, older -> 2nd voice).
// Deterministic: a resident's fixed gender + age always yield the same voice.
export function pickAuraVoice(gender?: string, age?: number): string {
  const g = gender === "male" || gender === "female" ? gender : "neutral";
  if (g === "neutral") return defaultVoice();
  const older = typeof age === "number" && age >= 50;
  return VOICES[g][older ? 1 : 0];
}
