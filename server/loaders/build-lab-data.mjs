import fs from "node:fs/promises";
import path from "node:path";
import {
  formatBytes,
  getMissionControlRoot,
  listFiles,
  readJson,
  readText,
  relativeToRepo,
  resolveRepoRoot,
  toIso,
} from "../lib/fs-utils.mjs";

const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;
const WEEK_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const TEXT_FILE_PATTERN = /\.(md|markdown|txt|json|html|css)$/i;
const tracksPath = path.join(getMissionControlRoot(), "server", "data", "build-lab-tracks.json");

const prototypePreviewRegistry = {
  "mission-control-shell": {
    url: "http://127.0.0.1:4174/#/build-lab",
    port: 4174,
    label: "Mission Control Build Lab",
    localOnly: true,
  },
  "runtime-adapter-hardening": {
    url: "http://127.0.0.1:4174/#/runtime",
    port: 4174,
    label: "Mission Control Runtime",
    localOnly: true,
  },
};

function cleanText(value, fallback = "Unavailable") {
  if (typeof value !== "string") return fallback;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized || fallback;
}

function truncate(value, max = 180) {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function safeNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isRecent(value, now = Date.now()) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && now - timestamp <= RECENT_WINDOW_MS;
}

function isThisWeek(value, now = Date.now()) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && now - timestamp <= WEEK_WINDOW_MS;
}

function normalizeIdeaState(track) {
  if (typeof track.state === "string") {
    const lowered = track.state.toLowerCase();
    if (["candidate", "active", "deferred", "promoted", "archived"].includes(lowered)) return lowered;
  }

  if (track.status === "archived") return "archived";
  if (track.status === "done") return "promoted";
  if (track.lane === "deferred") return "deferred";
  if (track.status === "watching") return "candidate";
  return "active";
}

function deriveCategory(track) {
  const haystack = `${track.id || ""} ${track.name || ""} ${track.goal || ""} ${track.nextAction || ""}`.toLowerCase();
  if (haystack.includes("runtime") || haystack.includes("health") || haystack.includes("session") || haystack.includes("cron")) {
    return "Runtime";
  }
  if (haystack.includes("telemetry") || haystack.includes("observability") || haystack.includes("cost")) {
    return "Observability";
  }
  if (haystack.includes("shell") || haystack.includes("route") || haystack.includes("ui") || haystack.includes("build lab")) {
    return "Interface";
  }
  if (haystack.includes("workflow") || haystack.includes("pipeline")) {
    return "Workflow";
  }
  if (haystack.includes("bootcamp") || haystack.includes("translation") || haystack.includes("lesson")) {
    return "Translation";
  }
  return "General";
}

function statusFromTrack(track, previewProbe) {
  if (track.status === "archived" || track.state === "archived") return "archived";
  if (previewProbe?.reachable === true) return "running";
  if (previewProbe?.reachable === false) return "stopped";
  return "unavailable";
}

function statusDetailFromTrack(track, previewProbe) {
  if (track.status === "archived" || track.state === "archived") {
    return "Archived in the underlying registry.";
  }
  if (previewProbe?.reachable === true) {
    return previewProbe.localOnly
      ? `Local preview responded on port ${previewProbe.port}.`
      : "Tracked preview URL responded successfully.";
  }
  if (previewProbe?.reachable === false) {
    return previewProbe.error || `Tracked preview on port ${previewProbe.port} did not respond.`;
  }
  return "No real preview URL or port is tracked for this registry item.";
}

async function probePreview(target) {
  if (!target?.url) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetch(target.url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return {
      reachable: response.ok,
      statusCode: response.status,
      url: target.url,
      port: target.port ?? null,
      localOnly: Boolean(target.localOnly),
      label: target.label ?? null,
      error: response.ok ? null : `HTTP ${response.status}`,
    };
  } catch (error) {
    clearTimeout(timeout);
    return {
      reachable: false,
      statusCode: null,
      url: target.url,
      port: target.port ?? null,
      localOnly: Boolean(target.localOnly),
      label: target.label ?? null,
      error: error instanceof Error ? error.message : "Preview probe failed.",
    };
  }
}

