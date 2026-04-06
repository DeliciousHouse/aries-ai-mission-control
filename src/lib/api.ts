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

async function getJson<T>(path: string): Promise<ApiEnvelope<T>> {
  const response = await fetch(path, { cache: "no-store" });
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
      ...(init.headers || {}),
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
  loadCommand: () => getJson<CommandPayload>("/api/app/command"),
  loadBriefing: () => getJson<BriefingPayload>("/api/app/briefing"),
  loadBuildLab: () => getJson<BuildLabPayload>("/api/app/build-lab"),
  loadRuntime: () => getJson<RuntimePayload>("/api/app/runtime"),
  loadOrg: () => getJson<OrgPayload>("/api/org"),
  loadMemoryFiles: () => getJson<MemoryFilePayload>("/api/memory/files"),
  loadMemoryFile: (path: string) =>
    getJson<MemoryFileContentPayload>(`/api/memory/file?path=${encodeURIComponent(path)}`),
  loadBriefingArchive: () => getJson<BriefingArchivePayload>("/api/briefs"),
  loadStandups: () => getJson<StandupArchivePayload>("/api/standups"),
  loadSkills: () => getJson<SkillCatalogPayload>("/api/skills"),
  loadCronHealth: () => getJson<CronHealthPayload>("/api/cron-health"),
  createProjectBoardTask: (actorId: string, task: ProjectBoardTaskInput, note?: string) =>
    sendJson<ProjectBoardTask>("/api/pm-board", {
      method: "POST",
      body: JSON.stringify({ actorId, task, note }),
    }),
  updateProjectBoardTask: (taskId: string, actorId: string, updates: ProjectBoardTaskPatch, note?: string) =>
    sendJson<ProjectBoardTask>(`/api/pm-board/${encodeURIComponent(taskId)}`, {
      method: "PATCH",
      body: JSON.stringify({ actorId, updates, note }),
    }),
};
