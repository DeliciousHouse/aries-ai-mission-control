import os from "node:os";
import path from "node:path";
import { runOpenClawJson } from "../lib/cli.mjs";
import { readJson, toIso } from "../lib/fs-utils.mjs";

const openclawConfigPath = path.join(os.homedir(), ".openclaw", "openclaw.json");
const openclawCronJobsPath = path.join(os.homedir(), ".openclaw", "cron", "jobs.json");

async function loadCronJobsSnapshot() {
  try {
    return await readJson(openclawCronJobsPath, { jobs: [] });
  } catch {
    return await runOpenClawJson(["cron", "list", "--all", "--json"]);
  }
}

function settledToSource(id, label, command, result) {
  const checkedAt = toIso(Date.now());
  if (result.status === "fulfilled") {
    const value = result.value;
    const isEmpty =
      (Array.isArray(value?.sessions) && value.sessions.length === 0) ||
      (Array.isArray(value?.tasks) && value.tasks.length === 0) ||
      (Array.isArray(value?.flows) && value.flows.length === 0);
    return {
      id,
      label,
      command,
      state: isEmpty ? "empty" : "connected",
      detail: isEmpty ? `${label} returned no active rows.` : `${label} source responded successfully.`,
      checkedAt,
    };
  }
  return {
    id,
    label,
    command,
    state: "disconnected",
    detail: result.reason instanceof Error ? result.reason.message : "Source unavailable.",
    checkedAt,
  };
}

function normalizeSessionType(sessionKey) {
  if (sessionKey.includes(":subagent:")) return "sub-agent";
  if (sessionKey.includes(":cron:")) return "cron";
  if (sessionKey.includes(":thread:")) return "thread";
  if (sessionKey.includes(":main")) return "main";
  return "session";
}

function normalizeSessionState(ageMs) {
  if (typeof ageMs !== "number") return null;
  if (ageMs <= 5 * 60 * 1000) return "recently active";
  if (ageMs <= 60 * 60 * 1000) return "warm";
  return "idle";
}

function mapHealthStatus(ok) {
  return ok === true ? "healthy" : ok === false ? "down" : "unknown";
}

function commandDetail(result, connectedDetail, emptyDetail) {
  if (result.status === "fulfilled") {
    const value = result.value;
    if (Array.isArray(value) && value.length === 0) return emptyDetail;
    if (Array.isArray(value?.tasks) && value.tasks.length === 0) return emptyDetail;
    if (Array.isArray(value?.sessions) && value.sessions.length === 0) return emptyDetail;
    if (Array.isArray(value?.flows) && value.flows.length === 0) return emptyDetail;
    return connectedDetail;
  }
  return result.reason instanceof Error ? result.reason.message : "Source unavailable.";
}

function connectionState(result, rows) {
  if (result.status !== "fulfilled") return "disconnected";
  return rows.length ? "connected" : "empty";
}

async function settle(commandArgs) {
  try {
    const value = await runOpenClawJson(commandArgs);
    return { status: "fulfilled", value };
  } catch (reason) {
    return { status: "rejected", reason };
  }
}

async function settleFromPromise(promise) {
  try {
    const value = await promise;
    return { status: "fulfilled", value };
  } catch (reason) {
    return { status: "rejected", reason };
  }
}

async function loadConfigSessions() {
  const config = await readJson(openclawConfigPath);
  const agents = Array.isArray(config?.agents?.list) ? config.agents.list : [];
  const rows = [];

  for (const agent of agents) {
    const sessionPath = path.join(os.homedir(), ".openclaw", "agents", agent.id, "sessions", "sessions.json");
    try {
      const payload = await readJson(sessionPath);
      const sessionEntries = Array.isArray(payload?.sessions)
        ? payload.sessions
        : Object.values(payload || {}).filter((value) => value && typeof value === "object");
      for (const session of sessionEntries) {
        rows.push({
          id: session.sessionId || session.key,
          sessionKey: session.key,
          sessionType: normalizeSessionType(session.key),
          initiator: session.agentId || agent.id || null,
          startedAt: typeof session.startedAt === "number" ? toIso(session.startedAt) : null,
          updatedAt: typeof session.updatedAt === "number" ? toIso(session.updatedAt) : null,
          ageMinutes: typeof session.ageMs === "number" ? session.ageMs / 60000 : null,
          currentState: normalizeSessionState(session.ageMs),
          model: session.model || agent.model?.primary || null,
          provider: session.modelProvider || null,
          tokenTotal: typeof session.totalTokens === "number" ? session.totalTokens : null,
        });
      }
    } catch {
      // Missing or unreadable session stores stay unavailable without failing the whole endpoint.
    }
  }

  return {
    config,
    rows: rows.sort((left, right) => (Date.parse(right.updatedAt || "") || 0) - (Date.parse(left.updatedAt || "") || 0)),
  };
}

