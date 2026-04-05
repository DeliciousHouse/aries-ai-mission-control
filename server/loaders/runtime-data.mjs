import { runOpenClawJson } from "../lib/cli.mjs";
import { toIso } from "../lib/fs-utils.mjs";

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

export async function loadRuntimeData() {
  const freshness = toIso(Date.now());

  const [
    sessionsResult,
    tasksResult,
    flowsResult,
    cronStatusResult,
    cronListResult,
    healthResult,
    modelsResult,
    usageCostResult,
  ] = await Promise.all([
    settle(["sessions", "--json"]),
    settle(["tasks", "list", "--json"]),
    settle(["tasks", "flow", "list", "--json"]),
    settle(["cron", "status", "--json"]),
    settle(["cron", "list", "--all", "--json"]),
    settle(["health", "--json"]),
    settle(["models", "status", "--json"]),
    settle(["gateway", "usage-cost", "--json"]),
  ]);

  const sessionsPayload = sessionsResult.status === "fulfilled" ? sessionsResult.value : { sessions: [] };
  const sessionRows = (sessionsPayload.sessions || []).map((session) => ({
    id: session.sessionId || session.key,
    sessionKey: session.key,
    sessionType: normalizeSessionType(session.key),
    initiator: session.agentId || null,
    startedAt: null,
    updatedAt: typeof session.updatedAt === "number" ? toIso(session.updatedAt) : null,
    ageMinutes: typeof session.ageMs === "number" ? session.ageMs / 60000 : null,
    currentState: normalizeSessionState(session.ageMs),
    model: session.model || null,
    provider: session.modelProvider || null,
    tokenTotal: typeof session.totalTokens === "number" ? session.totalTokens : null,
  }));

  const sessionModelByKey = new Map(sessionRows.map((row) => [row.sessionKey, row]));

  const tasksPayload = tasksResult.status === "fulfilled" ? tasksResult.value : { tasks: [] };
  const taskRows = (tasksPayload.tasks || []).map((task) => {
    const linkedSession = task.childSessionKey ? sessionModelByKey.get(task.childSessionKey) : null;
    return {
      id: task.taskId,
      label: task.label || task.task || task.taskId,
      runtime: task.runtime || "unknown",
      status: task.status || "unknown",
      agentId: task.agentId || null,
      childSessionKey: task.childSessionKey || null,
      startedAt: typeof task.startedAt === "number" ? toIso(task.startedAt) : null,
      endedAt: typeof task.endedAt === "number" ? toIso(task.endedAt) : null,
      durationMs:
        typeof task.startedAt === "number" && typeof task.endedAt === "number"
          ? task.endedAt - task.startedAt
          : null,
      latestStatus: task.status || "unknown",
      failureReason: task.error || task.terminalSummary || null,
      model: linkedSession?.model || null,
      provider: linkedSession?.provider || null,
    };
  });

  const flowsPayload = flowsResult.status === "fulfilled" ? flowsResult.value : { flows: [] };
  const flowRows = (flowsPayload.flows || []).map((flow) => ({
    id: flow.flowId || flow.id,
    ownerKey: flow.ownerKey || null,
    status: flow.status || null,
    startedAt: typeof flow.startedAt === "number" ? toIso(flow.startedAt) : null,
    updatedAt: typeof flow.updatedAt === "number" ? toIso(flow.updatedAt) : null,
    stage: flow.stage || flow.state || null,
    relatedTaskId: flow.linkedTaskId || null,
    relatedSessionKey: flow.linkedSessionKey || null,
  }));

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

  const modelsPayload = modelsResult.status === "fulfilled" ? modelsResult.value : {};
  const usageCostPayload = usageCostResult.status === "fulfilled" ? usageCostResult.value : { totals: {} };
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
    settledToSource("sessions", "Sessions", "openclaw sessions --json", sessionsResult),
    settledToSource("tasks", "Tasks", "openclaw tasks list --json", tasksResult),
    settledToSource("flows", "TaskFlow / Lobster flows", "openclaw tasks flow list --json", flowsResult),
    settledToSource("cron-status", "Cron status", "openclaw cron status --json", cronStatusResult),
    settledToSource("cron-list", "Cron jobs", "openclaw cron list --all --json", cronListResult),
    settledToSource("health", "Health", "openclaw health --json", healthResult),
    settledToSource("models", "Model config", "openclaw models status --json", modelsResult),
    settledToSource("usage-cost", "Usage cost", "openclaw gateway usage-cost --json", usageCostResult),
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
      state: connectionState(tasksResult, taskRows),
      detail: commandDetail(
        tasksResult,
        "Durable background task state loaded from the OpenClaw task store.",
        "Task source is connected but currently empty.",
      ),
      rows: taskRows,
    },
    flows: {
      state: connectionState(flowsResult, flowRows),
      detail: commandDetail(
        flowsResult,
        "TaskFlow state is connected through the CLI flow list.",
        "No TaskFlow / Lobster flows are currently exposed by the connected source.",
      ),
      rows: flowRows,
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
      state: modelsResult.status === "fulfilled" ? (modelUsageRows.length ? "connected" : "empty") : "disconnected",
      detail:
        modelsResult.status === "fulfilled"
          ? modelUsageRows.length
            ? "Model usage rows are derived from live session metadata plus configured model state."
            : "Model config is available, but no current session-linked model activity was detected."
          : modelsResult.reason instanceof Error
            ? modelsResult.reason.message
            : "Model usage source unavailable.",
      configuredDefault: modelsPayload.resolvedDefault || modelsPayload.defaultModel || null,
      configuredFallbacks: Array.isArray(modelsPayload.fallbacks) ? modelsPayload.fallbacks : [],
      rows: modelUsageRows,
      usageCost: {
        totalCost:
          typeof usageCostPayload?.totals?.totalCost === "number"
            ? usageCostPayload.totals.totalCost
            : null,
        totalTokens:
          typeof usageCostPayload?.totals?.totalTokens === "number"
            ? usageCostPayload.totals.totalTokens
            : null,
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
