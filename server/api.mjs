import { loadBriefingData } from "./loaders/briefing-data.mjs";
import {
  loadBuildArtifactsSection,
  loadBuildLabData,
  loadBuildLabOverviewData,
  loadIdeaBacklogSection,
  loadPrototypeRegistrySection,
  loadResearchDashboardSection,
} from "./loaders/build-lab-data.mjs";
import { loadExecutionData } from "./loaders/execution-data.mjs";
import { loadRuntimeData } from "./loaders/runtime-data.mjs";
import { loadMemoryFileContent, loadMemoryFiles } from "./loaders/memory-data.mjs";
import { loadBriefingArchiveData } from "./loaders/briefing-archive-data.mjs";
import { loadSkillsCatalogData } from "./loaders/skills-data.mjs";
import { loadCronHealthData } from "./loaders/cron-health-data.mjs";
import { toIso } from "./lib/fs-utils.mjs";

export class ApiError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function isMemoryAllowed(rawPath) {
  if (!rawPath) return false;
  const normalized = rawPath.replace(/\\/g, "/").replace(/^\/+/, "");
  return normalized === "MEMORY.md" || normalized === "BACKLOG.md" || normalized.startsWith("memory/");
}

export async function loadApiPath(pathname, url) {
  if (pathname === "/api/app/command") {
    return { generatedAt: toIso(Date.now()), data: await loadExecutionData() };
  }
  if (pathname === "/api/app/briefing") {
    return { generatedAt: toIso(Date.now()), data: await loadBriefingData() };
  }
  if (pathname === "/api/app/build-lab") {
    return { generatedAt: toIso(Date.now()), data: await loadBuildLabData() };
  }
  if (pathname === "/api/app/build-lab/overview") {
    return { generatedAt: toIso(Date.now()), data: await loadBuildLabOverviewData() };
  }
  if (pathname === "/api/app/build-lab/prototypes") {
    return { generatedAt: toIso(Date.now()), data: await loadPrototypeRegistrySection() };
  }
  if (pathname === "/api/app/build-lab/ideas") {
    return { generatedAt: toIso(Date.now()), data: await loadIdeaBacklogSection() };
  }
  if (pathname === "/api/app/build-lab/artifacts") {
    return { generatedAt: toIso(Date.now()), data: await loadBuildArtifactsSection() };
  }
  if (pathname === "/api/app/build-lab/research") {
    return { generatedAt: toIso(Date.now()), data: await loadResearchDashboardSection() };
  }
  if (pathname === "/api/app/runtime") {
    return { generatedAt: toIso(Date.now()), data: await loadRuntimeData() };
  }

  if (pathname === "/api/memory/files") {
    return { generatedAt: toIso(Date.now()), data: await loadMemoryFiles() };
  }

  if (pathname === "/api/memory/file") {
    const pathParam = url ? url.searchParams.get("path") : null;
    if (!isMemoryAllowed(pathParam || "")) {
      throw new ApiError("Invalid path. Allowed paths are MEMORY.md, BACKLOG.md, and memory/**/*.md.", 400);
    }
    try {
      const data = await loadMemoryFileContent(pathParam);
      return { generatedAt: toIso(Date.now()), data };
    } catch (error) {
      if (error?.code === "BAD_REQUEST") {
        throw new ApiError(error.message, 400);
      }
      if (error?.code === "NOT_FOUND") {
        throw new ApiError(error.message, 404);
      }
      if (error?.code === "READ_ERROR") {
        throw new ApiError(error.message, 500);
      }
      throw new ApiError(error instanceof Error ? error.message : "Unable to read memory file.", 500);
    }
  }

  if (pathname === "/api/briefs") {
    return { generatedAt: toIso(Date.now()), data: await loadBriefingArchiveData() };
  }

  if (pathname === "/api/skills") {
    return { generatedAt: toIso(Date.now()), data: await loadSkillsCatalogData() };
  }

  if (pathname === "/api/cron-health") {
    const data = await loadCronHealthData();
    return { generatedAt: data.generatedAt ?? toIso(Date.now()), data };
  }

  return null;
}