async function loadTrackRegistry() {
  const [payload, stats] = await Promise.all([readJson(tracksPath), fs.stat(tracksPath)]);
  const updatedAt = payload.updatedAt || toIso(stats.mtimeMs);
  const tracks = Array.isArray(payload.tracks) ? payload.tracks : [];

  return {
    payload,
    stats,
    updatedAt,
    tracks,
  };
}

async function gatherDirectoryStats(rootPath) {
  const files = await listFiles(rootPath);
  let sizeBytes = 0;
  let newestMtimeMs = 0;
  let newestFile = null;

  for (const filePath of files) {
    try {
      const stats = await fs.stat(filePath);
      sizeBytes += stats.size;
      if (stats.mtimeMs >= newestMtimeMs) {
        newestMtimeMs = stats.mtimeMs;
        newestFile = filePath;
      }
    } catch {
      // ignore transient files
    }
  }

  return {
    fileCount: files.length,
    sizeBytes,
    updatedAt: newestMtimeMs ? toIso(newestMtimeMs) : null,
    newestFile,
  };
}

async function collectRecentFiles(rootPath, maxFiles = 4) {
  const files = await listFiles(rootPath);
  const enriched = [];

  for (const filePath of files) {
    try {
      const stats = await fs.stat(filePath);
      enriched.push({ filePath, mtimeMs: stats.mtimeMs, size: stats.size });
    } catch {
      // ignore unreadable file
    }
  }

  return enriched
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, maxFiles)
    .map((entry) => ({
      path: entry.filePath,
      updatedAt: toIso(entry.mtimeMs),
      sizeLabel: formatBytes(entry.size),
    }));
}

async function loadBuildArtifactsData(repoRoot = resolveRepoRoot(), missionControlRoot = getMissionControlRoot()) {
  const candidates = [
    { id: "aries-next", title: "aries-app .next", path: path.join(repoRoot, ".next"), kind: "next-build" },
    { id: "aries-dist", title: "aries-app dist", path: path.join(repoRoot, "dist"), kind: "runtime-bundle" },
    { id: "mission-control-dist", title: "Mission Control dist", path: path.join(missionControlRoot, "dist"), kind: "mission-control" },
    { id: "aries-generated", title: "aries-app generated", path: path.join(repoRoot, "generated"), kind: "generated-output" },
    { id: "aries-output", title: "aries-app output", path: path.join(repoRoot, "output"), kind: "workspace-output" },
  ];

  const items = [];
  for (const item of candidates) {
    try {
      const stats = await fs.stat(item.path);
      if (!stats.isDirectory()) {
        items.push({
          id: item.id,
          title: item.title,
          path: item.path,
          kind: item.kind,
          state: "unavailable",
          updatedAt: null,
          fileCount: 0,
          sizeLabel: "0 B",
          latestChangedPath: null,
          latestChangedAt: null,
          recentFiles: [],
          summary: "Configured artifact path is not a directory.",
        });
        continue;
      }

      const [summary, recentFiles] = await Promise.all([
        gatherDirectoryStats(item.path),
        collectRecentFiles(item.path),
      ]);

      items.push({
        id: item.id,
        title: item.title,
        path: item.path,
        kind: item.kind,
        state: summary.fileCount ? "available" : "empty",
        updatedAt: summary.updatedAt,
        fileCount: summary.fileCount,
        sizeLabel: formatBytes(summary.sizeBytes),
        latestChangedPath: summary.newestFile ? path.relative(item.path, summary.newestFile).replace(/\\/g, "/") : null,
        latestChangedAt: summary.updatedAt,
        recentFiles: recentFiles.map((file) => ({
          path: path.relative(item.path, file.path).replace(/\\/g, "/"),
          updatedAt: file.updatedAt,
          sizeLabel: file.sizeLabel,
        })),
        summary: summary.fileCount
          ? `${summary.fileCount} files • ${formatBytes(summary.sizeBytes)}${summary.updatedAt ? ` • updated ${new Date(summary.updatedAt).toLocaleString()}` : ""}`
          : "Directory exists but currently has no files.",
      });
    } catch {
      items.push({
        id: item.id,
        title: item.title,
        path: item.path,
        kind: item.kind,
        state: "unavailable",
        updatedAt: null,
        fileCount: 0,
        sizeLabel: "0 B",
        latestChangedPath: null,
        latestChangedAt: null,
        recentFiles: [],
        summary: "Artifact source unavailable.",
      });
    }
  }

  items.sort((a, b) => (Date.parse(b.updatedAt || "") || 0) - (Date.parse(a.updatedAt || "") || 0));

  return {
    source: {
      kind: "filesystem",
      updatedAt: toIso(Date.now()),
      note: "Artifact inventory comes from real build and generated-output directories only.",
    },
    items,
  };
}

