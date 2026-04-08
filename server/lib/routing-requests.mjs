import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";

import { getMissionControlRoot, resolveRepoRoot } from "./fs-utils.mjs";
import { updateProjectBoardTask } from "./project-board.mjs";
import { loadStandupArchiveData } from "../loaders/standup-data.mjs";

const STORE_SCHEMA = "sugarandleather.routing-requests.v1";
const REQUEST_STATUS = new Set(["pending", "approved", "rejected", "expired", "applied"]);
const REQUEST_TYPES = new Set([
  "task-assignment-proposal",
  "task-reassignment-proposal",
  "status-change-proposal",
  "escalation-proposal",
  "priority-bump-proposal",
  "dependency-handoff-confirmation",
  "brendan-decision-request",
  "jarvis-routing-approval",
]);
const APPROVAL_TARGETS = new Set(["brendan", "jarvis"]);
const BOARD_PATH = path.join(getMissionControlRoot(), "server", "data", "execution-tasks.json");
const STORE_PATH = path.join(getMissionControlRoot(), "server", "data", "routing-requests.json");
const DEFAULT_PUBLIC_PATH = "/#/approvals";
const DEFAULT_BOARD_PUBLIC_PATH = "/?taskId=%TASK_ID%#/command";

function nowIso() {
  return new Date().toISOString();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeString(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function normalizeStringArray(values) {
  if (!Array.isArray(values)) {return [];}
  return values.map((value) => normalizeString(value)).filter(Boolean);
}

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? clone(value) : {};
}

function slugify(value, fallback = "item") {
  const normalized = normalizeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function hashSeed(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0).toString(36);
}

function storeTemplate() {
  const timestamp = nowIso();
  return {
    schema: STORE_SCHEMA,
    updatedAt: timestamp,
    requests: [],
  };
}

async function readStore() {
  try {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed?.schema !== STORE_SCHEMA || !Array.isArray(parsed?.requests)) {
      return storeTemplate();
    }
    return parsed;
  } catch {
    return storeTemplate();
  }
}

async function writeStore(store) {
  const next = {
    ...store,
    schema: STORE_SCHEMA,
    updatedAt: nowIso(),
  };
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
  await fs.writeFile(STORE_PATH, JSON.stringify(next, null, 2));
  return next;
}

async function readBoardFile() {
  const raw = await fs.readFile(BOARD_PATH, "utf8");
  return JSON.parse(raw);
}

function findTask(boardRecord, taskId) {
  return boardRecord?.tasks?.find((task) => task.id === taskId) || null;
}

function buildApprovalLink(requestId) {
  const publicUrl = normalizeString(process.env.MISSION_CONTROL_PUBLIC_URL || process.env.MISSION_CONTROL_BASE_URL);
  if (!publicUrl) {return null;}
  try {
    const url = new URL(publicUrl);
    url.searchParams.set("commandView", "approvals");
    url.searchParams.set("approvalId", requestId);
    if (!url.hash || url.hash === "#") {
      url.hash = "/command";
    }
    return url.toString();
  } catch {
    const trimmed = publicUrl.replace(/\/$/, "");
    return `${trimmed}${DEFAULT_PUBLIC_PATH}&approvalId=${encodeURIComponent(requestId)}`;
  }
}

async function loadOpenClawTelegramTarget() {
  try {
    const configPath = path.join(os.homedir(), ".openclaw", "openclaw.json");
    const raw = await fs.readFile(configPath, "utf8");
    const parsed = JSON.parse(raw);
    const channel = parsed?.channels?.telegram || parsed?.resolved?.channels?.telegram || {};
    const allowFrom = Array.isArray(channel?.allowFrom) ? channel.allowFrom.map((value) => normalizeString(String(value))).filter(Boolean) : [];
    const approvers = Array.isArray(channel?.execApprovals?.approvers) ? channel.execApprovals.approvers.map((value) => normalizeString(String(value))).filter(Boolean) : [];
    const configuredTarget = normalizeString(channel?.defaultTo || channel?.defaultTarget || channel?.target || channel?.chatId || channel?.chat_id);
    return configuredTarget || approvers[0] || allowFrom[0] || "";
  } catch {
    return "";
  }
}

async function telegramTargetConfig() {
  const target = normalizeString(
    process.env.MISSION_CONTROL_APPROVAL_TELEGRAM_TARGET
      || process.env.MISSION_CONTROL_TELEGRAM_TARGET
      || process.env.APPROVAL_TELEGRAM_TARGET,
  ) || await loadOpenClawTelegramTarget();
  const channel = normalizeString(process.env.MISSION_CONTROL_APPROVAL_CHANNEL || "telegram") || "telegram";
  return {
    target,
    channel,
    available: Boolean(target),
  };
}

