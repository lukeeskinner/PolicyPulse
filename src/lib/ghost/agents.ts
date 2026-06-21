import type { AgentRole, GhostAgent } from "./types";

// ============================================================================
// Specialist agent roster. Each role carries a Fetch.ai-style identity, a
// color used across the dashboard, and a one-line mandate. The orchestrator
// deploys the subset of roles a scenario calls for.
// ============================================================================

interface RoleDef {
  id: string;
  role: AgentRole;
  color: string;
  blurb: string;
}

const ROLE_DEFS: Record<AgentRole, RoleDef> = {
  GridAgent: {
    id: "grid",
    role: "GridAgent",
    color: "#6e8bff",
    blurb: "Reroutes load and restores failed sectors without overloading the network.",
  },
  SecurityAgent: {
    id: "security",
    role: "SecurityAgent",
    color: "#fb7185",
    blurb: "Isolates compromised nodes and neutralizes the intrusion signature.",
  },
  CommsAgent: {
    id: "comms",
    role: "CommsAgent",
    color: "#34d399",
    blurb: "Protects critical infrastructure and brokers consensus between agents.",
  },
  TrafficAgent: {
    id: "traffic",
    role: "TrafficAgent",
    color: "#f59e0b",
    blurb: "Reroutes fleets and clears corridors for emergency transport.",
  },
  MedAgent: {
    id: "med",
    role: "MedAgent",
    color: "#22d3ee",
    blurb: "Safeguards patient-critical services and life-support continuity.",
  },
};

// Deterministic, plausible Fetch.ai bech32-style address per role.
function fetchAddress(role: AgentRole): string {
  const base = "qqxr7m3v9k2j4n8p6t5w0z1ad7yfh3lsc4ue2bg9";
  let h = 0;
  for (let i = 0; i < role.length; i++) h = (h * 31 + role.charCodeAt(i)) >>> 0;
  const tail = (h.toString(36) + base).slice(0, 38);
  return `fetch1${tail}`;
}

export function makeAgent(role: AgentRole): GhostAgent {
  const def = ROLE_DEFS[role];
  return {
    id: def.id,
    role: def.role,
    name: def.role,
    fetchAddress: fetchAddress(role),
    color: def.color,
    blurb: def.blurb,
  };
}

export function makeAgents(roles: AgentRole[]): GhostAgent[] {
  return roles.map(makeAgent);
}

export function agentColor(role: AgentRole): string {
  return ROLE_DEFS[role].color;
}
