import os from "node:os";
import path from "node:path";
import { existsSync } from "node:fs";
import { readJson, resolveRepoRoot, toIso } from "../lib/fs-utils.mjs";
import { loadProjectBoardPayload } from "../lib/project-board.mjs";
import { loadStandupArchiveData } from "./standup-data.mjs";

const repoRoot = resolveRepoRoot();
const orgChartPath = path.join(repoRoot, "data", "org-chart.json");
const standupPath = path.join(repoRoot, "team", "meetings");
const openclawConfigPath = path.join(os.homedir(), ".openclaw", "openclaw.json");
const MIN_ONLINE_THRESHOLD_MS = 20 * 60 * 1000;
const MAX_ONLINE_THRESHOLD_MS = 4 * 60 * 60 * 1000;
const standupHref = "/?knowledgeView=standups#/knowledge";

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeName(value) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function statusLabel(value) {
  return normalizeText(value).replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function maybeIso(value) {
  if (typeof value === "number" && Number.isFinite(value)) {return toIso(value);}
  if (typeof value === "string" && value) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {return toIso(parsed);}
  }
  return null;
}

function sessionTimestampMs(session) {
  if (typeof session?.updatedAt === "number" && Number.isFinite(session.updatedAt)) {return session.updatedAt;}
  const parsed = Date.parse(session?.updatedAt || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function sessionAgeMs(session) {
  if (typeof session?.ageMs === "number" && Number.isFinite(session.ageMs)) {return session.ageMs;}
  const updatedAtMs = sessionTimestampMs(session);
  return updatedAtMs ? Math.max(Date.now() - updatedAtMs, 0) : null;
}

function combinedModelLabel(model, provider) {
  const normalizedModel = normalizeText(model);
  const normalizedProvider = normalizeText(provider);
  if (!normalizedModel) {return null;}
  if (normalizedProvider && !normalizedModel.includes("/")) {
    return `${normalizedProvider}/${normalizedModel}`;
  }
  return normalizedModel;
}

async function readOpenClawConfigSafe() {
  if (!existsSync(openclawConfigPath)) {
    return { path: null, data: null };
  }

  return {
    path: openclawConfigPath,
    data: await readJson(openclawConfigPath),
  };
}

function findMatchingAgent(member, configAgents = []) {
  const memberName = normalizeName(member.name);
  const memberId = normalizeName(member.id);

  const scored = configAgents
    .map((agent) => {
      const names = [agent?.id, agent?.name, agent?.identity?.name].map(normalizeName).filter(Boolean);
      let score = 0;
      if (member.id === "jarvis" && names.includes("default")) {score += 100;}
      if (names.includes(memberId)) {score += 80;}
      if (names.includes(memberName)) {score += 90;}
      if (names.some((value) => value && memberName && (value.includes(memberName) || memberName.includes(value)))) {score += 20;}
      return { agent, score };
    })
    .filter((entry) => entry.score > 0)
    .toSorted((left, right) => right.score - left.score);

  return scored[0]?.agent || null;
}

function onlineThresholdMs(heartbeatConfig) {
  const everyMs = Number(heartbeatConfig?.everyMs || 0);
  if (!everyMs) {return MIN_ONLINE_THRESHOLD_MS;}
  return Math.max(MIN_ONLINE_THRESHOLD_MS, Math.min(Math.round(everyMs * 1.25), MAX_ONLINE_THRESHOLD_MS));
}

function sortNewest(items, selector) {
  return [...items].toSorted((left, right) => (Date.parse(selector(right) || "") || 0) - (Date.parse(selector(left) || "") || 0));
}

function extractSection(markdown, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = markdown.match(new RegExp(`^## ${escaped}\\s*$([\\s\\S]*?)(?=^## |\\Z)`, "m"));
  return match?.[1]?.trim() || "";
}

function extractBullets(section) {
  return (section || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^-\s+/.test(line))
    .map((line) => line.replace(/^-\s+/, ""));
}

function firstLineMention(markdown, name) {
  const normalizedName = normalizeName(name);
  if (!normalizedName) {return null;}

  const prioritizedSections = [extractSection(markdown, "Human Dependencies"), extractSection(markdown, "Top Summary"), markdown];
  for (const section of prioritizedSections) {
    const line = section
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .find((entry) => normalizeName(entry).includes(normalizedName));
    if (line) {
      return line.replace(/^-\s+/, "");
    }
  }

  return null;
}

function extractDecisionBullets(markdown) {
  const sources = [
    extractSection(markdown, "Top Summary"),
    extractSection(markdown, "Blocked Items"),
    extractSection(markdown, "Cross-Department Dependencies"),
  ];

  const bullets = [];
  for (const section of sources) {
    for (const bullet of extractBullets(section)) {
      if (/decision|decide|approval|route|escalat/i.test(bullet)) {
        bullets.push(bullet);
      }
    }
  }

  return [...new Set(bullets)].slice(0, 3);
}

function buildBoardLoad(tasks) {
  const total = tasks.length;
  const shipped = tasks.filter((task) => task.status === "shipped").length;
  const blocked = tasks.filter((task) => task.blocked).length;
  const active = tasks.filter((task) => task.status === "active").length;
  const ready = tasks.filter((task) => task.status === "ready").length;
  const review = tasks.filter((task) => task.status === "review").length;
  const open = total - shipped;
  const latestUpdatedAt = sortNewest(tasks, (task) => task.updatedAt)[0]?.updatedAt || null;

  return {
    total,
    open,
    blocked,
    active,
    ready,
    review,
    shipped,
    completionRate: total ? Math.round((shipped / total) * 100) : null,
    latestUpdatedAt,
  };
}

function recentBoardActivity(tasks) {
  const latest = sortNewest(tasks, (task) => task.updatedAt)[0] || null;
  if (!latest) {return null;}
  return {
    timestamp: latest.updatedAt,
    detail: `${statusLabel(latest.status)} • ${latest.title}`,
    href: "/#/command",
    source: "/api/pm-board",
  };
}

function recentSessionActivity(session, runtime) {
  if (!session || !runtime) {return null;}
  const updatedAt = maybeIso(session.updatedAt);
  return {
    timestamp: updatedAt,
    detail: `${normalizeText(session.key).includes(":subagent:") ? "Sub-agent" : normalizeText(session.key).includes(":heartbeat") ? "Heartbeat" : "Session"} • ${runtime.currentModel || "Model unavailable"}`,
    href: "/#/runtime",
    source: "/api/app/runtime",
  };
}

function recentStandupActivity(standupState) {
  if (!standupState?.latestMention || !standupState?.latestStandupDate) {return null;}
  return {
    timestamp: standupState.latestStandupDate,
    detail: `${statusLabel(standupState.latestStandupStatus || "partial")} • ${standupState.latestMention}`,
    href: standupHref,
    source: "/api/standups",
  };
}

function buildRuntimeState(member, matchedAgent, sessionsResult) {
  const configuredModel = normalizeText(matchedAgent?.model?.primary) || null;
  if (!matchedAgent) {
    return {
      agentId: null,
      registered: false,
      status: "unavailable",
      lastSeen: null,
      currentModel: null,
      modelSource: "unavailable",
      statusSource: "runtime-unavailable",
      detail: "No registered OpenClaw agent matched this org member.",
    };
  }

  if (sessionsResult.status !== "fulfilled") {
    return {
      agentId: matchedAgent.id,
      registered: true,
      status: "unavailable",
      lastSeen: null,
      currentModel: configuredModel,
      modelSource: configuredModel ? "configured-agent" : "unavailable",
      statusSource: "runtime-unavailable",
      detail: sessionsResult.reason instanceof Error ? sessionsResult.reason.message : "OpenClaw session source unavailable.",
    };
  }

  const sessions = sessionsResult.status === "fulfilled" && Array.isArray(sessionsResult.value?.sessions) ? sessionsResult.value.sessions : [];
  const latestFromSessions = sessions
    .filter((session) => normalizeText(session.agentId) === matchedAgent.id)
    .toSorted((left, right) => sessionTimestampMs(right) - sessionTimestampMs(left))[0] || null;
  const latest = latestFromSessions;

  if (!latest) {
    return {
      agentId: matchedAgent.id,
      registered: true,
      status: "unavailable",
      lastSeen: null,
      currentModel: configuredModel,
      modelSource: configuredModel ? "configured-agent" : "unavailable",
      statusSource: "no-session-evidence",
      detail: "Registered agent has no session or heartbeat evidence yet.",
    };
  }

  const thresholdMs = onlineThresholdMs(null);
  const ageMs = sessionAgeMs(latest);
  const sessionModel = combinedModelLabel(latest.model, latest.modelProvider);
  const lastSeen = maybeIso(latest.updatedAt);

  return {
    agentId: matchedAgent.id,
    registered: true,
    status: ageMs != null && ageMs <= thresholdMs ? "online" : "offline",
    lastSeen,
    currentModel: sessionModel || configuredModel,
    modelSource: sessionModel ? "active-session" : configuredModel ? "configured-agent" : "unavailable",
    statusSource: "session-evidence",
    detail:
      ageMs != null && ageMs <= thresholdMs
        ? `Latest session evidence is within the ${Math.round(thresholdMs / 60000)} minute online window.`
        : `Latest session evidence is older than the ${Math.round(thresholdMs / 60000)} minute online window.`,
  };
}

function settle(promise) {
  return promise.then((value) => ({ status: "fulfilled", value })).catch((reason) => ({ status: "rejected", reason }));
}

async function loadAgentSessions(configAgents = []) {
  const sessions = [];
  for (const agent of configAgents) {
    const sessionPath = path.join(os.homedir(), ".openclaw", "agents", agent.id, "sessions", "sessions.json");
    if (!existsSync(sessionPath)) {continue;}

    try {
      const payload = await readJson(sessionPath);
      const sessionEntries = Array.isArray(payload?.sessions)
        ? payload.sessions
        : Object.values(payload || {}).filter((value) => value && typeof value === "object");
      for (const session of sessionEntries) {
        sessions.push({
          ...session,
          agentId: session.agentId || agent.id,
        });
      }
    } catch {
      // Keep the org surface truthful but resilient when one per-agent session store is unreadable.
    }
  }

  return { sessions };
}

export async function loadOrgData() {
  const [org, board, standups, configResult] = await Promise.all([
    readJson(orgChartPath),
    loadProjectBoardPayload(),
    loadStandupArchiveData(),
    settle(readOpenClawConfigSafe()),
  ]);

  const config = configResult.status === "fulfilled" ? configResult.value.data : null;
  const configPath = configResult.status === "fulfilled" ? configResult.value.path : null;
  const configAgents = Array.isArray(config?.agents?.list) ? config.agents.list : [];
  const sessionsResult = await settle(loadAgentSessions(configAgents));
  const latestStandup = standups.items?.[0] || null;
  const latestStandupSummary = latestStandup
    ? {
        id: latestStandup.id,
        title: latestStandup.title,
        date: latestStandup.date,
        status: latestStandup.status,
        path: latestStandup.path,
        preview: latestStandup.preview,
        respondingChiefCount: latestStandup.chiefs.length,
        chiefCount: (org.aiOrg?.children || []).length,
        decisions: extractDecisionBullets(latestStandup.markdown),
        delivery: latestStandup.delivery,
      }
    : null;

  const actorDirectory = new Map((board.assignees || []).map((actor) => [actor.id, actor]));

  const aiMembers = [org.aiOrg, ...(org.aiOrg?.children || [])].map((member) => ({
    id: member.id,
    name: member.name,
    title: member.title,
    department: member.department || "AI Command",
    roleSummary: member.mission || member.openclawAccess || member.missionControlAccess || member.title,
    emoji: actorDirectory.get(member.id)?.emoji || "🤖",
    memberKind: "ai",
    isChief: member.id !== org.aiOrg.id,
  }));

  const humanMembers = (org.humanCollaborators || []).map((member) => ({
    id: member.id,
    name: member.name,
    title: member.role,
    department: "Human Collaborators",
    roleSummary: member.role,
    emoji: actorDirectory.get(member.id)?.emoji || "👤",
    memberKind: "human",
    isChief: false,
  }));

  const members = [...aiMembers, ...humanMembers].map((member) => {
    const matchedAgent = member.memberKind === "ai" ? findMatchingAgent(member, configAgents) : null;
    const runtime = member.memberKind === "ai"
      ? buildRuntimeState(member, matchedAgent, sessionsResult)
      : null;

    const relevantActorIds = new Set([member.id]);
    if (member.isChief) {
      for (const actor of board.assignees || []) {
        if (actor.parentChiefId === member.id) {
          relevantActorIds.add(actor.id);
        }
      }
    }

    const boardTasks = (board.tasks || []).filter((task) => relevantActorIds.has(task.assigneeId));
    const boardLoad = buildBoardLoad(boardTasks);
    const latestBoard = recentBoardActivity(boardTasks);

    const chiefStandup = member.isChief
      ? latestStandup?.chiefs?.find((chief) => normalizeText(chief.chiefId) === member.id) || null
      : null;

    const standupMention = chiefStandup?.preview || (latestStandup ? firstLineMention(latestStandup.markdown, member.name) : null);
    const standupState = {
      latestStandupId: latestStandup?.id || null,
      latestStandupDate: latestStandup?.date || null,
      latestStandupStatus: latestStandup?.status || null,
      latestChiefStatus: chiefStandup?.status || null,
      latestMention: standupMention,
      latestTranscriptPath: latestStandup?.path || null,
    };

    const sessionPayload = sessionsResult.status === "fulfilled" ? sessionsResult.value : null;
    const latestSession = matchedAgent
      ? ((sessionPayload?.sessions || [])
          .filter((session) => normalizeText(session.agentId) === matchedAgent.id)
          .toSorted((left, right) => sessionTimestampMs(right) - sessionTimestampMs(left))[0] || null)
      : null;

    const activityItems = [
      recentSessionActivity(latestSession, runtime),
      latestBoard,
      recentStandupActivity(standupState),
    ]
      .filter(Boolean)
      .toSorted((left, right) => (Date.parse(right.timestamp || "") || 0) - (Date.parse(left.timestamp || "") || 0))
      .slice(0, 3)
      .map((item, index) => ({
        id: `${member.id}-${item.source}-${index}`,
        kind: item.source === "/api/app/runtime" ? "session" : item.source === "/api/pm-board" ? "board" : "standup",
        timestamp: item.timestamp,
        detail: item.detail,
        href: item.href,
        source: item.source,
      }));

    const humanActivitySummary =
      member.memberKind === "human"
        ? activityItems[0]?.detail || (boardLoad.total || standupMention ? "Human activity is present in board or standup evidence." : "No board or standup activity is available yet.")
        : null;

    return {
      ...member,
      runtime,
      board: boardLoad,
      standup: standupState,
      recentActivity: activityItems,
      recentActivitySummary: activityItems[0]?.detail || (member.memberKind === "ai"
        ? runtime?.detail || "No recent session, board, or standup evidence is available yet."
        : humanActivitySummary || "No recent human activity evidence is available yet."),
      humanActivitySummary,
    };
  });

  const chiefs = members.filter((member) => member.isChief);
  const chiefCounts = chiefs.reduce(
    (accumulator, chief) => {
      const status = chief.runtime?.status || "unavailable";
      accumulator[status] += 1;
      return accumulator;
    },
    { online: 0, offline: 0, unavailable: 0 },
  );

  const orderedMembers = [
    ...members.filter((member) => member.id === "jarvis"),
    ...members.filter((member) => member.isChief).toSorted((left, right) => left.name.localeCompare(right.name)),
    ...members.filter((member) => member.memberKind === "human").toSorted((left, right) => left.name.localeCompare(right.name)),
  ];

  return {
    source: {
      orgChartPath: "data/org-chart.json",
      boardPath: board.source?.path || "/app/mission-control/server/data/execution-tasks.json",
      standupPath: "team/meetings",
      openclawConfigPath: configPath,
    },
    summary: {
      persistentAiSeats: aiMembers.length,
      chiefs: {
        total: chiefs.length,
        online: chiefCounts.online,
        offline: chiefCounts.offline,
        unavailable: chiefCounts.unavailable,
      },
      humans: humanMembers.length,
      openBlockerCount: (board.tasks || []).filter((task) => task.blocked).length,
      lastStandupDate: latestStandupSummary?.date || null,
      lastStandupStatus: latestStandupSummary?.status || null,
      chiefResponseCount: latestStandupSummary?.respondingChiefCount || null,
    },
    latestStandup: latestStandupSummary,
    members: orderedMembers,
  };
}
