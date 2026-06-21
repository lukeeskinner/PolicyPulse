import type { AgentRole, Domain, Grounding, Scenario, WorldNode } from "./types";

// ============================================================================
// Scenario library + threat-intelligence grounding.
//
// Each scenario is a structured world (a graph of failing nodes) plus the
// specialist agent team appropriate to the domain. The natural-language parser
// maps a free-text crisis prompt onto the best-fit scenario; Browserbase can
// later enrich the grounding with live CISA / incident data, but the seeded
// advisories below keep the demo grounded in real attack vectors with no keys.
// ============================================================================

// --- Seeded threat intelligence (CISA / MITRE ATT&CK ICS shaped) ------------

const GROUNDING: Record<Domain, Grounding> = {
  power: {
    source: "seed",
    notes:
      "Pre-seeded from CISA ICS advisories and grid incident postmortems. Parameters mirror real attack vectors, not invented ones.",
    advisories: [
      {
        id: "CISA ICS-CERT 24-074-01",
        title: "Ransomware targeting energy-sector OT networks",
        detail:
          "LockBit 3.0 affiliates pivoting from IT to OT via exposed RDP; encrypts SCADA historians and locks operator HMIs.",
        url: "https://www.cisa.gov/news-events/cybersecurity-advisories",
      },
      {
        id: "MITRE ATT&CK ICS T0816",
        title: "Device Restart/Shutdown",
        detail:
          "Adversary forces protective relays offline, cascading load onto adjacent substations.",
      },
      {
        id: "Incident Report 2024-03-17",
        title: "St. Mary's backup generator failure",
        detail:
          "During a load-shed event, St. Mary's Hospital backup generators failed to carry critical care load within 90s of grid loss.",
      },
    ],
  },
  water: {
    source: "seed",
    notes: "Pre-seeded from EPA water-sector ICS advisories and treatment incident reports.",
    advisories: [
      {
        id: "CISA AA24-038A",
        title: "PLC manipulation at water treatment facilities",
        detail:
          "Internet-exposed programmable logic controllers altered to change chemical dosing setpoints.",
      },
      {
        id: "Incident Report WTP-22-09",
        title: "Chlorine overdose interlock",
        detail: "Safety interlock prevented a 100x sodium-hypochlorite dosing command.",
      },
    ],
  },
  av_fleet: {
    source: "seed",
    notes: "Pre-seeded from autonomous-fleet incident postmortems and sensor-spoofing research.",
    advisories: [
      {
        id: "AV-ISAC 2025-11",
        title: "Correlated LiDAR sensor dropout",
        detail:
          "A firmware regression caused correlated sensor blackouts across a fleet sub-region during peak load.",
      },
    ],
  },
  hospital: {
    source: "seed",
    notes: "Pre-seeded from HHS HC3 advisories and hospital-network outage postmortems.",
    advisories: [
      {
        id: "HHS HC3 2025-04",
        title: "Ransomware on hospital EHR and imaging VLANs",
        detail: "Encryptor spreading laterally toward life-support network segments.",
      },
    ],
  },
};

// --- Power grid (the hero scenario, scripted to the demo) -------------------