export async function loadRuntimeData() {
  const freshness = toIso(Date.now());

  const [
    sessionsResult,
    cronListResult,
    healthResult,
  ] = await Promise.all([
    settleFromPromise(loadConfigSessions()),
    settleFromPromise(loadCronJobsSnapshot()),
    settle(["health", "--json"]),
  ]);

  const sessionsPayload = sessionsResult.status === "fulfilled" ? sessionsResult.value : { rows: [], config: null };
  const sessionRows = sessionsPayload.rows || [];

  const sessionModelByKey = new Map(sessionRows.map((row) => [row.sessionKey, row]));

  const taskRows = [];

  const cronListPayload = cronListResult.status === "fulfilled" ? cronListResult.value : { jobs: [] };
  const cronRows = (cronListPayload.jobs || []).map((job) => ({
    id: job.id,
    name: job.name || job.id,
    schedule: job.schedule?.expr ? `${job.schedule.expr} (${job.schedule.tz || "tz unavailable"})` : "Unavailable",
    enabled: Boolean(job.enabled),
    lastRun: typeof job.state?.lastRunAtMs === "number" ? toIso(job.state.lastRunAtMs) : null,
    nextRun: typeof job.state?.nextRunAtMs === "number" ? toIso(job.state.nextRunAtMs) : null,
    lastResult: job.state?.lastRunStatus || job.state?.lastStatus || null,
    failureReason: job.state?.lastError || null,
    consecutiveFailures:
      typeof job.state?.consecutiveErrors === "number" ? job.state.consecutiveErrors : null,
  }));

  const modelUsageRows = sessionRows
    .filter((row) => row.model && row.provider)
    .slice(0, 20)
    .map((row) => ({
      id: row.id,
      model: row.model,
      provider: row.provider,
      linkedTo: row.sessionKey,
      linkedType: "session",
      sessionKey: row.sessionKey,
      taskId: null,
      updatedAt: row.updatedAt,
      tokenTotal: row.tokenTotal,
      costTotal: null,
    }));

  const healthPayload = healthResult.status === "fulfilled" ? healthResult.value : { channels: {}, ok: null };
  const healthRows = [
    {
      id: "gateway",
      label: "Gateway RPC probe",
      status: mapHealthStatus(healthPayload.ok),
      detail: healthPayload.ok ? "Gateway health probe responded." : "Gateway health probe unavailable.",
      updatedAt: typeof healthPayload.ts === "number" ? toIso(healthPayload.ts) : freshness,
    },
    ...Object.entries(healthPayload.channels || {}).map(([channel, channelState]) => ({
      id: channel,
      label: channel,
      status: mapHealthStatus(channelState?.probe?.ok),
      detail: channelState?.probe?.error || (channelState?.probe?.ok ? "Probe succeeded." : "Probe unavailable."),
      updatedAt: typeof channelState?.lastProbeAt === "number" ? toIso(channelState.lastProbeAt) : freshness,
    })),
  ];

  const sources = [
    settledToSource("sessions", "Sessions", "per-agent session stores (~/.openclaw/agents/*/sessions/sessions.json)", sessionsResult),
    {
      id: "tasks",
      label: "Tasks",
      command: "not loaded on the fast runtime path",
      state: "disconnected",
      detail: "Detailed task rows are intentionally removed from the fast runtime endpoint because the current task-source commands exceed the route timeout budget.",
    },
    settledToSource("cron-list", "Cron jobs", `cat ${openclawCronJobsPath}`, cronListResult),
    settledToSource("health", "Health", "openclaw health --json", healthResult),
    settledToSource("models", "Model config", "~/.openclaw/openclaw.json + session metadata", sessionsResult),
  ];

  return {
    freshness,
    sources,
    sessions: {
      state: connectionState(sessionsResult, sessionRows),
      detail: commandDetail(
        sessionsResult,
        "Live sessions and recent session history loaded from the OpenClaw session store.",
        "No active or recent sessions were returned by the session source.",
      ),
      rows: sessionRows,
    },
    tasks: {
      state: "disconnected",
      detail: "Detailed task rows are deferred from the fast runtime path because the current CLI task sources exceed the endpoint timeout budget. The shell remains usable and the source is reported as unavailable instead of timing out the whole page.",
      rows: taskRows,
    },
    flows: {
      state: "disconnected",
      detail: "Flow rows are intentionally removed from the fast initial runtime path because the current CLI flow list exceeds the endpoint timeout budget. This surface now degrades truthfully instead of timing out the whole page.",
      rows: [],
    },
    cron: {
      state: cronListResult.status === "fulfilled" ? (cronRows.length ? "connected" : "empty") : "disconnected",
      detail:
        cronListResult.status === "fulfilled"
          ? `Scheduler source reachable. ${cronRows.length} cron job${cronRows.length === 1 ? "" : "s"} returned.`
          : cronListResult.reason instanceof Error
            ? cronListResult.reason.message
            : "Scheduler source unavailable.",
      rows: cronRows,
    },
    modelUsage: {
      state: sessionsResult.status === "fulfilled" ? (modelUsageRows.length ? "connected" : "empty") : "disconnected",
      detail:
        sessionsResult.status === "fulfilled"
          ? modelUsageRows.length
            ? "Model usage rows are derived from per-agent session metadata plus configured model defaults."
            : "Model config is available, but no current session-linked model activity was detected."
          : sessionsResult.reason instanceof Error
            ? sessionsResult.reason.message
            : "Model usage source unavailable.",
      configuredDefault: sessionsPayload.config?.defaults?.model || sessionsPayload.config?.defaultModel || null,
      configuredFallbacks: Array.isArray(sessionsPayload.config?.defaults?.fallbacks)
        ? sessionsPayload.config.defaults.fallbacks
        : Array.isArray(sessionsPayload.config?.fallbacks)
          ? sessionsPayload.config.fallbacks
          : [],
      rows: modelUsageRows,
      usageCost: {
        totalCost: null,
        totalTokens: null,
      },
    },
    health: {
      state: healthResult.status === "fulfilled" ? (healthRows.length ? "connected" : "empty") : "disconnected",
      detail:
        healthResult.status === "fulfilled"
          ? "Gateway and channel probes loaded from openclaw health."
          : healthResult.reason instanceof Error
            ? healthResult.reason.message
            : "Health source unavailable.",
      rows: healthRows,
    },
  };
}
