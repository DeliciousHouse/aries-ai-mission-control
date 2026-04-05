import type {
  ApiEnvelope,
  BriefingPayload,
  BriefingArchivePayload,
  BuildLabPayload,
  CommandPayload,
  CronHealthPayload,
  MemoryFileContentPayload,
  MemoryFilePayload,
  SkillCatalogPayload,
  RuntimePayload,
} from "../types";

async function getJson<T>(path: string): Promise<ApiEnvelope<T>> {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }
  return response.json() as Promise<ApiEnvelope<T>>;
}

export const api = {
  loadCommand: () => getJson<CommandPayload>("/api/app/command"),
  loadBriefing: () => getJson<BriefingPayload>("/api/app/briefing"),
  loadBuildLab: () => getJson<BuildLabPayload>("/api/app/build-lab"),
  loadRuntime: () => getJson<RuntimePayload>("/api/app/runtime"),
  loadMemoryFiles: () => getJson<MemoryFilePayload>("/api/memory/files"),
  loadMemoryFile: (path: string) =>
    getJson<MemoryFileContentPayload>(`/api/memory/file?path=${encodeURIComponent(path)}`),
  loadBriefingArchive: () => getJson<BriefingArchivePayload>("/api/briefs"),
  loadSkills: () => getJson<SkillCatalogPayload>("/api/skills"),
  loadCronHealth: () => getJson<CronHealthPayload>("/api/cron-health"),
};