async function loadPrototypeRegistryData(trackRegistry) {
  const registry = trackRegistry || (await loadTrackRegistry());
  const now = Date.now();

  const items = await Promise.all(
    registry.tracks.map(async (track) => {
      const previewTarget = prototypePreviewRegistry[track.id] || null;
      const previewProbe = previewTarget ? await probePreview(previewTarget) : null;
      const updatedAt = registry.updatedAt;
      const status = statusFromTrack(track, previewProbe);
      const previewUrl = previewProbe?.reachable ? previewProbe.url : null;

      return {
        id: track.id,
        name: cleanText(track.name, track.id),
        description: truncate(cleanText(track.goal || track.outcomeOrLesson || track.nextAction, "No description available."), 180),
        workstream: cleanText(track.lane, "unavailable"),
        owner: cleanText(track.owner, "unassigned"),
        previewUrl,
        previewPort: previewTarget?.port ?? null,
        previewLabel: previewTarget?.label ?? null,
        localOnly: Boolean(previewTarget?.localOnly),
        status,
        statusDetail: statusDetailFromTrack(track, previewProbe),
        priorityScore: safeNumber(track.priorityScore),
        maturityScore: safeNumber(track.maturityScore),
        updatedAt,
        sourceRefs: Array.isArray(track.sourceRefs) ? track.sourceRefs : [],
        isNew: isRecent(updatedAt, now),
      };
    }),
  );

  items.sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0));

  const stats = {
    running: items.filter((item) => item.status === "running").length,
    stopped: items.filter((item) => item.status === "stopped").length,
    archived: items.filter((item) => item.status === "archived").length,
    unavailable: items.filter((item) => item.status === "unavailable").length,
    total: items.length,
  };

  return {
    source: {
      kind: registry.payload.kind ?? "internal-planning",
      path: tracksPath,
      updatedAt: registry.updatedAt,
      note:
        "Prototype Registry is backed by the existing Mission Control track registry. Running/stopped only appears when a real preview URL or local port is verifiable.",
    },
    stats,
    items,
  };
}

async function loadIdeaBacklogData(trackRegistry) {
  const registry = trackRegistry || (await loadTrackRegistry());
  const now = Date.now();

  const items = registry.tracks
    .map((track) => ({
      id: track.id,
      title: cleanText(track.name, track.id),
      descriptionSnippet: truncate(cleanText(track.goal || track.nextAction || track.outcomeOrLesson, "No description available."), 180),
      date: registry.updatedAt,
      workstream: cleanText(track.lane, "unavailable"),
      category: deriveCategory(track),
      currentState: normalizeIdeaState(track),
      impactScore: safeNumber(track.impactScore),
      implementationSpeed: safeNumber(track.implementationSpeed),
      technicalLeverage: safeNumber(track.technicalLeverage),
      observabilityValue: safeNumber(track.observabilityValue),
      dependencyBurden: safeNumber(track.dependencyBurden),
      confidence: safeNumber(track.confidence),
      totalScore: safeNumber(track.totalScore),
      sourceRefs: Array.isArray(track.sourceRefs) ? track.sourceRefs : [],
      isNew: isRecent(registry.updatedAt, now),
    }))
    .sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));

  return {
    source: {
      kind: registry.payload.kind ?? "internal-planning",
      path: tracksPath,
      updatedAt: registry.updatedAt,
      note:
        "No separate idea registry was found. Idea Backlog falls back to the existing Build Lab planning registry and derives category/state from the real track metadata.",
    },
    filters: {
      categories: Array.from(new Set(items.map((item) => item.category))).sort(),
      workstreams: Array.from(new Set(items.map((item) => item.workstream))).sort(),
    },
    items,
  };
}