function makeAuditEntry({ actorId, actorDisplayName, action, note = "", status = null, metadata = null }) {
  return {
    id: `audit_${randomUUID()}`,
    timestamp: nowIso(),
    actorId: normalizeString(actorId, "system"),
    actorDisplayName: normalizeString(actorDisplayName, actorId || "System"),
    action: normalizeString(action, "updated"),
    note: normalizeString(note),
    status,
    metadata: metadata ? clone(metadata) : null,
  };
}

function dedupeKeyForCandidate(candidate) {
  const seed = JSON.stringify({
    sourceType: candidate.sourceType,
    sourceChiefId: candidate.sourceChiefId,
    sourceAgentId: candidate.sourceAgentId,
    relatedTaskId: candidate.relatedTaskId,
    requestType: candidate.requestType,
    requestedAction: candidate.requestedAction,
    reason: candidate.reason,
    proposedState: candidate.proposedState,
  });
  return `${candidate.sourceChiefId}:${candidate.relatedTaskId || "none"}:${candidate.requestType}:${hashSeed(seed)}`;
}

function normalizeRequest(input) {
  const status = REQUEST_STATUS.has(input.status) ? input.status : "pending";
  const requestType = REQUEST_TYPES.has(input.requestType) ? input.requestType : "brendan-decision-request";
  const approvalTarget = APPROVAL_TARGETS.has(input.approvalTarget) ? input.approvalTarget : "brendan";
  const createdAt = normalizeString(input.createdAt, nowIso());
  const updatedAt = normalizeString(input.updatedAt, createdAt);
  const auditTrail = Array.isArray(input.auditTrail) ? input.auditTrail.map((entry) => ({
    id: normalizeString(entry.id, `audit_${randomUUID()}`),
    timestamp: normalizeString(entry.timestamp, updatedAt),
    actorId: normalizeString(entry.actorId, "system"),
    actorDisplayName: normalizeString(entry.actorDisplayName, entry.actorId || "System"),
    action: normalizeString(entry.action, "updated"),
    note: normalizeString(entry.note),
    status: entry.status ?? null,
    metadata: entry.metadata ? clone(entry.metadata) : null,
  })) : [];

  return {
    id: normalizeString(input.id, `rr_${randomUUID()}`),
    dedupeKey: normalizeString(input.dedupeKey, dedupeKeyForCandidate(input)),
    createdAt,
    updatedAt,
    sourceType: normalizeString(input.sourceType, "manual"),
    sourceChiefId: normalizeString(input.sourceChiefId, "unknown-chief"),
    sourceAgentId: normalizeString(input.sourceAgentId, input.sourceChiefId || "unknown-agent"),
    sourceRecordId: normalizeString(input.sourceRecordId),
    sourceReport: input.sourceReport ? clone(input.sourceReport) : null,
    relatedTaskId: normalizeString(input.relatedTaskId) || null,
    relatedTaskTitle: normalizeString(input.relatedTaskTitle) || null,
    boardPath: normalizeString(input.boardPath, BOARD_PATH),
    requestType,
    requestedAction: normalizeString(input.requestedAction),
    beforeState: normalizeObject(input.beforeState),
    proposedState: normalizeObject(input.proposedState),
    reason: normalizeString(input.reason),
    humanDependency: input.humanDependency ? clone(input.humanDependency) : null,
    requiresApproval: input.requiresApproval !== false,
    approvalTarget,
    approvalLink: normalizeString(input.approvalLink) || buildApprovalLink(input.id || `rr_${randomUUID()}`),
    status,
    decisionAt: normalizeString(input.decisionAt) || null,
    decisionBy: normalizeString(input.decisionBy) || null,
    decisionNote: normalizeString(input.decisionNote) || null,
    appliedAt: normalizeString(input.appliedAt) || null,
    returnPath: input.returnPath ? clone(input.returnPath) : null,
    notification: input.notification ? clone(input.notification) : { channel: "telegram", status: "pending", attemptedAt: null, deliveredAt: null, target: null, lastError: null, command: null },
    auditTrail,
  };
}

