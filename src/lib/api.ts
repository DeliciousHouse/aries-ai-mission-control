import type {
  ApiEnvelope,
  BriefingPayload,
  BriefingArchivePayload,
  BuildLabPayload,
  CommandPayload,
  CronHealthPayload,
  MemoryFileContentPayload,
  MemoryFilePayload,
  StandupArchivePayload,
  ProjectBoardExecutionMode,
  ProjectBoardPriority,
  ProjectBoardStatus,
  ProjectBoardSystemScope,
  ProjectBoardTask,
  ProjectBoardTaskDomain,
  SkillCatalogPayload,
  RuntimePayload,
  OrgPayload,
  RoutingRequest,
  RoutingRequestPayload,
} from "../types";

async function readError(response: Response) {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text);
    if (parsed?.error) {
      const detailText = parsed?.details?.routingRule ? ` ${parsed.details.routingRule}` : "";
      throw new Error(`${parsed.error}${detailText}`.trim());
    }
  } catch (error) {
    if (error instanceof Error && error.message) {
      throw error;
    }
  }
  throw new Error(text || `Request failed: ${response.status}`);
}

type RequestOptions = {
  timeoutMs?: number;
};

async function getJson<T>(path: string, options: RequestOptions = {}): Promise<ApiEnvelope<T>> {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 8000;
  const timeout = window.setTimeout(() => controller.abort("timeout"), timeoutMs);

  let response: Response;
  try {
    response = await fetch(path, { cache: "no-store", signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`Timed out after ${Math.round(timeoutMs / 1000)}s`, { cause: error });
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }

  if (!response.ok) {
    await readError(response);
  }
  return response.json() as Promise<ApiEnvelope<T>>;
}

async function sendJson<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (!response.ok) {
    await readError(response);
  }
  const payload = (await response.json()) as { data: T };
  return payload.data;
}

export type ProjectBoardTaskInput = {
  title: string;
  description: string;
  assigneeId: string;
  status: ProjectBoardStatus;
  priority: ProjectBoardPriority;
  workstream: string;
  systemScope: ProjectBoardSystemScope;
  taskDomain: ProjectBoardTaskDomain;
  blocked: boolean;
  blockerReason?: string | null;
  deliverableLink?: string | null;
  executionMode: ProjectBoardExecutionMode;
  nextAction: string;
  dependencies: string[];
  sourceRefs: string[];
  dueDate?: string | null;
};

export type ProjectBoardTaskPatch = Partial<ProjectBoardTaskInput>;

export const api = {
  loadCommand: () => getJson<CommandPayload>("/api/app/command", { timeoutMs: 6000 }),
  loadBriefing: () => getJson<BriefingPayload>("/api/app/briefing", { timeoutMs: 6000 }),
  loadBuildLab: () => getJson<BuildLabPayload>("/api/app/build-lab", { timeoutMs: 9000 }),
  loadRuntime: () => getJson<RuntimePayload>("/api/app/runtime", { timeoutMs: 8000 }),
  loadOrg: () => getJson<OrgPayload>("/api/org", { timeoutMs: 7000 }),
  loadMemoryFiles: () => getJson<MemoryFilePayload>("/api/memory/files", { timeoutMs: 6000 }),
  loadMemoryFile: (path: string) =>
    getJson<MemoryFileContentPayload>(`/api/memory/file?path=${encodeURIComponent(path)}`, { timeoutMs: 6000 }),
  loadBriefingArchive: () => getJson<BriefingArchivePayload>("/api/briefs", { timeoutMs: 6000 }),
  loadStandups: () => getJson<StandupArchivePayload>("/api/standups", { timeoutMs: 6000 }),
  loadSkills: () => getJson<SkillCatalogPayload>("/api/skills", { timeoutMs: 6000 }),
  loadCronHealth: () => getJson<CronHealthPayload>("/api/cron-health", { timeoutMs: 7000 }),
  loadRoutingRequests: () => getJson<RoutingRequestPayload>("/api/routing-requests", { timeoutMs: 8000 }),
  createProjectBoardTask: (actorId: string, task: ProjectBoardTaskInput, note?: string) =>
    sendJson<ProjectBoardTask>("/api/pm-board", {
      method: "POST",
      body: JSON.stringify({ actorId, task, note }),
    }),
  updateProjectBoardTask: (taskId: string, actorId: string, updates: ProjectBoardTaskPatch, note?: string, forceAction?: boolean, forceReason?: string) =>
    sendJson<ProjectBoardTask>(`/api/pm-board/${encodeURIComponent(taskId)}`, {
      method: "PATCH",
      body: JSON.stringify({ actorId, updates, note, forceAction, forceReason }),
    }),
  approveRoutingRequest: (requestId: string, actorId: string, decisionNote?: string) =>
    sendJson<RoutingRequest>(`/api/routing-requests/${encodeURIComponent(requestId)}/approve`, {
      method: "POST",
      body: JSON.stringify({ actorId, actorDisplayName: actorId, decisionNote }),
    }),
  rejectRoutingRequest: (requestId: string, actorId: string, decisionNote?: string) =>
    sendJson<RoutingRequest>(`/api/routing-requests/${encodeURIComponent(requestId)}/reject`, {
      method: "POST",
      body: JSON.stringify({ actorId, actorDisplayName: actorId, decisionNote }),
    }),
};
