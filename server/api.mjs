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
import { loadStandupArchiveData } from "./loaders/standup-data.mjs";
import { loadSkillsCatalogData } from "./loaders/skills-data.mjs";
import { loadCronHealthData } from "./loaders/cron-health-data.mjs";
import { loadOrgData } from "./loaders/org-data.mjs";
import { cachedLoad } from "./lib/cache.mjs";
import { loadProjectBoardPayload } from "./lib/project-board.mjs";
import { loadRoutingRequestsPayload } from "./lib/routing-requests.mjs";
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

function withTimeout(promise, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new ApiError(`${label} timed out after ${Math.round(timeoutMs / 1000)}s.`, 504));
    }, timeoutMs);

    Promise.resolve(promise)
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

async function loadEnvelope(cacheKey, ttlMs, timeoutMs, label, loader, generatedAtResolver) {
  return cachedLoad(cacheKey, ttlMs, async () => {
    const data = await withTimeout(Promise.resolve().then(loader), timeoutMs, label);
    const generatedAt = generatedAtResolver ? generatedAtResolver(data) : toIso(Date.now());
    return { generatedAt, data };
  });
}

export async function loadApiPath(pathname, url) {
  if (pathname === "/api/app/command") {
    return loadEnvelope("api:command", 5_000, 4_000, "Command board", loadExecutionData);
  }
  if (pathname === "/api/pm-board") {
    return loadEnvelope("api:pm-board", 5_000, 4_000, "Project Board", loadProjectBoardPayload);
  }
  if (pathname === "/api/routing-requests") {
    return loadEnvelope("api:routing-requests", 5_000, 8_000, "Routing requests", loadRoutingRequestsPayload);
  }
  if (pathname === "/api/app/briefing") {
    return loadEnvelope("api:briefing", 30_000, 5_000, "Briefing", loadBriefingData);
  }
  if (pathname === "/api/app/build-lab") {
    return loadEnvelope("api:build-lab", 60_000, 8_000, "Build Lab", loadBuildLabData);
  }
  if (pathname === "/api/app/build-lab/overview") {
    return loadEnvelope("api:build-lab:overview", 60_000, 6_000, "Build Lab overview", loadBuildLabOverviewData);
  }
  if (pathname === "/api/app/build-lab/prototypes") {
    return loadEnvelope("api:build-lab:prototypes", 30_000, 6_000, "Build Lab prototypes", loadPrototypeRegistrySection);
  }
  if (pathname === "/api/app/build-lab/ideas") {
    return loadEnvelope("api:build-lab:ideas", 30_000, 6_000, "Build Lab ideas", loadIdeaBacklogSection);
  }
  if (pathname === "/api/app/build-lab/artifacts") {
    return loadEnvelope("api:build-lab:artifacts", 30_000, 6_000, "Build Lab artifacts", loadBuildArtifactsSection);
  }
  if (pathname === "/api/app/build-lab/research") {
    return loadEnvelope("api:build-lab:research", 60_000, 8_000, "Build Lab research", loadResearchDashboardSection);
  }
  if (pathname === "/api/app/runtime") {
    return loadEnvelope("api:runtime", 15_000, 20_000, "Runtime", loadRuntimeData);
  }

  if (pathname === "/api/org") {
    return loadEnvelope("api:org", 15_000, 5_000, "Org state", loadOrgData);
  }

  if (pathname === "/api/memory/files") {
    return loadEnvelope("api:memory-files", 30_000, 5_000, "Memory files", loadMemoryFiles);
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
    return loadEnvelope("api:briefs", 30_000, 5_000, "Brief archive", loadBriefingArchiveData);
  }

  if (pathname === "/api/standups") {
    return loadEnvelope("api:standups", 30_000, 5_000, "Standups", loadStandupArchiveData);
  }

  if (pathname === "/api/skills") {
    return loadEnvelope("api:skills", 60_000, 5_000, "Skills catalog", loadSkillsCatalogData);
  }

  if (pathname === "/api/cron-health") {
    return loadEnvelope(
      "api:cron-health",
      15_000,
      15_000,
      "Cron health",
      loadCronHealthData,
      (data) => data.generatedAt ?? toIso(Date.now()),
    );
  }

  return null;
}