function buildBoardTaskLink(taskId) {
  const normalizedTaskId = normalizeString(taskId);
  if (!normalizedTaskId) {return null;}
  const publicUrl = normalizeString(process.env.MISSION_CONTROL_PUBLIC_URL || process.env.MISSION_CONTROL_BASE_URL);
  if (!publicUrl) {
    return DEFAULT_BOARD_PUBLIC_PATH.replace("%TASK_ID%", encodeURIComponent(normalizedTaskId));
  }
  try {
    const url = new URL(publicUrl);
    url.searchParams.set("taskId", normalizedTaskId);
    if (!url.hash || url.hash === "#") {
      url.hash = "/command";
    }
    return url.toString();
  } catch {
    const trimmed = publicUrl.replace(/\/$/, "");
    return `${trimmed}/?taskId=${encodeURIComponent(normalizedTaskId)}#/command`;
  }
}

function requestSummary(request) {
  return `${request.sourceChiefId.toUpperCase()} • ${request.requestType.replace(/-/g, " ")} • ${request.relatedTaskTitle || request.relatedTaskId || "Unlinked task"}`;
}

function taskPatchForRequest(currentTask, request) {
  const proposed = request.proposedState || {};
  const patch = {};

  if (typeof proposed.assigneeId === "string" && proposed.assigneeId && proposed.assigneeId !== currentTask.assigneeId) {
    patch.assigneeId = proposed.assigneeId;
  }
  if (typeof proposed.status === "string" && proposed.status && proposed.status !== currentTask.status) {
    patch.status = proposed.status;
  }
  if (typeof proposed.priority === "string" && proposed.priority && proposed.priority !== currentTask.priority) {
    patch.priority = proposed.priority;
  }
  if (typeof proposed.blocked === "boolean" && proposed.blocked !== currentTask.blocked) {
    patch.blocked = proposed.blocked;
  }
  if ("blockerReason" in proposed) {
    patch.blockerReason = proposed.blockerReason ?? null;
  }
  if (typeof proposed.nextAction === "string" && proposed.nextAction.trim()) {
    patch.nextAction = proposed.nextAction.trim();
  }
  if (Array.isArray(proposed.dependencies)) {
    const merged = [...new Set([...(currentTask.dependencies || []), ...normalizeStringArray(proposed.dependencies)])];
    patch.dependencies = merged;
  }
  if (Array.isArray(proposed.sourceRefs)) {
    const merged = [...new Set([...(currentTask.sourceRefs || []), ...normalizeStringArray(proposed.sourceRefs)])];
    patch.sourceRefs = merged;
  }
  if (typeof proposed.executionMode === "string" && proposed.executionMode) {
    patch.executionMode = proposed.executionMode;
  }
  if (typeof proposed.deliverableLink === "string" || proposed.deliverableLink === null) {
    patch.deliverableLink = proposed.deliverableLink;
  }
  return patch;
}

function buildNotificationMessage(request) {
  const beforeState = request.beforeState || {};
  const proposedState = request.proposedState || {};
  const currentState = Object.keys(beforeState).length ? JSON.stringify(beforeState, null, 2) : "{}";
  const nextState = Object.keys(proposedState).length ? JSON.stringify(proposedState, null, 2) : "{}";
  const approvalLink = request.approvalLink ? `\nApproval: ${request.approvalLink}` : "";
  const boardLink = request.relatedTaskId ? `\nBoard task: ${buildBoardTaskLink(request.relatedTaskId)}` : "";
  return [
    `Mission Control approval needed`,
    `Chief: ${request.sourceChiefId}${request.sourceAgentId ? ` (${request.sourceAgentId})` : ""}`,
    `Task: ${request.relatedTaskId || "unlinked"}${request.relatedTaskTitle ? ` — ${request.relatedTaskTitle}` : ""}`,
    `Action: ${request.requestedAction}`,
    `Reason: ${request.reason || "No reason provided."}`,
    `Current: ${currentState}`,
    `Proposed: ${nextState}`,
    request.humanDependency?.summary ? `Dependency: ${request.humanDependency.summary}` : null,
    approvalLink || null,
    boardLink || null,
  ].filter(Boolean).join("\n");
}

function determineApprovalPolicy({ requestType, beforeState, proposedState, currentTask }) {
  const context = [
    requestType,
    currentTask?.systemScope,
    currentTask?.title,
    currentTask?.description,
    currentTask?.nextAction,
    currentTask?.blockerReason,
    beforeState?.owner,
    beforeState?.assigneeId,
    proposedState?.owner,
    proposedState?.assigneeId,
  ].filter(Boolean).join("\n");

  if (/\bopenclaw\b|docker-compose|docker compose|compose\.ya?ml|(^|[^a-z])env([^a-z]|$)|\.env\b|environment variable/i.test(context)) {
    return { requiresApproval: true, approvalTarget: "brendan", rationale: "Protected-system or environment changes require Brendan approval." };
  }

  if (requestType === "brendan-decision-request") {
    return { requiresApproval: true, approvalTarget: "brendan", rationale: "Explicit Brendan decision requests stay gated for review." };
  }

  if (requestType === "dependency-handoff-confirmation") {
    return { requiresApproval: true, approvalTarget: "brendan", rationale: "Human handoff requests stay gated until Brendan confirms them." };
  }

  if (/\b(send|message|notify|email|slack|telegram|discord|sms|call|dm)\b/i.test(context) && !/\bbrendan\b/i.test(context)) {
    return { requiresApproval: true, approvalTarget: "brendan", rationale: "Outbound messages to people other than Brendan require approval." };
  }

  return { requiresApproval: false, approvalTarget: null, rationale: "Mission Control can apply this change autonomously." };
}
function openClawBinaryPath() {
  return process.env.MISSION_CONTROL_OPENCLAW_BIN || "/usr/local/bin/openclaw";
}

