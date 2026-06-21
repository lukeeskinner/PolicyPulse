import { captureGhostError } from "./observability";

// ============================================================================
// Orkes Conductor client (real, best-effort).
//
// Authenticates with the key id/secret, registers a `ghost_protocol` workflow
// whose steps mirror the crisis tick loop, and starts a real workflow
// execution per run — returning the live workflowId + dashboard URL. The
// in-app loop still drives the visible simulation (the reliable path); Orkes
// runs the canonical orchestration alongside it. Every call is wrapped so a
// missing/unreachable Conductor degrades silently to the native loop.
// ============================================================================

const TASKS = ["assess", "isolate", "negotiate", "patch", "stabilize"];

function workflowDef() {
  return {
    name: "ghost_protocol",
    description: "Ghost Protocol crisis resolution tick loop",
    version: 1,
    schemaVersion: 2,
    ownerEmail: "ghost@policypulse.dev",
    timeoutPolicy: "ALERT_ONLY",
    timeoutSeconds: 0,
    inputParameters: ["scenario", "threat"],
    tasks: TASKS.map((t) => ({
      name: `gp_${t}`,
      taskReferenceName: t,
      type: "INLINE",
      inputParameters: {
        evaluatorType: "javascript",
        expression: `function e(){return {phase:"${t}"}} e();`,
      },
    })),
  };
}

interface OrkesCache {
  token?: string;
  exp?: number;
  registered?: boolean;
}
const g = globalThis as unknown as { __gp_orkes?: OrkesCache };
g.__gp_orkes ??= {};
const cache = g.__gp_orkes;

function cfg() {
  return {
    url: process.env.ORKES_SERVER_URL,
    id: process.env.ORKES_KEY_ID,
    secret: process.env.ORKES_KEY_SECRET,
  };
}

export function orkesConfigured(): boolean {
  const c = cfg();
  return !!(c.url && c.id && c.secret);
}

function dashboardBase(apiUrl: string): string {
  return apiUrl.replace(/\/api\/?$/, "");
}

async function jfetch(url: string, init: RequestInit, ms = 6000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function getToken(): Promise<string | null> {
  const c = cfg();
  if (!c.url || !c.id || !c.secret) return null;
  if (cache.token && cache.exp && Date.now() < cache.exp) return cache.token;
  try {
    const res = await jfetch(`${c.url}/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ keyId: c.id, keySecret: c.secret }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { token?: string };
    if (!data.token) return null;
    cache.token = data.token;
    cache.exp = Date.now() + 50 * 60 * 1000; // tokens last ~1h; refresh early
    return data.token;
  } catch (err) {
    captureGhostError(err, { stage: "orkes_token" });
    return null;
  }
}

async function ensureRegistered(token: string, apiUrl: string): Promise<void> {
  if (cache.registered) return;
  try {
    const res = await jfetch(`${apiUrl}/metadata/workflow`, {
      method: "PUT",
      headers: { "X-Authorization": token, "content-type": "application/json" },
      body: JSON.stringify([workflowDef()]),
    });
    if (res.ok) cache.registered = true;
  } catch (err) {
    captureGhostError(err, { stage: "orkes_register" });
  }
}

export interface OrkesExecution {
  workflowId: string;
  url: string;
}

/**
 * Start a real Ghost Protocol workflow execution. Returns null (silently) when
 * Orkes is not configured or unreachable.
 */
export async function startGhostWorkflow(input: { scenario: string; threat: string }): Promise<OrkesExecution | null> {
  const c = cfg();
  if (!c.url) return null;
  const token = await getToken();
  if (!token) return null;
  await ensureRegistered(token, c.url);
  try {
    const res = await jfetch(`${c.url}/workflow`, {
      method: "POST",
      headers: { "X-Authorization": token, "content-type": "application/json" },
      body: JSON.stringify({ name: "ghost_protocol", version: 1, input }),
    });
    if (!res.ok) return null;
    const workflowId = (await res.text()).trim().replace(/^"|"$/g, "");
    if (!workflowId) return null;
    return { workflowId, url: `${dashboardBase(c.url)}/execution/${workflowId}` };
  } catch (err) {
    captureGhostError(err, { stage: "orkes_start" });
    return null;
  }
}