function powerGridNodes(): WorldNode[] {
  // Layout in a 0..100 plane for the SVG world graph.
  return [
    { id: "node-0", label: "Main Intertie", kind: "substation", status: "online", critical: false, load: 410, capacity: 600, populationServed: 0, x: 50, y: 10, links: ["node-1", "node-2", "node-5", "node-7"] },
    { id: "node-1", label: "Sector 1", kind: "residential", status: "online", critical: false, load: 84, capacity: 120, populationServed: 28000, x: 19, y: 30, links: ["node-3"] },
    { id: "node-2", label: "Sector 2", kind: "commercial", status: "online", critical: false, load: 60, capacity: 110, populationServed: 12000, x: 39, y: 27, links: ["node-5"] },
    { id: "node-3", label: "Sector 3", kind: "residential", status: "offline", critical: false, load: 0, capacity: 130, populationServed: 62000, x: 14, y: 54, note: "Cascading failure after relay shutdown", links: ["node-b"] },
    { id: "node-5", label: "Sector 5", kind: "hospital", status: "online", critical: true, load: 72, capacity: 95, populationServed: 9000, x: 50, y: 44, note: "St. Mary's Hospital — backup generator failure per Incident Report 2024-03-17", links: ["node-b"] },
    { id: "node-7", label: "Sector 7", kind: "residential", status: "offline", critical: false, load: 0, capacity: 140, populationServed: 72000, x: 82, y: 30, note: "Cascading failure after relay shutdown", links: ["node-8", "node-9"] },
    { id: "node-8", label: "Sector 8", kind: "substation", status: "online", critical: false, load: 96, capacity: 220, populationServed: 18000, x: 67, y: 52, links: ["node-b", "node-12", "node-9"] },
    { id: "node-9", label: "Node 9", kind: "datacenter", status: "compromised", critical: false, load: 40, capacity: 80, populationServed: 8000, x: 86, y: 62, note: "Active ransomware — LockBit 3.0 intrusion signature", links: ["node-12"] },
    { id: "node-b", label: "Backup Corridor B", kind: "backup", status: "online", critical: false, load: 0, capacity: 380, populationServed: 0, x: 44, y: 70, links: ["node-11"] },
    { id: "node-11", label: "Sector 11", kind: "residential", status: "offline", critical: false, load: 0, capacity: 120, populationServed: 58000, x: 24, y: 80, note: "Cascading failure after relay shutdown", links: [] },
    { id: "node-12", label: "Sector 12", kind: "commercial", status: "online", critical: false, load: 70, capacity: 130, populationServed: 16000, x: 76, y: 80, links: [] },
  ];
}

// --- Secondary scenarios (lighter graphs, same engine) ----------------------

function waterNodes(): WorldNode[] {
  return [
    { id: "node-0", label: "Intake", kind: "control", status: "online", critical: false, load: 50, capacity: 100, populationServed: 0, x: 50, y: 10, links: ["node-1", "node-2"] },
    { id: "node-1", label: "Dosing PLC", kind: "control", status: "compromised", critical: false, load: 30, capacity: 60, populationServed: 0, x: 26, y: 38, note: "Setpoint manipulation — chlorine dosing", links: ["node-3"] },
    { id: "node-2", label: "Filtration", kind: "substation", status: "degraded", critical: false, load: 40, capacity: 80, populationServed: 40000, x: 74, y: 38, links: ["node-4"] },
    { id: "node-3", label: "Reservoir A", kind: "residential", status: "offline", critical: false, load: 0, capacity: 90, populationServed: 90000, x: 30, y: 70, links: ["node-5"] },
    { id: "node-4", label: "Dialysis Center", kind: "hospital", status: "online", critical: true, load: 20, capacity: 30, populationServed: 4000, x: 70, y: 70, note: "Critical care — depends on continuous safe-water supply", links: ["node-5"] },
    { id: "node-5", label: "Reservoir B", kind: "backup", status: "online", critical: false, load: 0, capacity: 120, populationServed: 0, x: 50, y: 88, links: [] },
  ];
}

function avFleetNodes(): WorldNode[] {
  return [
    { id: "node-0", label: "Fleet Control", kind: "control", status: "online", critical: false, load: 60, capacity: 120, populationServed: 0, x: 50, y: 10, links: ["node-1", "node-2", "node-3"] },
    { id: "node-1", label: "Zone North", kind: "transit", status: "compromised", critical: false, load: 50, capacity: 90, populationServed: 30000, x: 22, y: 40, note: "Correlated LiDAR dropout across sub-region", links: ["node-4"] },
    { id: "node-2", label: "Zone Core", kind: "transit", status: "degraded", critical: false, load: 70, capacity: 100, populationServed: 52000, x: 50, y: 42, links: ["node-4"] },
    { id: "node-3", label: "Hospital Run", kind: "hospital", status: "online", critical: true, load: 24, capacity: 40, populationServed: 6000, x: 78, y: 40, note: "Emergency patient transport corridor", links: ["node-5"] },
    { id: "node-4", label: "Depot A", kind: "backup", status: "online", critical: false, load: 0, capacity: 150, populationServed: 0, x: 36, y: 74, links: [] },
    { id: "node-5", label: "Zone South", kind: "transit", status: "offline", critical: false, load: 0, capacity: 90, populationServed: 44000, x: 70, y: 74, links: [] },
  ];
}

