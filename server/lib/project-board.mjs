import fs from "node:fs/promises";
import path from "node:path";
import { getMissionControlRoot, readJson, resolveRepoRoot, toIso } from "./fs-utils.mjs";

const missionControlRoot = getMissionControlRoot();
const repoRoot = resolveRepoRoot();
const boardPath = path.join(missionControlRoot, "server", "data", "execution-tasks.json");
const orgChartPath = path.join(repoRoot, "data", "org-chart.json");
const staleAfterDays = 5;
const staleAfterMs = staleAfterDays * 24 * 60 * 60 * 1000;

export const PROJECT_BOARD_STATUSES = ["intake", "scoping", "ready", "active", "review", "shipped", "follow-up"];
export const PROJECT_BOARD_PRIORITIES = ["P0", "P1", "P2", "P3"];
export const PROJECT_BOARD_SYSTEM_SCOPES = ["aries-app", "mission-control", "openclaw", "operations", "knowledge", "runtime"];
export const PROJECT_BOARD_TASK_DOMAINS = [
  "frontend",
  "backend",
  "runtime-automation",
  "operations-knowledge",
  "manual-ops",
  "mission-control",
  "openclaw-change",
];
export const PROJECT_BOARD_EXECUTION_MODES = ["standard", "brendan-only", "proposal-for-brendan-review"];
export const ASSIGNEE_TYPES = ["human-authority", "ai-orchestrator", "chief", "ai-specialist", "human-collaborator"];

const AI_ASSIGNEE_TYPES = new Set(["ai-orchestrator", "chief", "ai-specialist"]);
const EMOJI_BY_ID = {
  brendan: "👑",
  jarvis: "🜂",
  forge: "🔥",
  signal: "📡",
  ledger: "📚",
  rohan: "🎨",
  roy: "🧰",
  somwya: "📝",
  "frontend-specialist": "🖥️",
  "backend-specialist": "🧩",
  "integration-qa-specialist": "🧪",
  "release-readiness-specialist": "🚦",
  "scheduler-health-analyst": "⏱️",
  "flow-lobster-observer": "🦞",
  "model-usage-cost-analyst": "💸",
  "runtime-incident-triage-specialist": "🚨",
  "briefing-steward": "🗂️",
  "memory-curator": "🧠",
  "handoff-qa-auditor": "🔍",
  "manual-ops-coordinator": "📋",
};

function boardSystemActor() {
  return {
    id: "board-system",
    name: "Board system",
    displayName: "🧭 Board system",
    label: "🧭 Board system — migration / automation",
    emoji: "🧭",
    assigneeType: "system",
    title: "Board migration / automation",
    department: "Mission Control",
    parentChiefId: null,
  };
}

function slugify(value) {
  return String(value || "task")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "task";
}