async function sendTelegramNotification(request) {
  const config = await telegramTargetConfig();
  const attemptedAt = nowIso();
  if (!config.available) {
    return {
      channel: config.channel,
      target: null,
      status: "unavailable",
      attemptedAt,
      deliveredAt: null,
      lastError: "No Telegram approval target was found from mission-control env or OpenClaw Telegram allowFrom/default target.",
      command: null,
    };
  }

  const binary = openClawBinaryPath();
  const args = [
    "message",
    "send",
    "--channel",
    config.channel,
    "--target",
    config.target,
    "--message",
    buildNotificationMessage(request),
  ];

  return new Promise((resolve) => {
    const child = spawn(binary, args, {
      cwd: getMissionControlRoot(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      resolve({
        channel: config.channel,
        target: config.target,
        status: "failed",
        attemptedAt,
        deliveredAt: null,
        lastError: "Timed out sending Telegram approval notification.",
        command: `${binary} ${args.join(" ")}`,
        stdout,
        stderr,
      });
    }, 90000);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({
        channel: config.channel,
        target: config.target,
        status: "failed",
        attemptedAt,
        deliveredAt: null,
        lastError: error.message,
        command: `${binary} ${args.join(" ")}`,
        stdout,
        stderr,
      });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        channel: config.channel,
        target: config.target,
        status: code === 0 ? "delivered" : "failed",
        attemptedAt,
        deliveredAt: code === 0 ? nowIso() : null,
        lastError: code === 0 ? null : (stderr.trim() || stdout.trim() || `${binary} exited with code ${code}`),
        command: `${binary} ${args.join(" ")}`,
        stdout: stdout.trim() || null,
        stderr: stderr.trim() || null,
      });
    });
  });
}

function sectionLines(markdown, labels) {
  const lines = String(markdown || "").split(/\r?\n/);
  const normalizedLabels = labels.map((label) => label.toLowerCase());
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    const lowered = line.replace(/^[-*]\s*/, "").toLowerCase();
    const matched = normalizedLabels.find((label) => lowered.startsWith(`${label.toLowerCase()}:`));
    if (!matched) {continue;}
    const collected = [];
    const afterColon = line.split(":").slice(1).join(":").trim();
    if (afterColon) {collected.push(afterColon);}
    for (let next = index + 1; next < lines.length; next += 1) {
      const candidate = lines[next];
      if (/^[-*]\s+/.test(candidate.trim())) {
        collected.push(candidate.replace(/^[-*]\s+/, "").trim());
        continue;
      }
      if (!candidate.trim()) {
        continue;
      }
      if (/^#{1,6}\s+/.test(candidate) || /^[A-Z][A-Za-z\s]+:$/.test(candidate.trim())) {
        break;
      }
      collected.push(candidate.trim());
    }
    return collected.filter(Boolean);
  }
  return [];
}

function findTaskIdInText(value) {
  const match = String(value || "").match(/`([a-z0-9][a-z0-9-]+)`/i) || String(value || "").match(/\b([a-z0-9]+(?:-[a-z0-9]+){2,})\b/i);
  return match?.[1] || null;
}

function parseStatus(value) {
  const match = String(value || "").toLowerCase().match(/\b(intake|scoping|ready|active|review|shipped|follow-up)\b/);
  return match?.[1] || null;
}