function hospitalNodes(): WorldNode[] {
  return [
    { id: "node-0", label: "Core Router", kind: "control", status: "online", critical: false, load: 40, capacity: 100, populationServed: 0, x: 50, y: 10, links: ["node-1", "node-2", "node-3"] },
    { id: "node-1", label: "EHR VLAN", kind: "datacenter", status: "compromised", critical: false, load: 55, capacity: 90, populationServed: 0, x: 24, y: 40, note: "Ransomware lateral spread from imaging VLAN", links: ["node-4"] },
    { id: "node-2", label: "Imaging", kind: "commercial", status: "offline", critical: false, load: 0, capacity: 70, populationServed: 12000, x: 50, y: 42, links: ["node-4"] },
    { id: "node-3", label: "ICU / Life Support", kind: "hospital", status: "online", critical: true, load: 30, capacity: 45, populationServed: 800, x: 78, y: 40, note: "Life-support segment — must stay isolated from infection", links: ["node-5"] },
    { id: "node-4", label: "Failover DC", kind: "backup", status: "online", critical: false, load: 0, capacity: 160, populationServed: 0, x: 36, y: 74, links: [] },
    { id: "node-5", label: "Pharmacy Net", kind: "residential", status: "offline", critical: false, load: 0, capacity: 60, populationServed: 9000, x: 70, y: 74, links: [] },
  ];
}

interface Template {
  id: string;
  title: string;
  domain: Domain;
  summary: string;
  threatType: string;
  timeLimitSec: number;
  agentRoles: AgentRole[];
  nodes: () => WorldNode[];
  defaultPrompt: string;
}

export const TEMPLATES: Template[] = [
  {
    id: "power-grid",
    title: "Bay Area Power Grid",
    domain: "power",
    summary:
      "An earthquake knocked sectors offline and a substation node is under active ransomware. ~200,000 residents lose power in 60 seconds if nothing changes.",
    threatType: "earthquake + ransomware (LockBit 3.0)",
    timeLimitSec: 60,
    agentRoles: ["GridAgent", "SecurityAgent", "CommsAgent"],
    nodes: powerGridNodes,
    defaultPrompt:
      "Bay Area power grid. Earthquake just hit. Nodes 3, 7, 11 are offline. Node 9 is under active ransomware. 200,000 residents lose power in 60 seconds if nothing changes.",
  },
  {
    id: "water-treatment",
    title: "Water Treatment Cyberattack",
    domain: "water",
    summary:
      "A dosing PLC was hijacked to alter chemical setpoints while a reservoir went offline. Safe water to ~90,000 people is at risk.",
    threatType: "PLC manipulation",
    timeLimitSec: 75,
    agentRoles: ["SecurityAgent", "CommsAgent", "MedAgent"],
    nodes: waterNodes,
    defaultPrompt:
      "City water treatment plant. The dosing PLC is compromised and altering chlorine setpoints. Reservoir A is offline. 90,000 residents lose safe water in 75 seconds.",
  },
  {
    id: "av-fleet",
    title: "Autonomous Vehicle Fleet",
    domain: "av_fleet",
    summary:
      "Correlated sensor failures are cascading across an autonomous fleet sub-region during peak load, with an emergency transport corridor at risk.",
    threatType: "correlated sensor failure",
    timeLimitSec: 60,
    agentRoles: ["TrafficAgent", "SecurityAgent", "CommsAgent"],
    nodes: avFleetNodes,
    defaultPrompt:
      "Autonomous vehicle fleet. Zone North has correlated LiDAR sensor dropout, Zone South is offline. 44,000 riders stranded and a hospital transport corridor is at risk in 60 seconds.",
  },
  {
    id: "hospital-network",
    title: "Hospital Network Outage",
    domain: "hospital",
    summary:
      "Ransomware is spreading laterally from the imaging VLAN toward the life-support network segment as imaging and pharmacy go dark.",
    threatType: "ransomware (lateral spread)",
    timeLimitSec: 70,
    agentRoles: ["SecurityAgent", "MedAgent", "CommsAgent"],
    nodes: hospitalNodes,
    defaultPrompt:
      "Hospital network. Ransomware is spreading from the imaging VLAN toward life-support. Imaging and pharmacy networks are down. The ICU segment must be protected in 70 seconds.",
  },
];

