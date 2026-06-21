import type { ActionKind, GhostOutcome, WorldMetrics, WorldNode } from "./types";

// ============================================================================
// Ghost Protocol world engine.
//
// No scripted decisions live here. The engine only:
//   - applies a chosen agent action to the world (real state mutation),
//   - flags actions that would endanger critical infrastructure (the conflict
//     trigger), and
//   - computes metrics / terminal conditions from the live world state.
// The agents (Claude) decide WHAT to do; this engine resolves the consequences.
// ============================================================================

export const cloneNodes = (nodes: WorldNode[]): WorldNode[] => nodes.map((n) => ({ ...n }));
export const byId = (nodes: WorldNode[], id?: string) => (id ? nodes.find((n) => n.id === id) : undefined);
const isUp = (s: WorldNode["status"]) => s === "online" || s === "restored" || s === "degraded";

// Resolve an agent's node reference robustly: exact id → exact label → fuzzy.
// Agents (Claude) sometimes name a node by label instead of id; without this
// their action would silently become a no-op.
export function resolveNode(nodes: WorldNode[], ref?: string): WorldNode | undefined {
  if (!ref) return undefined;
  const r = ref.trim().toLowerCase();
  return (
    nodes.find((n) => n.id.toLowerCase() === r) ??
    nodes.find((n) => n.label.toLowerCase() === r) ??
    nodes.find((n) => n.id.toLowerCase().includes(r) || r.includes(n.id.toLowerCase())) ??
    nodes.find((n) => n.label.toLowerCase().includes(r) || r.includes(n.label.toLowerCase()))
  );
}

export function worldHash(nodes: WorldNode[], tick: number): string {
  return `t${tick}:${nodes.map((n) => `${n.id.replace(/[^0-9a-z]/gi, "").slice(-2)}${n.status[0]}`).join("")}`;
}

export function totalPopulation(nodes: WorldNode[]): number {
  return nodes.reduce((s, n) => s + n.populationServed, 0);
}

// Containment over the nodes that started under attack (passed by the loop).
function containment(nodes: WorldNode[], threatIds: string[]): number {
  if (!threatIds.length) return 100;
  const score = (s: WorldNode["status"]) =>
    s === "restored" || s === "online" ? 1 : s === "isolated" ? 0.6 : s === "degraded" ? 0.5 : 0;
  const total = threatIds.reduce((acc, id) => {
    const n = byId(nodes, id);
    return acc + (n ? score(n.status) : 1);
  }, 0);
  return Math.round((total / threatIds.length) * 100);
}

export function computeMetrics(
  nodes: WorldNode[],
  tick: number,
  secondsRemaining: number,
  threatIds: string[] = [],
): WorldMetrics {
  const total = totalPopulation(nodes) || 1;
  const populationOnline = nodes.reduce((s, n) => (isUp(n.status) ? s + n.populationServed : s), 0);
  return {
    tick,
    secondsRemaining,
    populationOnline,
    populationAtRisk: Math.max(0, total - populationOnline),
    nodesOnline: nodes.filter((n) => n.status === "online" || n.status === "restored").length,
    nodesOffline: nodes.filter((n) => n.status === "offline").length,
    nodesCompromised: nodes.filter((n) => n.status === "compromised").length,
    gridStability: Math.round((populationOnline / total) * 100),
    threatContainment: containment(nodes, threatIds),
  };
}

export interface ActionInput {
  kind: ActionKind;
  target?: string;
  source?: string;
  magnitude?: number;
  summary?: string;
}

// Returns the critical node an action would endanger, or null. This is the
// emergent-conflict trigger: when an agent's own choice threatens protected
// infrastructure, the guardian gets to review it.
export function unsafeReason(action: ActionInput, nodes: WorldNode[]): { node: WorldNode; reason: string } | null {
  const crit = (id?: string) => {
    const n = resolveNode(nodes, id);
    return n && n.critical ? n : null;
  };
  if (action.kind === "shed_load") {
    const n = crit(action.source) ?? crit(action.target);
    if (n) return { node: n, reason: `shedding load from ${n.label}` };
  }
  if (action.kind === "reroute") {
    const n = crit(action.source);
    if (n) return { node: n, reason: `rerouting capacity away from ${n.label}` };
  }
  if (action.kind === "isolate") {
    const n = crit(action.target);
    if (n) return { node: n, reason: `isolating ${n.label}` };
  }
  return null;
}

// Apply a chosen action to the world. Returns whether the world changed and a
// short factual effect description (used for narration of REAL events).
export function applyAction(nodes: WorldNode[], action: ActionInput): { changed: boolean; effect: string } {
  const t = resolveNode(nodes, action.target);
  const s = resolveNode(nodes, action.source);
  switch (action.kind) {
    case "restore":
    case "reroute": {
      if (t && (t.status === "offline" || t.status === "degraded")) {
        t.status = "restored";
        if (t.load === 0) t.load = Math.round(t.capacity * 0.7);
        if (s && action.kind === "reroute") s.load = Math.max(0, s.load - (action.magnitude ?? Math.round(t.capacity * 0.5)));
        return { changed: true, effect: `${t.label} restored` };
      }
      return { changed: false, effect: action.summary ?? "no-op reroute" };
    }
    case "isolate":
      if (t && t.status === "compromised") {
        t.status = "isolated";
        return { changed: true, effect: `${t.label} isolated` };
      }
      return { changed: false, effect: action.summary ?? "no-op isolate" };
    case "patch":
      if (t && (t.status === "compromised" || t.status === "isolated")) {
        t.status = "restored";
        if (t.load === 0) t.load = Math.round(t.capacity * 0.6);
        return { changed: true, effect: `${t.label} patched and restored` };
      }
      return { changed: false, effect: action.summary ?? "no-op patch" };
    case "shed_load":
      if (s) {
        s.load = Math.max(0, s.load - (action.magnitude ?? Math.round(s.load * 0.3)));
        return { changed: true, effect: `shed load from ${s.label}` };
      }
      return { changed: false, effect: action.summary ?? "no-op shed" };
    case "analyze":
      return { changed: false, effect: `analyzed ${t?.label ?? "the intrusion"}` };
    case "protect":
      return { changed: false, effect: `asserted protection over ${t?.label ?? "critical infrastructure"}` };
    case "broadcast":
      return { changed: false, effect: action.summary ?? "broadcast coordination" };
    case "hold":
    default:
      return { changed: false, effect: action.summary ?? "held position" };
  }
}

export function isStabilized(nodes: WorldNode[]): boolean {
  // Resolved = no node is dark, under attack, or merely quarantined. A
  // "degraded" node is still serving load, so it doesn't block stabilization.
  return !nodes.some((n) => n.status === "offline" || n.status === "compromised" || n.status === "isolated");
}

export function outcomeFor(nodes: WorldNode[], initialAtRisk: number): GhostOutcome {
  if (isStabilized(nodes)) return "stabilized";
  const m = computeMetrics(nodes, 0, 0);
  const noActiveThreat = m.nodesCompromised === 0;
  if (noActiveThreat && m.populationAtRisk <= initialAtRisk * 0.25) return "partial";
  return "failed";
}