function deriveCandidatesFromStructuredReport(report, boardRecord) {
  const requests = [];
  const taskId = normalizeString(report.activeTaskId) || findTaskIdInText(report.activeTask || report.summary || report.rawMarkdown || "");
  const task = taskId ? findTask(boardRecord, taskId) : null;
  const currentStatus = parseStatus(report.currentStatus || report.current_state || report.summary || report.rawMarkdown || "");

  if (task && currentStatus && task.status !== currentStatus) {
    requests.push({
      sourceType: report.sourceType || "standup",
      sourceChiefId: report.chiefId,
      sourceAgentId: report.chiefAgentId || report.chiefId,
      sourceRecordId: report.reportId || report.id || `${report.chiefId}-${slugify(report.generatedAt || report.createdAt || nowIso())}`,
      sourceReport: report,
      relatedTaskId: task.id,
      relatedTaskTitle: task.title,
      boardPath: BOARD_PATH,
      requestType: "status-change-proposal",
      requestedAction: `Align board status from ${task.status} to ${currentStatus}`,
      beforeState: { status: task.status },
      proposedState: { status: currentStatus },
      reason: `Chief report says the task is currently ${currentStatus}, but the board still shows ${task.status}.`,
      humanDependency: null,
      requiresApproval: true,
      approvalTarget: "brendan",
      returnPath: { chiefId: report.chiefId, actorId: report.chiefAgentId || report.chiefId },
      auditTrail: [],
    });
  }

  const humanDependencies = Array.isArray(report.humanDependencies) ? report.humanDependencies : [];
  humanDependencies.forEach((dependency) => {
    if (!task) {return;}
    const summary = normalizeString(dependency.summary || dependency.reason || dependency.note || dependency);
    if (!summary) {return;}
    requests.push({
      sourceType: report.sourceType || "standup",
      sourceChiefId: report.chiefId,
      sourceAgentId: report.chiefAgentId || report.chiefId,
      sourceRecordId: report.reportId || report.id || `${report.chiefId}-${slugify(report.generatedAt || report.createdAt || nowIso())}`,
      sourceReport: report,
      relatedTaskId: task.id,
      relatedTaskTitle: task.title,
      boardPath: BOARD_PATH,
      requestType: dependency.type === "dependency-handoff-confirmation" ? "dependency-handoff-confirmation" : "brendan-decision-request",
      requestedAction: dependency.requestedAction || "Confirm human dependency before routing continues",
      beforeState: { dependencies: task.dependencies, nextAction: task.nextAction },
      proposedState: {
        dependencies: [summary],
        nextAction: dependency.nextAction || `Await Brendan decision: ${summary}`,
      },
      reason: summary,
      humanDependency: {
        target: normalizeString(dependency.target || "brendan"),
        summary,
      },
      requiresApproval: true,
      approvalTarget: "brendan",
      returnPath: { chiefId: report.chiefId, actorId: report.chiefAgentId || report.chiefId },
      auditTrail: [],
    });
  });

  const jarvisRouting = Array.isArray(report.needsJarvisRouting) ? report.needsJarvisRouting : [];
  jarvisRouting.forEach((item) => {
    if (!task) {return;}
    const summary = normalizeString(item.summary || item.reason || item.note || item);
    if (!summary) {return;}
    requests.push({
      sourceType: report.sourceType || "standup",
      sourceChiefId: report.chiefId,
      sourceAgentId: report.chiefAgentId || report.chiefId,
      sourceRecordId: report.reportId || report.id || `${report.chiefId}-${slugify(report.generatedAt || report.createdAt || nowIso())}`,
      sourceReport: report,
      relatedTaskId: task.id,
      relatedTaskTitle: task.title,
      boardPath: BOARD_PATH,
      requestType: "jarvis-routing-approval",
      requestedAction: item.requestedAction || "Escalate blocker handling to Jarvis",
      beforeState: { blocked: task.blocked, blockerReason: task.blockerReason, nextAction: task.nextAction },
      proposedState: {
        blocked: true,
        blockerReason: summary,
        nextAction: item.nextAction || `Jarvis to route upstream blocker after approval: ${summary}`,
      },
      reason: summary,
      humanDependency: null,
      requiresApproval: true,
      approvalTarget: "brendan",
      returnPath: { chiefId: report.chiefId, actorId: report.chiefAgentId || report.chiefId },
      auditTrail: [],
    });
  });

  const reassignmentProposals = Array.isArray(report.reassignmentProposals) ? report.reassignmentProposals : [];
  reassignmentProposals.forEach((proposal) => {
    if (!task) {return;}
    const assigneeId = normalizeString(proposal.assigneeId);
    if (!assigneeId || assigneeId === task.assigneeId) {return;}
    requests.push({
      sourceType: report.sourceType || "standup",
      sourceChiefId: report.chiefId,
      sourceAgentId: report.chiefAgentId || report.chiefId,
      sourceRecordId: report.reportId || report.id || `${report.chiefId}-${slugify(report.generatedAt || report.createdAt || nowIso())}`,
      sourceReport: report,
      relatedTaskId: task.id,
      relatedTaskTitle: task.title,
      boardPath: BOARD_PATH,
      requestType: "task-reassignment-proposal",
      requestedAction: proposal.requestedAction || `Reassign task to ${assigneeId}`,
      beforeState: { assigneeId: task.assigneeId },
      proposedState: { assigneeId },
      reason: normalizeString(proposal.reason, `Chief requested reassignment to ${assigneeId}.`),
      humanDependency: null,
      requiresApproval: true,
      approvalTarget: "brendan",
      returnPath: { chiefId: report.chiefId, actorId: report.chiefAgentId || report.chiefId },
      auditTrail: [],
    });
  });

  const priorityBumps = Array.isArray(report.priorityBumps) ? report.priorityBumps : [];
  priorityBumps.forEach((proposal) => {
    if (!task) {return;}
    const priority = normalizeString(proposal.priority);
    if (!priority || priority === task.priority) {return;}
    requests.push({
      sourceType: report.sourceType || "standup",
      sourceChiefId: report.chiefId,
      sourceAgentId: report.chiefAgentId || report.chiefId,
      sourceRecordId: report.reportId || report.id || `${report.chiefId}-${slugify(report.generatedAt || report.createdAt || nowIso())}`,
      sourceReport: report,
      relatedTaskId: task.id,
      relatedTaskTitle: task.title,
      boardPath: BOARD_PATH,
      requestType: "priority-bump-proposal",
      requestedAction: proposal.requestedAction || `Raise task priority to ${priority}`,
      beforeState: { priority: task.priority },
      proposedState: { priority },
      reason: normalizeString(proposal.reason, `Chief requested priority change to ${priority}.`),
      humanDependency: null,
      requiresApproval: true,
      approvalTarget: "brendan",
      returnPath: { chiefId: report.chiefId, actorId: report.chiefAgentId || report.chiefId },
      auditTrail: [],
    });
  });

  return requests;
}