export const DEFAULT_SCENARIO_ID = "power-grid";

export const SCENARIO_PRESETS = TEMPLATES.map((t) => ({
  id: t.id,
  title: t.title,
  prompt: t.defaultPrompt,
}));

// --- Natural-language parsing ----------------------------------------------

const DOMAIN_KEYWORDS: { domain: Domain; words: string[] }[] = [
  { domain: "power", words: ["power", "grid", "substation", "blackout", "electric", "megawatt", "mw", "node 9"] },
  { domain: "water", words: ["water", "treatment", "reservoir", "chlorine", "dosing", "plc", "wastewater"] },
  { domain: "av_fleet", words: ["vehicle", "fleet", "autonomous", "lidar", "sensor", "robotaxi", "av ", "traffic"] },
  { domain: "hospital", words: ["hospital", "ehr", "icu", "patient", "imaging", "life support", "clinical", "ransomware ward"] },
];

function pickDomain(prompt: string): Domain {
  const p = prompt.toLowerCase();
  let best: { domain: Domain; score: number } = { domain: "power", score: 0 };
  for (const { domain, words } of DOMAIN_KEYWORDS) {
    const score = words.reduce((s, w) => (p.includes(w) ? s + 1 : s), 0);
    if (score > best.score) best = { domain, score };
  }
  return best.score > 0 ? best.domain : "power";
}

function extractTimeLimit(prompt: string, fallback: number): number {
  const m = prompt.match(/(\d{1,3})\s*(seconds|second|secs|sec|s)\b/i);
  if (m) {
    const v = parseInt(m[1], 10);
    if (Number.isFinite(v) && v >= 20 && v <= 600) return v;
  }
  const min = prompt.match(/(\d{1,2})\s*(minutes|minute|mins|min)\b/i);
  if (min) {
    const v = parseInt(min[1], 10) * 60;
    if (v >= 20 && v <= 600) return v;
  }
  return fallback;
}

/** Heuristic parse: choose the best-fit scenario template and overlay the prompt. */
export function parseScenarioHeuristic(prompt: string, explicitId?: string): Scenario {
  const tpl =
    (explicitId && TEMPLATES.find((t) => t.id === explicitId)) ||
    TEMPLATES.find((t) => t.domain === pickDomain(prompt)) ||
    TEMPLATES[0];

  const timeLimitSec = extractTimeLimit(prompt, tpl.timeLimitSec);
  return {
    id: tpl.id,
    title: tpl.title,
    domain: tpl.domain,
    prompt: prompt.trim() || tpl.defaultPrompt,
    summary: tpl.summary,
    threatType: tpl.threatType,
    timeLimitSec,
    nodes: tpl.nodes(),
    agentRoles: tpl.agentRoles,
    grounding: GROUNDING[tpl.domain],
    source: "heuristic",
  };
}

export function groundingFor(domain: Domain): Grounding {
  return GROUNDING[domain];
}

export function templateById(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
