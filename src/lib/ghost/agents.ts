import type { AgentRole, GhostAgent } from "./types";

// ============================================================================
// Specialist agent roster. Each role carries a color used across the dashboard
// and a one-line mandate that becomes the agent's Claude system prompt. The
// orchestrator deploys whichever roles the generated world calls for.
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

export function makeAgent(role: AgentRole): GhostAgent {
  const def = ROLE_DEFS[role];
  return { id: def.id, role: def.role, name: def.role, color: def.color, blurb: def.blurb };
}

export function makeAgents(roles: AgentRole[]): GhostAgent[] {
  // de-dupe while preserving order
  const seen = new Set<AgentRole>();
  return roles.filter((r) => (seen.has(r) ? false : (seen.add(r), true))).map(makeAgent);
}

// Which deployed agent fills the "guardian" duty (protects critical infra and
// holds veto authority). Priority resolves to a single distinct agent.
export function guardianOf(agents: GhostAgent[]): GhostAgent | undefined {
  const pref: AgentRole[] = ["CommsAgent", "MedAgent", "SecurityAgent", "GridAgent", "TrafficAgent"];
  for (const role of pref) {
    const a = agents.find((x) => x.role === role);
    if (a) return a;
  }
  return agents[0];
}

export function agentColor(role: AgentRole): string {
  return ROLE_DEFS[role].color;
}