function chiefReportFromStandupRecord(standupItem, chief) {
  const activeTask = sectionLines(chief.markdown, ["Active task", "Task"])[0] || null;
  const currentStatus = sectionLines(chief.markdown, ["Task currently", "Current status", "Status"])[0] || null;
  const humanDependencies = sectionLines(chief.markdown, ["Human Dependencies", "Human dependency", "Needs Brendan decision"]).map((entry) => ({ summary: entry, target: "brendan" }));
  const needsJarvisRouting = sectionLines(chief.markdown, ["Needs Jarvis Routing", "Needs Jarvis routing", "Jarvis routing"]).map((entry) => ({ summary: entry }));
  if (!activeTask && !currentStatus && !humanDependencies.length && !needsJarvisRouting.length) {
    return null;
  }
  return {
    sourceType: "standup",
    reportId: `${standupItem.id}:${chief.chiefId}`,
    generatedAt: standupItem.generatedAt,
    chiefId: chief.chiefId,
    chiefAgentId: chief.agentId || chief.chiefId,
    boardPath: standupItem.boardPath || BOARD_PATH,
    activeTaskId: findTaskIdInText(activeTask),
    activeTask,
    currentStatus,
    humanDependencies,
    needsJarvisRouting,
    rawMarkdown: chief.markdown,
    standupId: standupItem.id,
    standupTitle: standupItem.title,
    standupPath: standupItem.path,
  };
}