function topicFromResearchPath(relativePath) {
  const lowered = relativePath.toLowerCase();
  if (lowered.includes("mission-control")) return "Mission Control";
  if (lowered.includes("openclaw") || lowered.includes("cron") || lowered.includes("runtime")) return "OpenClaw / Observability";
  if (lowered.includes("generated/validated") || lowered.includes("repo-audit") || lowered.includes("project-progress")) {
    return "aries-app Product / Build Notes";
  }
  if (lowered.includes("stage-1-research") || lowered.includes("meta-ads") || lowered.includes("creative")) {
    return "Experiment Findings";
  }
  if (lowered.includes("stage-2-strategy") || lowered.includes("plans")) return "Implementation / Strategy";
  if (lowered.includes("briefs") || lowered.includes("memory")) return "Engineering Notes";
  return "Research";
}

function stageFromResearchPath(relativePath) {
  const lowered = relativePath.toLowerCase();
  if (lowered.includes("stage-1-research")) return "stage-1-research";
  if (lowered.includes("stage-2-strategy")) return "stage-2-strategy";
  if (lowered.includes("stage-3-production")) return "stage-3-production";
  if (lowered.includes("generated/validated")) return "validated";
  if (lowered.includes("briefs")) return "brief";
  if (lowered.includes("plans")) return "plan";
  return "note";
}

function summarizeJsonResearch(parsed, fallbackTitle) {
  if (Array.isArray(parsed.creative_findings)) {
    return {
      summary: cleanText(parsed.creative_summary?.priority || `${parsed.creative_findings.length} creative findings captured.`),
      findingCount: parsed.creative_findings.length,
    };
  }
  if (Array.isArray(parsed.analysed_ads)) {
    const hooks = Array.isArray(parsed.summary?.top_hooks) ? parsed.summary.top_hooks.slice(0, 3).join(", ") : "";
    return {
      summary: hooks ? `Top hooks: ${hooks}` : `${parsed.analysed_ads.length} analysed ads captured.`,
      findingCount: parsed.analysed_ads.length,
    };
  }
  if (Array.isArray(parsed.blockers)) {
    return {
      summary: `${parsed.blockers.length} blockers tracked in ${cleanText(parsed.phase_name || fallbackTitle)}.`,
      findingCount: parsed.blockers.length,
    };
  }
  if (Array.isArray(parsed.next_actions)) {
    return {
      summary: cleanText(parsed.next_actions[0] || "Next actions captured."),
      findingCount: parsed.next_actions.length,
    };
  }
  if (parsed.campaign_plan?.objective) {
    return {
      summary: cleanText(parsed.campaign_plan.objective),
      findingCount: Array.isArray(parsed.campaign_plan.channel_plans) ? parsed.campaign_plan.channel_plans.length : null,
    };
  }
  if (parsed.brand_profiles_record?.brand_name) {
    return {
      summary: `Strategy output for ${cleanText(parsed.brand_profiles_record.brand_name)}.`,
      findingCount: Array.isArray(parsed.brand_profiles_record.proof_points) ? parsed.brand_profiles_record.proof_points.length : null,
    };
  }
  if (parsed.summary && typeof parsed.summary === "object") {
    const values = Object.values(parsed.summary)
      .flatMap((value) => (Array.isArray(value) ? value : [value]))
      .map((value) => (typeof value === "string" ? value : null))
      .filter(Boolean);
    return {
      summary: cleanText(values[0] || `${fallbackTitle} summary available.`),
      findingCount: null,
    };
  }

  return {
    summary: truncate(cleanText(JSON.stringify(parsed).slice(0, 220), `${fallbackTitle} available.`), 220),
    findingCount: null,
  };
}

function summarizeTextResearch(content, fallbackTitle) {
  const lines = content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("#"));
  return {
    summary: truncate(cleanText(lines[0] || `${fallbackTitle} available.`), 220),
    findingCount: null,
  };
}