function asTrimmedString(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function asOptionalString(value) {
  const trimmed = asTrimmedString(value);
  return trimmed ? trimmed : null;
}

function asStringArray(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => asTrimmedString(entry)).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/\n|,/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function actorRef(actor) {
  return {
    actorId: actor.id,
    actorDisplayName: actor.displayName,
    actorType: actor.assigneeType,
  };
}

function statusLabel(status) {
  return status.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function domainLabel(domain) {
  return domain.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeLegacyStatus(status, blocked) {
  if (PROJECT_BOARD_STATUSES.includes(status)) return status;
  if (status === "todo") return "intake";
  if (status === "in_progress") return "active";
  if (status === "done") return "shipped";
  if (status === "blocked") return "active";
  return blocked ? "active" : "intake";
}

function inferTaskDomain(rawTask) {
  if (PROJECT_BOARD_TASK_DOMAINS.includes(rawTask.taskDomain)) return rawTask.taskDomain;

  const scope = asTrimmedString(rawTask.systemScope).toLowerCase();
  const workstream = asTrimmedString(rawTask.workstream).toLowerCase();
  const owner = asTrimmedString(rawTask.owner || rawTask.assigneeId).toLowerCase();
  const title = `${asTrimmedString(rawTask.title)} ${asTrimmedString(rawTask.description)}`.toLowerCase();
  const combined = `${scope} ${workstream} ${owner} ${title}`;

  if (scope === "mission-control" || /mission control/.test(combined)) return "mission-control";
  if (scope === "openclaw" || /openclaw/.test(combined)) return "openclaw-change";
  if (/\bfrontend\b|ui|ux|layout|client/.test(combined) || owner === "rohan") return "frontend";
  if (/\bbackend\b|api|adapter|server|db|database|integration/.test(combined) || owner === "roy") return "backend";
  if (/manual|qa checklist|human-required|human required/.test(combined) || owner === "somwya") return "manual-ops";
  if (scope === "runtime" || /runtime|cron|scheduler|session|taskflow|model usage|health/.test(combined)) return "runtime-automation";
  if (scope === "knowledge" || scope === "operations" || /brief|memory|handoff|knowledge|ops/.test(combined)) return "operations-knowledge";
  return "frontend";
}

function inferSystemScope(rawTask, taskDomain) {
  if (PROJECT_BOARD_SYSTEM_SCOPES.includes(rawTask.systemScope)) return rawTask.systemScope;
  if (taskDomain === "mission-control") return "mission-control";
  if (taskDomain === "openclaw-change") return "openclaw";
  if (taskDomain === "runtime-automation") return "runtime";
  if (taskDomain === "operations-knowledge") return "knowledge";
  if (taskDomain === "manual-ops") return "operations";
  return "aries-app";
}

function inferExecutionMode(rawTask, taskDomain, systemScope) {
  if (PROJECT_BOARD_EXECUTION_MODES.includes(rawTask.executionMode)) return rawTask.executionMode;
  if (taskDomain === "openclaw-change" || systemScope === "openclaw") {
    return "proposal-for-brendan-review";
  }
  return "standard";
}

function resolveActorId(value, directory) {
  const normalized = asTrimmedString(value).toLowerCase();
  if (!normalized) return null;
  if (directory.byId.has(normalized)) return normalized;

  for (const actor of directory.actors) {
    const candidates = [actor.id, actor.name, actor.displayName, actor.label, actor.title]
      .map((entry) => asTrimmedString(entry).toLowerCase())
      .filter(Boolean);
    if (candidates.includes(normalized)) {
      return actor.id;
    }
  }

  return null;
}

function allowedAssigneeIdsFor(task, directory) {
  const actors = directory.assignableActors;
  if (task.taskDomain === "openclaw-change" || task.systemScope === "openclaw") {
    return ["brendan"];
  }

  if (task.taskDomain === "manual-ops") {
    return ["somwya"];
  }

  const aiActors = actors.filter((actor) => AI_ASSIGNEE_TYPES.has(actor.assigneeType)).map((actor) => actor.id);

  if (task.taskDomain === "frontend") {
    return unique([...aiActors, "rohan"]);
  }

  if (task.taskDomain === "backend") {
    return unique([...aiActors, "roy"]);
  }

  return aiActors;
}

function allowedAssigneeTypesFor(task, directory) {
  return unique(
    allowedAssigneeIdsFor(task, directory)
      .map((actorId) => directory.byId.get(actorId)?.assigneeType)
      .filter(Boolean),
  );
}

function routingRuleFor(task) {
  if (task.taskDomain === "openclaw-change" || task.systemScope === "openclaw") {
    return "OpenClaw change tasks are Brendan-only, or non-executable proposals for Brendan review.";
  }
  if (task.taskDomain === "mission-control" || task.systemScope === "mission-control") {
    return "Mission Control tasks are AI-only and may be assigned only to Jarvis, AI chiefs, or AI specialist slots.";
  }
  if (task.taskDomain === "frontend") {
    return "Aries frontend tasks may route to Rohan or AI assignees under Jarvis control.";
  }
  if (task.taskDomain === "backend") {
    return "Aries backend tasks may route to Roy or AI assignees under Jarvis control.";
  }
  if (task.taskDomain === "manual-ops") {
    return "Manual / non-coding work routes to Somwya only.";
  }
  if (task.taskDomain === "runtime-automation") {
    return "Runtime & automation work stays with AI assignees so Mission Control and visibility lanes remain protected.";
  }
  return "Operations & knowledge work stays with Jarvis, AI chiefs, or AI specialist slots unless the task is explicitly manual.";
}

function assertEnum(value, options, fieldName) {
  if (!options.includes(value)) {
    throw validationError(`${fieldName} must be one of: ${options.join(", ")}.`, { field: fieldName, allowed: options });
  }
}

function validationError(message, details = {}) {
  const error = new Error(message);
  error.name = "ValidationError";
  error.status = 400;
  error.details = details;
  return error;
}

function mapActor(actor, includeAssignable = true) {
  return {
    id: actor.id,
    label: actor.label,
    displayName: actor.displayName,
    emoji: actor.emoji,
    assigneeType: actor.assigneeType,
    title: actor.title,
    department: actor.department,
    parentChiefId: actor.parentChiefId,
    assignable: includeAssignable,
  };
}

function ensureValidAssignment(task, directory) {
  const actor = directory.byId.get(task.assigneeId);
  if (!actor) {
    throw validationError(`Unknown assignee: ${task.assigneeId}.`, { field: "assigneeId" });
  }

  const allowedIds = allowedAssigneeIdsFor(task, directory);
  if (!allowedIds.includes(task.assigneeId)) {
    const allowedAssignees = allowedIds
      .map((actorId) => directory.byId.get(actorId))
      .filter(Boolean)
      .map((entry) => ({ id: entry.id, displayName: entry.displayName, label: entry.label }));

    throw validationError(
      `${actor.displayName} cannot be assigned to this ${task.systemScope} / ${task.taskDomain} task. ${routingRuleFor(task)}`,
      {
        field: "assigneeId",
        assigneeId: task.assigneeId,
        assigneeDisplayName: actor.displayName,
        allowedAssigneeIds: allowedIds,
        allowedAssignees,
        routingRule: routingRuleFor(task),
      },
    );
  }

  if (task.systemScope === "mission-control" && !AI_ASSIGNEE_TYPES.has(actor.assigneeType)) {
    throw validationError("Mission Control tasks are AI-only.", {
      field: "assigneeId",
      assigneeId: task.assigneeId,
      routingRule: routingRuleFor(task),
    });
  }

  if (task.systemScope === "openclaw") {
    if (task.assigneeId !== "brendan") {
      throw validationError("OpenClaw work must stay with Brendan.", {
        field: "assigneeId",
        routingRule: routingRuleFor(task),
      });
    }
    if (!new Set(["brendan-only", "proposal-for-brendan-review"]).has(task.executionMode)) {
      throw validationError("OpenClaw work must be marked Brendan-only or Proposal for Brendan review.", {
        field: "executionMode",
        routingRule: routingRuleFor(task),
      });
    }
  }

  if (task.systemScope !== "openclaw" && task.executionMode !== "standard") {
    throw validationError("Only OpenClaw work may use Brendan-only or Proposal for Brendan review execution modes.", {
      field: "executionMode",
      routingRule: routingRuleFor(task),
    });
  }

  return actor;
}

function computeStale(updatedAt) {
  const updatedMs = Date.parse(updatedAt || "");
  if (!Number.isFinite(updatedMs)) {
    return { stale: false, staleDays: 0 };
  }
  const diff = Date.now() - updatedMs;
  return {
    stale: diff >= staleAfterMs,
    staleDays: Math.max(0, Math.floor(diff / (24 * 60 * 60 * 1000))),
  };
}

function enrichTask(task, directory) {
  const actor = directory.byId.get(task.assigneeId);
  const staleState = computeStale(task.updatedAt);
  const allowedAssigneeIds = allowedAssigneeIdsFor(task, directory);
  const allowedAssigneeTypes = allowedAssigneeTypesFor(task, directory);

  return {
    ...task,
    assigneeType: actor?.assigneeType ?? task.assigneeType,
    assigneeDisplayName: actor?.displayName ?? task.assigneeDisplayName,
    allowedAssigneeIds,
    allowedAssigneeTypes,
    routingRule: routingRuleFor(task),
    stale: staleState.stale,
    staleDays: staleState.staleDays,
  };
}

function ensureUniqueId(baseId, tasks) {
  const existing = new Set(tasks.map((task) => task.id));
  if (!existing.has(baseId)) return baseId;
  let counter = 2;
  while (existing.has(`${baseId}-${counter}`)) {
    counter += 1;
  }
  return `${baseId}-${counter}`;
}

function normalizeTaskForStorage(rawTask, directory, actor, options = {}) {
  const now = options.now ?? toIso(Date.now());
  const taskDomain = inferTaskDomain(rawTask);
  const systemScope = inferSystemScope(rawTask, taskDomain);
  const executionMode = inferExecutionMode(rawTask, taskDomain, systemScope);
  const assigneeId = resolveActorId(rawTask.assigneeId ?? rawTask.owner, directory);
  const status = normalizeLegacyStatus(rawTask.status, !!rawTask.blocked);
  const priority = asTrimmedString(rawTask.priority || "P1") || "P1";
  const title = asTrimmedString(rawTask.title);
  const description = asTrimmedString(rawTask.description);
  const workstream = asTrimmedString(rawTask.workstream) || taskDomain;
  const blocked = Boolean(rawTask.blocked) || rawTask.status === "blocked";
  const blockerReason = blocked ? asOptionalString(rawTask.blockerReason) : null;
  const createdAt = options.createdAt ?? rawTask.createdAt ?? rawTask.updatedAt ?? options.fallbackTimestamp ?? now;
  const updatedAt = options.updatedAt ?? rawTask.updatedAt ?? options.fallbackTimestamp ?? now;
  const deliverableLink = asOptionalString(rawTask.deliverableLink);
  const nextAction = asTrimmedString(rawTask.nextAction);
  const dueDate = rawTask.dueDate === null ? null : asOptionalString(rawTask.dueDate);
  const dependencies = asStringArray(rawTask.dependencies);
  const sourceRefs = asStringArray(rawTask.sourceRefs);
  const initialNotes = Array.isArray(rawTask.notes) ? rawTask.notes : [];
  const existingHistory = Array.isArray(rawTask.statusHistory) ? rawTask.statusHistory : [];
  const noteText = asOptionalString(options.note ?? rawTask.note);
  const createdBy = rawTask.createdBy ?? actorRef(actor);
  const updatedBy = rawTask.updatedBy ?? actorRef(actor);
  const id = asTrimmedString(rawTask.id) || ensureUniqueId(slugify(title || "task"), options.existingTasks ?? []);

  if (!title) {
    throw validationError("title is required.", { field: "title" });
  }
  if (!description) {
    throw validationError("description is required.", { field: "description" });
  }
  if (!assigneeId) {
    throw validationError("assigneeId is required and must resolve from data/org-chart.json.", { field: "assigneeId" });
  }

  assertEnum(status, PROJECT_BOARD_STATUSES, "status");
  assertEnum(priority, PROJECT_BOARD_PRIORITIES, "priority");
  assertEnum(taskDomain, PROJECT_BOARD_TASK_DOMAINS, "taskDomain");
  assertEnum(systemScope, PROJECT_BOARD_SYSTEM_SCOPES, "systemScope");
  assertEnum(executionMode, PROJECT_BOARD_EXECUTION_MODES, "executionMode");

  const existingForceHistory = Array.isArray(rawTask.forcedActionHistory) ? rawTask.forcedActionHistory : [];

  const baseTask = {
    id,
    title,
    description,
    assigneeId,
    assigneeType: rawTask.assigneeType ?? null,
    assigneeDisplayName: rawTask.assigneeDisplayName ?? null,
    status,
    priority,
    createdAt,
    updatedAt,
    deliverableLink,
    notes: initialNotes,
    workstream,
    systemScope,
    taskDomain,
    blocked,
    blockerReason,
    statusHistory: existingHistory,
    createdBy,
    updatedBy,
    allowedAssigneeTypes: [],
    executionMode,
    dependencies,
    nextAction,
    sourceRefs,
    dueDate,
    forcedActionHistory: existingForceHistory,
  };

  let assignee;
  if (options.forceAction) {
    assignee = directory.byId.get(baseTask.assigneeId);
    if (!assignee) {
      throw validationError(`Unknown assignee: ${baseTask.assigneeId}.`, { field: "assigneeId" });
    }
  } else {
    assignee = ensureValidAssignment(baseTask, directory);
  }

  const normalizedTask = {
    ...baseTask,
    assigneeType: assignee.assigneeType,
    assigneeDisplayName: assignee.displayName,
    allowedAssigneeTypes: allowedAssigneeTypesFor(baseTask, directory),
    notes: [...initialNotes],
    statusHistory: [...existingHistory],
    forcedActionHistory: [...existingForceHistory],
  };

  if (options.isCreate && !normalizedTask.statusHistory.length) {
    normalizedTask.statusHistory.push({
      timestamp: now,
      actorId: actor.id,
      actorDisplayName: actor.displayName,
      fromStatus: null,
      toStatus: normalizedTask.status,
      note: noteText,
    });
  }

  if (noteText && options.appendNote) {
    normalizedTask.notes.push({
      id: `note-${Date.parse(now) || Date.now()}`,
      body: noteText,
      createdAt: now,
      actorId: actor.id,
      actorDisplayName: actor.displayName,
    });
  }

  return normalizedTask;
}

async function loadOrgDirectory() {
  const org = await readJson(orgChartPath);
  const actors = [];

  function addActor({ id, name, title, department = null, assigneeType, parentChiefId = null }) {
    const emoji = EMOJI_BY_ID[id] || (assigneeType === "chief" ? "🤖" : assigneeType === "human-collaborator" ? "👤" : "⚙️");
    const displayName = `${emoji} ${name}`;
    actors.push({
      id,
      name,
      displayName,
      label: title ? `${displayName} — ${title}` : displayName,
      emoji,
      assigneeType,
      title: title || null,
      department,
      parentChiefId,
    });
  }

  addActor({
    id: org.humanAuthority.id,
    name: org.humanAuthority.name,
    title: org.humanAuthority.title,
    department: "Human Authority",
    assigneeType: "human-authority",
  });

  addActor({
    id: org.aiOrg.id,
    name: org.aiOrg.name,
    title: org.aiOrg.title,
    department: org.aiOrg.department,
    assigneeType: "ai-orchestrator",
  });

  for (const chief of org.aiOrg.children || []) {
    addActor({
      id: chief.id,
      name: chief.name,
      title: chief.title,
      department: chief.department,
      assigneeType: "chief",
    });

    for (const specialist of chief.children || []) {
      addActor({
        id: specialist.id,
        name: specialist.name,
        title: `${chief.name} specialist slot`,
        department: chief.department,
        assigneeType: "ai-specialist",
        parentChiefId: chief.id,
      });
    }
  }

  for (const human of org.humanCollaborators || []) {
    addActor({
      id: human.id,
      name: human.name,
      title: human.role,
      department: "Human Collaborators",
      assigneeType: "human-collaborator",
    });
  }

  const byId = new Map(actors.map((actor) => [actor.id, actor]));
  return {
    actors,
    assignableActors: actors,
    byId,
    orgChartPath,
  };
}

async function readBoardRecord() {
  const [raw, directory] = await Promise.all([readJson(boardPath), loadOrgDirectory()]);
  const fallbackTimestamp = raw.updatedAt ?? toIso(Date.now());
  const systemActor = boardSystemActor();
  const tasks = (Array.isArray(raw.tasks) ? raw.tasks : []).map((task) => {
    const normalized = normalizeTaskForStorage(task, directory, systemActor, {
      fallbackTimestamp,
      existingTasks: raw.tasks || [],
      isCreate: false,
      appendNote: false,
    });

    return {
      ...normalized,
      notes: Array.isArray(task.notes) ? task.notes : [],
      statusHistory: Array.isArray(task.statusHistory) ? task.statusHistory : [],
      createdBy: task.createdBy ?? actorRef(systemActor),
      updatedBy: task.updatedBy ?? actorRef(systemActor),
    };
  });

  return {
    record: {
      schema: raw.schema || "sugarandleather.project-board.v2",
      updatedAt: raw.updatedAt ?? fallbackTimestamp,
      note:
        raw.note ||
        "Internal execution board for Aries AI. This board is the operational source of truth for ownership, blockers, handoffs, and status changes. It is not runtime telemetry.",
      tasks,
    },
    directory,
  };
}

async function writeBoardRecord(record) {
  await fs.writeFile(boardPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
}

function computeQuickViews(tasks) {
  const views = [
    { id: "all", label: "All tasks", filters: {} },
    { id: "jarvis", label: "My Tasks — Jarvis", filters: { assigneeId: "jarvis" } },
    { id: "forge", label: "My Tasks — Forge", filters: { assigneeId: "forge" } },
    { id: "signal", label: "My Tasks — Signal", filters: { assigneeId: "signal" } },
    { id: "ledger", label: "My Tasks — Ledger", filters: { assigneeId: "ledger" } },
    { id: "mission-control", label: "Mission Control", filters: { systemScope: "mission-control" } },
    { id: "backend", label: "Aries backend", filters: { systemScope: "aries-app", taskDomain: "backend" } },
    { id: "blocked", label: "Blocked", filters: { blocked: true } },
    { id: "stale", label: "Stale", filters: { stale: true } },
  ];

  return views.map((view) => ({
    ...view,
    count: tasks.filter((task) => {
      if (view.filters.assigneeId && task.assigneeId !== view.filters.assigneeId) return false;
      if (view.filters.systemScope && task.systemScope !== view.filters.systemScope) return false;
      if (view.filters.taskDomain && task.taskDomain !== view.filters.taskDomain) return false;
      if (view.filters.blocked && !task.blocked) return false;
      if (view.filters.stale && !task.stale) return false;
      return true;
    }).length,
  }));
}

function optionList(values, formatter = (value) => value) {
  return values.map((value) => ({ value, label: formatter(value) }));
}

export async function loadProjectBoardPayload() {
  const { record, directory } = await readBoardRecord();
  const tasks = record.tasks
    .map((task) => enrichTask(task, directory))
    .sort((left, right) => (Date.parse(right.updatedAt) || 0) - (Date.parse(left.updatedAt) || 0));

  return {
    source: {
      kind: "project-board",
      updatedAt: record.updatedAt,
      note: record.note,
      path: boardPath,
      orgChartPath: directory.orgChartPath,
    },
    tasks,
    assignees: directory.assignableActors.map((actor) => mapActor(actor)),
    actors: directory.assignableActors.map((actor) => mapActor(actor)),
    filterOptions: {
      assignees: directory.assignableActors.map((actor) => ({ value: actor.id, label: actor.label })),
      statuses: optionList(PROJECT_BOARD_STATUSES, statusLabel),
      priorities: optionList(PROJECT_BOARD_PRIORITIES),
      workstreams: optionList(unique(tasks.map((task) => task.workstream)).sort()),
      systemScopes: optionList(PROJECT_BOARD_SYSTEM_SCOPES, domainLabel),
      taskDomains: optionList(PROJECT_BOARD_TASK_DOMAINS, domainLabel),
    },
    quickViews: computeQuickViews(tasks),
    statusFlow: PROJECT_BOARD_STATUSES.map((status) => ({ id: status, label: statusLabel(status) })),
    staleAfterDays,
  };
}

export async function createProjectBoardTask(input) {
  const { record, directory } = await readBoardRecord();
  const actorId = resolveActorId(input.actorId, directory);
  if (!actorId) {
    throw validationError("actorId must resolve to a real board actor from data/org-chart.json.", { field: "actorId" });
  }

  const actor = directory.byId.get(actorId);
  const now = toIso(Date.now());
  const normalized = normalizeTaskForStorage(input.task || {}, directory, actor, {
    now,
    createdAt: now,
    updatedAt: now,
    isCreate: true,
    appendNote: true,
    note: input.note,
    existingTasks: record.tasks,
  });

  record.tasks.unshift(normalized);
  record.updatedAt = now;
  await writeBoardRecord(record);
  return enrichTask(normalized, directory);
}

export async function updateProjectBoardTask(taskId, input) {
  const { record, directory } = await readBoardRecord();
  const index = record.tasks.findIndex((task) => task.id === taskId);
  if (index < 0) {
    const error = new Error(`Task not found: ${taskId}`);
    error.name = "NotFoundError";
    error.status = 404;
    throw error;
  }

  const actorId = resolveActorId(input.actorId, directory);
  if (!actorId) {
    throw validationError("actorId must resolve to a real board actor from data/org-chart.json.", { field: "actorId" });
  }

  const actor = directory.byId.get(actorId);
  const current = record.tasks[index];
  const now = toIso(Date.now());
  const candidate = {
    ...current,
    ...(input.updates || {}),
    status: input.updates?.status ?? current.status,
    priority: input.updates?.priority ?? current.priority,
    systemScope: input.updates?.systemScope ?? current.systemScope,
    taskDomain: input.updates?.taskDomain ?? current.taskDomain,
    executionMode: input.updates?.executionMode ?? current.executionMode,
    workstream: input.updates?.workstream ?? current.workstream,
    assigneeId: input.updates?.assigneeId ?? current.assigneeId,
    blocked: input.updates?.blocked ?? current.blocked,
    blockerReason:
      input.updates?.blocked === false
        ? null
        : (input.updates?.blockerReason ?? current.blockerReason),
    notes: current.notes,
    statusHistory: current.statusHistory,
    createdBy: current.createdBy,
    updatedBy: actorRef(actor),
  };

  const isForce = Boolean(input.forceAction);
  const forceReason = asTrimmedString(input.forceReason);

  const normalized = normalizeTaskForStorage(candidate, directory, actor, {
    now,
    createdAt: current.createdAt,
    updatedAt: now,
    isCreate: false,
    appendNote: true,
    note: input.note,
    existingTasks: record.tasks,
    forceAction: isForce,
  });

  if (normalized.status !== current.status) {
    normalized.statusHistory.push({
      timestamp: now,
      actorId: actor.id,
      actorDisplayName: actor.displayName,
      fromStatus: current.status,
      toStatus: normalized.status,
      note: asOptionalString(input.note),
    });
  }

  if (isForce && forceReason) {
    const actions = [];
    if (input.updates?.assigneeId && input.updates.assigneeId !== current.assigneeId) {
      actions.push({ action: "force-assign", fromValue: current.assigneeId, toValue: input.updates.assigneeId });
    }
    if (input.updates?.status && input.updates.status !== current.status) {
      actions.push({ action: "force-status", fromValue: current.status, toValue: input.updates.status });
    }
    if (input.updates?.priority && input.updates.priority !== current.priority) {
      actions.push({ action: "force-priority", fromValue: current.priority, toValue: input.updates.priority });
    }
    if (!actions.length) {
      actions.push({ action: "force-update", fromValue: null, toValue: null });
    }
    for (const entry of actions) {
      normalized.forcedActionHistory.push({
        id: `force-${Date.parse(now) || Date.now()}-${entry.action}`,
        timestamp: now,
        actorId: actor.id,
        actorDisplayName: actor.displayName,
        action: entry.action,
        reason: forceReason,
        fromValue: entry.fromValue,
        toValue: entry.toValue,
      });
    }
  }

  normalized.createdBy = current.createdBy;
  normalized.updatedBy = actorRef(actor);
  record.tasks[index] = normalized;
  record.updatedAt = now;
  await writeBoardRecord(record);
  return enrichTask(normalized, directory);
}

export function isBoardRequestPath(pathname) {
  return pathname === "/api/pm-board" || pathname.startsWith("/api/pm-board/");
}

export async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw validationError("Request body must be valid JSON.");
  }
}

export function boardErrorPayload(error) {
  return {
    error: error instanceof Error ? error.message : "Unknown board error",
    details: error?.details ?? null,
  };
}