async function ensureRequestMaterialized(store, candidate) {
  const dedupeKey = dedupeKeyForCandidate(candidate);
  const existing = store.requests.find((request) => request.dedupeKey === dedupeKey);
  if (existing) {
    if (existing.status === "pending") {
      const boardRecord = await readBoardFile();
      const currentTask = existing.relatedTaskId ? findTask(boardRecord, existing.relatedTaskId) : null;
      const policy = determineApprovalPolicy({
        requestType: existing.requestType,
        beforeState: existing.beforeState,
        proposedState: existing.proposedState,
        currentTask,
      });
      existing.requiresApproval = policy.requiresApproval;
      existing.approvalTarget = policy.approvalTarget;
      existing.rationale = policy.rationale;
      existing.updatedAt = nowIso();

      if (!existing.requiresApproval && currentTask) {
        await updateProjectBoardTask(existing.relatedTaskId, {
          updates: taskPatchForRequest(currentTask, existing),
          actorId: "jarvis",
        });
        existing.status = "applied";
        existing.appliedAt = nowIso();
        existing.updatedAt = existing.appliedAt;
      }

      await writeStore(store);
    }
    return { store, request: existing, created: false };
  }

  const boardRecord = await readBoardFile();
  const currentTask = candidate.relatedTaskId ? findTask(boardRecord, candidate.relatedTaskId) : null;
  const policy = determineApprovalPolicy({
    requestType: candidate.requestType,
    beforeState: candidate.beforeState,
    proposedState: candidate.proposedState,
    currentTask,
  });
  const requestId = `rr_${slugify(candidate.sourceChiefId)}_${hashSeed(`${dedupeKey}:${candidate.summary}`).slice(0, 10)}`;
  const request = {
    id: requestId,
    dedupeKey,
    requestType: candidate.requestType,
    status: policy.requiresApproval ? "pending" : "applied",
    title: candidate.title,
    summary: candidate.summary,
    rationale: policy.rationale,
    proposedState: candidate.proposedState,
    beforeState: candidate.beforeState,
    relatedTaskId: candidate.relatedTaskId || null,
    sourceChiefId: candidate.sourceChiefId,
    sourceSessionKey: candidate.sourceSessionKey || null,
    approvalTarget: policy.approvalTarget,
    requiresApproval: policy.requiresApproval,
    approvalLink: policy.requiresApproval ? buildApprovalLink(requestId) : null,
    createdAt: timestamp(),
    updatedAt: timestamp(),
    expiresAt: null,
    auditTrail: [],
    notifiedAt: null,
    requestedBy: candidate.requestedBy || candidate.sourceChiefId,
  };

  store.requests.unshift(request);

  if (!policy.requiresApproval && currentTask) {
    await updateProjectBoardTask({
      taskId: request.relatedTaskId,
      updates: taskPatchForRequest(currentTask, request),
      actorId: "jarvis",
    });
    request.status = "applied";
    request.appliedAt = timestamp();
    request.updatedAt = request.appliedAt;
  }

  await writeStore(store);
  return { store, request, created: true };
}

export async function syncRoutingRequestsFromStandups() {
  const boardRecord = await readBoardFile();
  const standups = await loadStandupArchiveData();
  let store = await readStore();
  const created = [];

  for (const standupItem of standups.items || []) {
    for (const chief of standupItem.chiefs || []) {
      const report = chiefReportFromStandupRecord(standupItem, chief);
      if (!report) {continue;}
      const candidates = deriveCandidatesFromStructuredReport(report, boardRecord);
      for (const candidate of candidates) {
        const result = await ensureRequestMaterialized(store, candidate);
        store = result.store;
        if (result.created) {
          created.push(result.request.id);
        }
      }
    }
  }

  await writeStore(store);
  return { store, created };
}

export async function ingestChiefReport(reportInput) {
  const report = normalizeObject(reportInput);
  const chiefId = normalizeString(report.chiefId || report.sourceChiefId);
  if (!chiefId) {
    throw new Error("chiefId is required.");
  }

  const boardRecord = await readBoardFile();
  const store = await readStore();
  const candidateReport = {
    ...report,
    chiefId,
    chiefAgentId: normalizeString(report.chiefAgentId || report.sourceAgentId || chiefId),
    sourceType: normalizeString(report.sourceType, "manual"),
  };

  const candidates = deriveCandidatesFromStructuredReport(candidateReport, boardRecord);
  const created = [];
  let nextStore = store;
  for (const candidate of candidates) {
    const result = await ensureRequestMaterialized(nextStore, candidate);
    nextStore = result.store;
    if (result.created) {created.push(result.request.id);}
  }

  await writeStore(nextStore);
  return {
    ingested: candidateReport,
    createdRequestIds: created,
    requests: nextStore.requests.filter((request) => created.includes(request.id)),
  };
}

async function reconcileStoredRequests(store) {
  const boardRecord = await readBoardFile();
  let changed = false;

  for (const request of store.requests) {
    if (request.status !== "pending") {continue;}

    const currentTask = request.relatedTaskId ? findTask(boardRecord, request.relatedTaskId) : null;
    const policy = determineApprovalPolicy({
      requestType: request.requestType,
      beforeState: request.beforeState,
      proposedState: request.proposedState,
      currentTask,
    });

    if (request.requiresApproval !== policy.requiresApproval || request.approvalTarget !== policy.approvalTarget || request.rationale !== policy.rationale) {
      request.requiresApproval = policy.requiresApproval;
      request.approvalTarget = policy.approvalTarget;
      request.rationale = policy.rationale;
      request.updatedAt = nowIso();
      changed = true;
    }

    if (!request.requiresApproval) {
      if (currentTask) {
        await updateProjectBoardTask(request.relatedTaskId, {
          updates: taskPatchForRequest(currentTask, request),
          actorId: "jarvis",
        });
        request.status = "applied";
        request.appliedAt = nowIso();
        request.updatedAt = request.appliedAt;
      } else {
        request.status = "expired";
        request.updatedAt = nowIso();
      }
      changed = true;
    }
  }

  if (changed) {
    await writeStore(store);
  }
  return store;
}