async function buildResearchRecord(repoRoot, sourceGroup, filePath) {
  const relativePath = relativeToRepo(repoRoot, filePath);
  const [content, stats, siblingPaths] = await Promise.all([
    readText(filePath),
    fs.stat(filePath),
    fs.readdir(path.dirname(filePath)),
  ]);

  const extension = path.extname(filePath).toLowerCase();
  const fallbackTitle = path.basename(filePath);
  let summary = `${fallbackTitle} available.`;
  let findingCount = null;
  let title = fallbackTitle;

  if (extension === ".json") {
    try {
      const parsed = JSON.parse(content);
      const metadata = summarizeJsonResearch(parsed, fallbackTitle);
      summary = metadata.summary;
      findingCount = metadata.findingCount;
      title = cleanText(parsed.competitor || parsed.brand_slug || parsed.phase_name || parsed.type || fallbackTitle);
      if (parsed.run_id) {
        title = `${title} • ${parsed.run_id}`;
      }
    } catch {
      const metadata = summarizeTextResearch(content, fallbackTitle);
      summary = metadata.summary;
      findingCount = metadata.findingCount;
    }
  } else {
    const metadata = summarizeTextResearch(content, fallbackTitle);
    summary = metadata.summary;
    findingCount = metadata.findingCount;
  }

  const producedFiles = siblingPaths
    .filter((entry) => entry !== path.basename(filePath))
    .slice(0, 5)
    .map((entry) => entry.replace(/\\/g, "/"));

  return {
    id: relativePath,
    title,
    path: relativePath,
    sourceGroup,
    topic: topicFromResearchPath(relativePath),
    stage: stageFromResearchPath(relativePath),
    updatedAt: toIso(stats.mtimeMs),
    sizeLabel: formatBytes(stats.size),
    summary,
    findingCount,
    producedFiles,
    viewUrl: `/api/app/build-lab/file?path=${encodeURIComponent(relativePath)}`,
  };
}

async function loadResearchDashboardData(repoRoot = resolveRepoRoot()) {
  const roots = [
    { sourceGroup: "Lobster research logs", root: path.join(repoRoot, "lobster", "output", "logs") },
    { sourceGroup: "Workspace research logs", root: path.join(repoRoot, "output", "logs") },
    { sourceGroup: "Validated outputs", root: path.join(repoRoot, "generated", "validated") },
    { sourceGroup: "Engineering briefs", root: path.join(repoRoot, "docs", "briefs") },
    { sourceGroup: "Plans", root: path.join(repoRoot, "docs", "plans") },
    { sourceGroup: "Memory", root: path.join(repoRoot, "memory") },
  ];

  const records = [];
  const sourceStates = [];

  for (const entry of roots) {
    try {
      const stats = await fs.stat(entry.root);
      if (!stats.isDirectory()) {
        sourceStates.push({ id: entry.sourceGroup, label: entry.sourceGroup, path: entry.root, state: "unavailable", detail: "Configured path is not a directory." });
        continue;
      }

      const filePaths = await listFiles(entry.root, (filePath) => TEXT_FILE_PATTERN.test(filePath));
      sourceStates.push({
        id: entry.sourceGroup,
        label: entry.sourceGroup,
        path: entry.root,
        state: filePaths.length ? "connected" : "empty",
        detail: filePaths.length ? `${filePaths.length} research file${filePaths.length === 1 ? "" : "s"} discovered.` : "Source directory exists but has no matching files.",
      });

      for (const filePath of filePaths) {
        try {
          records.push(await buildResearchRecord(repoRoot, entry.sourceGroup, filePath));
        } catch {
          // keep unreadable file out of the timeline instead of inventing content
        }
      }
    } catch {
      sourceStates.push({ id: entry.sourceGroup, label: entry.sourceGroup, path: entry.root, state: "unavailable", detail: "Source directory unavailable." });
    }
  }

  records.sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0));
  const timeline = records.slice(0, 40);

  return {
    source: {
      kind: "filesystem",
      updatedAt: timeline[0]?.updatedAt || toIso(Date.now()),
      note:
        "Research Dashboard aggregates real workspace research logs, validated outputs, briefs, plans, and memory notes. It does not claim overnight activity unless those files actually exist.",
    },
    sourceStates,
    timeline,
    summary: {
      latestDate: timeline[0]?.updatedAt || null,
      totalRecords: timeline.length,
      keyFindingCount: timeline.reduce((total, record) => total + (record.findingCount || 0), 0),
      latestTopic: timeline[0]?.topic || null,
      latestPath: timeline[0]?.path || null,
    },
  };
}

function buildOverview({ prototypes, ideas, artifacts, research }) {
  const newestPrototype = prototypes.items[0] || null;
  const latestIdea = ideas.items[0] || null;
  const latestArtifact = artifacts.items.find((item) => item.updatedAt) || null;

  return {
    source: {
      kind: "derived",
      updatedAt: toIso(Date.now()),
      note: "Overview counts are derived from the real Build Lab section sources served by this module.",
    },
    tiles: {
      ideas: {
        totalCount: ideas.items.length,
        thisWeekCount: ideas.items.filter((item) => isThisWeek(item.date)).length,
        latestTitle: latestIdea?.title || null,
        latestState: latestIdea?.currentState || null,
      },
      prototypes: {
        runningCount: prototypes.stats.running,
        totalCount: prototypes.stats.total,
        newestName: newestPrototype?.name || null,
        newestStatus: newestPrototype?.status || null,
      },
      artifacts: {
        latestStatus: latestArtifact?.state || "unavailable",
        latestTitle: latestArtifact?.title || null,
        latestChangedPath: latestArtifact?.latestChangedPath || null,
        latestUpdatedAt: latestArtifact?.updatedAt || null,
      },
      research: {
        latestDate: research.summary.latestDate,
        keyFindingCount: research.summary.keyFindingCount,
        latestTopic: research.summary.latestTopic,
        latestPath: research.summary.latestPath,
      },
    },
  };
}

export async function loadBuildLabData() {
  const repoRoot = resolveRepoRoot();
  const trackRegistry = await loadTrackRegistry();
  const [prototypes, ideas, artifacts, research] = await Promise.all([
    loadPrototypeRegistryData(trackRegistry),
    loadIdeaBacklogData(trackRegistry),
    loadBuildArtifactsData(repoRoot, getMissionControlRoot()),
    loadResearchDashboardData(repoRoot),
  ]);

  return {
    source: {
      kind: "composite",
      updatedAt: toIso(Date.now()),
      note: "Build Lab combines the existing Mission Control planning registry with real filesystem, build artifact, research, and runtime-preview checks.",
    },
    overview: buildOverview({ prototypes, ideas, artifacts, research }),
    prototypes,
    ideas,
    artifacts,
    research,
  };
}

export async function loadBuildLabOverviewData() {
  const data = await loadBuildLabData();
  return data.overview;
}

export async function loadPrototypeRegistrySection() {
  return loadPrototypeRegistryData(await loadTrackRegistry());
}

export async function loadIdeaBacklogSection() {
  return loadIdeaBacklogData(await loadTrackRegistry());
}

export async function loadBuildArtifactsSection() {
  return loadBuildArtifactsData();
}

export async function loadResearchDashboardSection() {
  return loadResearchDashboardData();
}

const allowedFileRoots = [
  path.join(resolveRepoRoot(), "lobster", "output", "logs"),
  path.join(resolveRepoRoot(), "output", "logs"),
  path.join(resolveRepoRoot(), "generated", "validated"),
  path.join(resolveRepoRoot(), "docs", "briefs"),
  path.join(resolveRepoRoot(), "docs", "plans"),
  path.join(resolveRepoRoot(), "memory"),
  path.join(resolveRepoRoot(), "output", "meta-ads"),
];

export function isAllowedBuildLabFile(rawPath) {
  if (!rawPath) return false;
  const repoRoot = resolveRepoRoot();
  const absolute = path.resolve(repoRoot, rawPath);
  return allowedFileRoots.some((root) => absolute === root || absolute.startsWith(`${root}${path.sep}`));
}

export async function loadBuildLabFile(rawPath) {
  const repoRoot = resolveRepoRoot();
  const absolute = path.resolve(repoRoot, rawPath);
  const stats = await fs.stat(absolute);
  if (!stats.isFile()) {
    throw new Error("Requested Build Lab path is not a file.");
  }

  const ext = path.extname(absolute).toLowerCase();
  const contentType =
    ext === ".json"
      ? "application/json; charset=utf-8"
      : ext === ".html"
        ? "text/html; charset=utf-8"
        : "text/plain; charset=utf-8";

  return {
    content: await fs.readFile(absolute, "utf8"),
    contentType,
    filePath: absolute,
  };
}