export async function loadRoutingRequestsPayload() {
  const { store: syncedStore } = await syncRoutingRequestsFromStandups();
  const store = await reconcileStoredRequests(syncedStore);
  const requests = [...store.requests].toSorted((left, right) => (Date.parse(right.updatedAt) || 0) - (Date.parse(left.updatedAt) || 0));
  const chiefs = [...new Set(requests.map((request) => request.sourceChiefId))].toSorted();
  const requestTypes = [...new Set(requests.map((request) => request.requestType))].toSorted();
  const tasks = [...new Set(requests.map((request) => request.relatedTaskId).filter(Boolean))].toSorted();
  return {
    source: {
      kind: "mission-control-routing-requests",
      updatedAt: store.updatedAt,
      path: path.relative(resolveRepoRoot(), STORE_PATH).replace(/\\/g, "/"),
      boardPath: BOARD_PATH,
    },
    stats: {
      total: requests.length,
      pending: requests.filter((request) => request.status === "pending").length,
      applied: requests.filter((request) => request.status === "applied").length,
      rejected: requests.filter((request) => request.status === "rejected").length,
      approvalRequired: requests.filter((request) => request.requiresApproval).length,
      telegramDelivered: requests.filter((request) => request.notification?.status === "delivered").length,
      telegramUnavailable: requests.filter((request) => ["unavailable", "failed"].includes(request.notification?.status)).length,
    },
    filterOptions: {
      statuses: ["pending", "approved", "rejected", "expired", "applied"],
      chiefs,
      requestTypes,
      tasks,
    },
    requests,
  };
}

export async function approveRoutingRequest(requestId, input = {}) {
  const actorId = normalizeString(input.actorId, "brendan");
  const actorDisplayName = normalizeString(input.actorDisplayName, actorId);
  const decisionNote = normalizeString(input.decisionNote);
  const store = await readStore();
  const request = store.requests.find((entry) => entry.id === requestId);
  if (!request) {
    throw new Error(`Routing request not found: ${requestId}`);
  }
  if (request.status !== "pending") {
    throw new Error(`Routing request ${requestId} is already ${request.status}.`);
  }

  request.status = "approved";
  request.decisionAt = nowIso();
  request.decisionBy = actorId;
  request.decisionNote = decisionNote || null;
  request.updatedAt = nowIso();
  request.auditTrail.push(makeAuditEntry({
    actorId,
    actorDisplayName,
    action: "approved",
    note: decisionNote || "Approved for application.",
    status: "approved",
  }));

  const boardRecord = await readBoardFile();
  const currentTask = request.relatedTaskId ? findTask(boardRecord, request.relatedTaskId) : null;
  if (currentTask) {
    const patch = taskPatchForRequest(currentTask, request);
    if (Object.keys(patch).length > 0) {
      await updateProjectBoardTask(request.relatedTaskId, {
        actorId,
        updates: patch,
        note: decisionNote || `Applied from routing request ${request.id}: ${request.requestedAction}`,
      });
    }
    request.status = "applied";
    request.appliedAt = nowIso();
    request.updatedAt = nowIso();
    request.auditTrail.push(makeAuditEntry({
      actorId,
      actorDisplayName,
      action: "applied",
      note: `Board updated for ${request.relatedTaskId}.`,
      status: "applied",
      metadata: { patch },
    }));
  }

  await writeStore(store);
  return request;
}

export async function rejectRoutingRequest(requestId, input = {}) {
  const actorId = normalizeString(input.actorId, "brendan");
  const actorDisplayName = normalizeString(input.actorDisplayName, actorId);
  const decisionNote = normalizeString(input.decisionNote);
  const store = await readStore();
  const request = store.requests.find((entry) => entry.id === requestId);
  if (!request) {
    throw new Error(`Routing request not found: ${requestId}`);
  }
  if (request.status !== "pending") {
    throw new Error(`Routing request ${requestId} is already ${request.status}.`);
  }

  request.status = "rejected";
  request.decisionAt = nowIso();
  request.decisionBy = actorId;
  request.decisionNote = decisionNote || null;
  request.updatedAt = nowIso();
  request.auditTrail.push(makeAuditEntry({
    actorId,
    actorDisplayName,
    action: "rejected",
    note: decisionNote || "Rejected.",
    status: "rejected",
  }));

  await writeStore(store);
  return request;
}

export async function readRoutingRequestStore() {
  return readStore();
}
