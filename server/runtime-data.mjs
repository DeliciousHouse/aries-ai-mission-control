import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "..");
const repoRoot = resolveRepoRoot();
const docsRoot = path.join(repoRoot, "docs");
const briefsRoot = path.join(docsRoot, "briefs");
const memoryRoot = path.join(repoRoot, "memory");
const outputRoot = path.join(repoRoot, "output");
const systemReferencePath = path.join(docsRoot, "SYSTEM-REFERENCE.md");
const automationReadmePath = path.join(docsRoot, "automations", "README.md");
const automationInstallerPath = path.join(
  repoRoot,
  "scripts",
  "automations",
  "install-openclaw-crons.mjs",
);
const automationManifestPath = path.join(repoRoot, "scripts", "automations", "manifest.mjs");
const automationJobsPromise = import(pathToFileURL(automationManifestPath).href).then((module) =>
  Array.isArray(module.automationJobs) ? module.automationJobs : [],
);
const ariesDistPath = path.join(repoRoot, "dist");
const ariesNextPath = path.join(repoRoot, ".next");
const missionControlDistPath = path.join(workspaceRoot, "dist");
const missionControlDistCheckPath = path.join(workspaceRoot, "dist-check");
const cronStorePath =
  process.env.MISSION_CONTROL_CRON_STORE_PATH || "/home/node/.openclaw/cron/jobs.json";
const cronRunsRoot = path.join(path.dirname(cronStorePath), "runs");
const cliCommand = process.env.OPENCLAW_BIN || "openclaw";
const cliTimeoutMs = Number(process.env.MISSION_CONTROL_OPENCLAW_TIMEOUT_MS || 5000);
const cliMaxBuffer = 1024 * 1024;

function resolveRepoRoot() {
  const candidateRoots = [
    process.env.ARIES_APP_ROOT,
    path.resolve(workspaceRoot, "../aries-app"),
    path.resolve(workspaceRoot, "../../../aries-app"),
  ].filter(Boolean);

  for (const candidateRoot of candidateRoots) {
    const normalizedRoot = path.resolve(candidateRoot);
    const manifestPath = path.join(normalizedRoot, "scripts", "automations", "manifest.mjs");
    if (existsSync(manifestPath)) {
      return normalizedRoot;
    }
  }

  const checkedRoots = candidateRoots
    .map((candidateRoot) => path.resolve(candidateRoot))
    .join(", ");
  throw new Error(`Unable to locate Aries app root. Checked: ${checkedRoots || "(none)"}`);
}

function toIso(value) {
  return value.toISOString();
}

function toRelativePath(targetPath) {
  return path.relative(repoRoot, targetPath).replace(/\\/g, "/");
}

function extractSection(markdown, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`## ${escaped}\\n([\\s\\S]*?)(?=\\n## |$)`, "m");
  const match = markdown.match(pattern);
  return match ? match[1].trim() : "";
}

function bulletLines(section) {
  return section
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim());
}

function parseGeneratedLine(markdown, fallbackMtime) {
  const match = markdown.match(/Generated\s+(.+?)\./);
  if (!match) {
    return fallbackMtime.toLocaleString("en-US", { timeZone: "America/Los_Angeles" });
  }
  return match[1];
}

function formatTimeAgo(date) {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.max(0, Math.round(diffMs / 60000));
  if (diffMin < 1) {
    return "just now";
  }
  if (diffMin < 60) {
    return `${diffMin} min ago`;
  }
  const diffHours = Math.round(diffMin / 60);
  if (diffHours < 24) {
    return `${diffHours} hr ago`;
  }
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

function formatDisplayTime(value) {
  if (!value) {
    return "Unknown";
  }
  const date = typeof value === "number" ? new Date(value) : value;
  return date.toLocaleString("en-US", { timeZone: "America/Los_Angeles" });
}

function formatBytes(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size >= 10 || unitIndex === 0 ? Math.round(size) : size.toFixed(1)} ${units[unitIndex]}`;
}

function summarizePrototype(relativePath, snippet, sizeLabel) {
  const extension = path.extname(relativePath).replace(".", "").toUpperCase() || "FILE";
  const normalized = snippet.replace(/\s+/g, " ").trim();
  const preview = normalized ? normalized.slice(0, 140) : "No inline preview available.";
  return `${extension} artifact • ${sizeLabel} • ${preview}`;
}

async function listFilesRecursive(rootPath, matcher = () => true) {
  const results = [];

  async function visit(currentPath) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const nextPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        await visit(nextPath);
        continue;
      }

      if (entry.isFile() && matcher(nextPath)) {
        results.push(nextPath);
      }
    }
  }

  try {
    await visit(rootPath);
  } catch {
    return [];
  }

  return results;
}

async function gatherDirectoryStats(rootPath) {
  const files = await listFilesRecursive(rootPath);
  let sizeBytes = 0;
  let newestMtimeMs = 0;

  for (const filePath of files) {
    try {
      const stats = await fs.stat(filePath);
      sizeBytes += stats.size;
      newestMtimeMs = Math.max(newestMtimeMs, stats.mtimeMs);
    } catch {
      // ignore disappearing files
    }
  }

  return {
    fileCount: files.length,
    sizeBytes,
    newestIso: newestMtimeMs ? toIso(new Date(newestMtimeMs)) : null,
  };
}

async function getPrototypeFiles() {
  const allowedExtensions = new Set([".md", ".html", ".css", ".json", ".txt"]);
  const files = await listFilesRecursive(outputRoot, (filePath) =>
    allowedExtensions.has(path.extname(filePath).toLowerCase()),
  );
  const records = [];

  for (const filePath of files) {
    const result = await readIfExists(filePath);
    if (!result) {
      continue;
    }

    const relativePath = toRelativePath(filePath);
    const category = relativePath.split("/").slice(0, -1).join("/") || "output";
    const snippet = result.content.replace(/\r\n/g, "\n").slice(0, 900);

    records.push({
      id: relativePath,
      title: path.basename(filePath),
      path: relativePath,
      kind: path.extname(filePath).replace(".", "") || "file",
      category,
      updatedAtIso: toIso(result.stats.mtime),
      sizeBytes: result.stats.size,
      sizeLabel: formatBytes(result.stats.size),
      summary: summarizePrototype(relativePath, snippet, formatBytes(result.stats.size)),
      snippet,
    });
  }

  return records.toSorted((a, b) => b.updatedAtIso.localeCompare(a.updatedAtIso)).slice(0, 18);
}

async function getBuildArtifacts() {
  const definitions = [
    { id: "aries-dist", title: "Aries dist bundle", path: ariesDistPath, kind: "production-dist" },
    { id: "aries-next", title: "Aries Next bundle", path: ariesNextPath, kind: "next-build" },
    {
      id: "mission-control-dist",
      title: "Mission Control dist",
      path: missionControlDistPath,
      kind: "standalone-dist",
    },
    {
      id: "mission-control-dist-check",
      title: "Mission Control dist-check",
      path: missionControlDistCheckPath,
      kind: "validation-build",
    },
  ];

  const artifacts = [];
  for (const definition of definitions) {
    try {
      const stats = await fs.stat(definition.path);
      if (!stats.isDirectory()) {
        continue;
      }
      const directoryStats = await gatherDirectoryStats(definition.path);

      artifacts.push({
        id: definition.id,
        title: definition.title,
        path: definition.path.startsWith(repoRoot)
          ? toRelativePath(definition.path)
          : path.relative(workspaceRoot, definition.path).replace(/\\/g, "/"),
        kind: definition.kind,
        updatedAtIso: directoryStats.newestIso,
        fileCount: directoryStats.fileCount,
        sizeBytes: directoryStats.sizeBytes,
        sizeLabel: formatBytes(directoryStats.sizeBytes),
        summary: `${directoryStats.fileCount} file${directoryStats.fileCount === 1 ? "" : "s"} • ${formatBytes(directoryStats.sizeBytes)} • ${directoryStats.newestIso ? `updated ${formatDisplayTime(new Date(directoryStats.newestIso))}` : "no timestamp"}`,
      });
    } catch {
      // ignore missing directories
    }
  }

  return artifacts.toSorted((a, b) => (b.updatedAtIso ?? "").localeCompare(a.updatedAtIso ?? ""));
}

function parseSelfImproveSections(markdown, filePath) {
  const blocks = [];
  const headings = [...markdown.matchAll(/^## Overnight self-improvement — (.+)$/gm)];

  for (let index = 0; index < headings.length; index += 1) {
    const match = headings[index];
    const heading = match[1]?.trim() ?? "Overnight self-improvement";
    const start = match.index + match[0].length + 1;
    const end = index + 1 < headings.length ? headings[index + 1].index : markdown.length;
    const body = markdown.slice(start, end);
    const lines = body
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("- "))
      .map((line) => line.slice(2).trim());

    const focus =
      lines.find((line) => line.startsWith("focus:"))?.replace(/^focus:\s*/, "") ?? "unknown";
    const findingsRaw =
      lines.find((line) => line.startsWith("findings:"))?.replace(/^findings:\s*/, "") ?? null;
    const fixes =
      lines
        .find((line) => line.startsWith("low-risk fixes applied:"))
        ?.replace(/^low-risk fixes applied:\s*/, "") ?? "unknown";
    const examplesRaw =
      lines.find((line) => line.startsWith("examples:"))?.replace(/^examples:\s*/, "") ?? "none";
    const parsedDate = new Date(heading);

    blocks.push({
      id: `${path.basename(filePath)}:${heading}`,
      path: toRelativePath(filePath),
      timestampIso: Number.isNaN(parsedDate.getTime()) ? null : toIso(parsedDate),
      timestampLabel: heading,
      focus,
      findings: findingsRaw && /^\d+$/.test(findingsRaw) ? Number(findingsRaw) : null,
      fixes,
      examples:
        examplesRaw === "none"
          ? []
          : examplesRaw
              .split("|")
              .map((value) => value.trim())
              .filter(Boolean),
    });
  }

  return blocks;
}

async function getSelfImprovementLogs() {
  const files = await listFilesRecursive(memoryRoot, (filePath) => filePath.endsWith(".md"));
  const entries = [];

  for (const filePath of files) {
    const result = await readIfExists(filePath);
    if (!result) {
      continue;
    }
    entries.push(...parseSelfImproveSections(result.content, filePath));
  }

  return entries
    .toSorted((a, b) => (b.timestampIso ?? "").localeCompare(a.timestampIso ?? ""))
    .slice(0, 20);
}

async function getChronologicalBuildLogs(selfImprovementLogs) {
  const runs = [];
  const jobsRaw = await fs.readFile(cronStorePath, "utf8").catch(() => null);
  const parsedJobs = jobsRaw ? safeJsonParse(jobsRaw) : null;
  const jobsById = new Map(
    Array.isArray(parsedJobs?.jobs) ? parsedJobs.jobs.map((job) => [job.id, job]) : [],
  );
  const runFiles = await listFilesRecursive(cronRunsRoot, (filePath) =>
    filePath.endsWith(".jsonl"),
  );

  for (const filePath of runFiles) {
    const raw = await fs.readFile(filePath, "utf8").catch(() => null);
    if (!raw) {
      continue;
    }

    for (const line of raw
      .split("\n")
      .map((entry) => entry.trim())
      .filter(Boolean)) {
      const parsed = safeJsonParse(line);
      if (!parsed || parsed.action !== "finished") {
        continue;
      }
      const job = jobsById.get(parsed.jobId) ?? null;
      const status = normalizeStatus(parsed.status);
      const summaryLine =
        typeof parsed.summary === "string"
          ? (parsed.summary.split("\n").find(Boolean) ?? parsed.summary)
          : (parsed.error ?? "No summary available.");
      const detail =
        typeof parsed.summary === "string"
          ? parsed.summary
              .split("\n")
              .slice(1)
              .map((entry) => entry.trim())
              .filter(Boolean)
              .slice(0, 4)
          : [];

      runs.push({
        id: `${parsed.jobId}:${parsed.ts}`,
        kind: "cron",
        title: job?.name ?? parsed.jobId ?? "Cron run",
        status,
        timestampIso: typeof parsed.ts === "number" ? toIso(new Date(parsed.ts)) : null,
        timestampLabel: typeof parsed.ts === "number" ? formatDisplayTime(parsed.ts) : "Unknown",
        summary: summaryLine,
        detail: [parsed.error ? `Error: ${parsed.error}` : null, ...detail].filter(Boolean),
        path: filePath,
        jobId: parsed.jobId ?? undefined,
      });
    }
  }

  const selfImproveEntries = selfImprovementLogs.map((entry) => ({
    id: `self-improve:${entry.id}`,
    kind: "self-improvement",
    title: `Self-improvement — ${entry.focus}`,
    status: "success",
    timestampIso: entry.timestampIso,
    timestampLabel: entry.timestampLabel,
    summary: `${entry.findings ?? 0} finding${entry.findings === 1 ? "" : "s"} • fixes ${entry.fixes}`,
    detail: [
      `Source: ${entry.path}`,
      `Focus: ${entry.focus}`,
      entry.examples.length ? `Examples: ${entry.examples.join("; ")}` : "Examples: none",
    ],
    path: entry.path,
  }));

  return [...runs, ...selfImproveEntries]
    .toSorted((a, b) => (b.timestampIso ?? "").localeCompare(a.timestampIso ?? ""))
    .slice(0, 40);
}

function normalizeStatus(status) {
  if (status === "ok" || status === "success") {
    return "success";
  }
  if (status === "error" || status === "failed" || status === "failure") {
    return "failure";
  }
  if (status === "running") {
    return "running";
  }
  return "unknown";
}

function mapRunStateToLabel(state) {
  if (state === "success") {
    return "Recent run succeeded";
  }
  if (state === "failure") {
    return "Recent run failed";
  }
  if (state === "running") {
    return "Run in progress";
  }
  if (state === "unregistered") {
    return "Not registered in scheduler";
  }
  return "Recent run unknown";
}

function mapRegistrationToLabel(state) {
  if (state === "registered") {
    return "Registered in scheduler";
  }
  if (state === "registered-with-drift") {
    return "Registered with schedule drift";
  }
  if (state === "not-registered") {
    return "Configured in manifest only";
  }
  return "Scheduler registration unknown";
}

function buildPrompt(script) {
  return [
    "Work in /app/aries-app.",
    `Run ${script}.`,
    "If the script reports an error, return a concise failure summary with the next corrective action.",
    "If the script succeeds, return only the concise alert summary emitted by the script.",
  ].join(" ");
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function shellEscape(value) {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

async function runOpenClaw(args) {
  const command = `env -u OPENCLAW_GATEWAY_URL ${shellEscape(cliCommand)} ${args.map(shellEscape).join(" ")}`;
  const { stdout } = await execFileAsync("sh", ["-lc", command], {
    cwd: repoRoot,
    timeout: cliTimeoutMs,
    maxBuffer: cliMaxBuffer,
    env: process.env,
  });

  const parsed = safeJsonParse(stdout);
  if (parsed === null) {
    throw new Error(`Failed to parse JSON from: ${cliCommand} ${args.join(" ")}`);
  }

  return parsed;
}

async function getSchedulerSnapshot() {
  const checkedAtIso = toIso(new Date());

  try {
    const [statusResult, jobsResult] = await Promise.all([
      runOpenClaw(["cron", "status"]),
      runOpenClaw(["cron", "list", "--all", "--json"]),
    ]);

    return {
      checkedAtIso,
      source: "openclaw-cli",
      accessible: true,
      error: null,
      status: {
        enabled: typeof statusResult.enabled === "boolean" ? statusResult.enabled : null,
        storePath:
          typeof statusResult.storePath === "string" ? statusResult.storePath : cronStorePath,
        jobCount: typeof statusResult.jobs === "number" ? statusResult.jobs : null,
        nextWakeAtIso:
          typeof statusResult.nextWakeAtMs === "number"
            ? toIso(new Date(statusResult.nextWakeAtMs))
            : null,
      },
      jobs: Array.isArray(jobsResult.jobs) ? jobsResult.jobs : [],
    };
  } catch (error) {
    try {
      const raw = await fs.readFile(cronStorePath, "utf8");
      const parsed = safeJsonParse(raw);
      const jobs = Array.isArray(parsed?.jobs) ? parsed.jobs : [];

      return {
        checkedAtIso,
        source: "openclaw-cron-store",
        accessible: true,
        error: error instanceof Error ? error.message : "Scheduler CLI query failed",
        status: {
          enabled: null,
          storePath: cronStorePath,
          jobCount: jobs.length,
          nextWakeAtIso: null,
        },
        jobs,
      };
    } catch (fallbackError) {
      return {
        checkedAtIso,
        source: "openclaw-cron-store",
        accessible: false,
        error: fallbackError instanceof Error ? fallbackError.message : "Scheduler query failed",
        status: {
          enabled: null,
          storePath: cronStorePath,
          jobCount: null,
          nextWakeAtIso: null,
        },
        jobs: [],
      };
    }
  }
}

async function getRunsForJob(jobId) {
  try {
    const filePath = path.join(cronRunsRoot, `${jobId}.jsonl`);
    const raw = await fs.readFile(filePath, "utf8");
    const entries = raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => safeJsonParse(line))
      .filter(Boolean)
      .slice(-5)
      .toReversed();

    return {
      accessible: true,
      error: null,
      entries,
    };
  } catch (error) {
    return {
      accessible: false,
      error: error instanceof Error ? error.message : "Run history query failed",
      entries: [],
    };
  }
}

function parseSystemReference(markdown, stats) {
  const refreshed =
    markdown.match(/Last refreshed\s+(.+?)\./)?.[1] ??
    stats.mtime.toLocaleString("en-US", { timeZone: "America/Los_Angeles" });
  const changedToday = bulletLines(extractSection(markdown, "What changed today"));
  const architecture = bulletLines(extractSection(markdown, "Current architecture overview"));
  const moduleInventory = bulletLines(extractSection(markdown, "Module inventory")).map((line) => {
    const match = line.match(/^(.*?)\s+(\d+) files$/);
    return match
      ? { name: match[1], fileCount: Number(match[2]) }
      : { name: line, fileCount: null };
  });
  const activeCronJobs = bulletLines(extractSection(markdown, "Active cron jobs"));
  const runtimeScripts = bulletLines(extractSection(markdown, "Runtime scripts"));
  const knownIssues = bulletLines(extractSection(markdown, "Known issues"));
  const workingTreeSnapshot = bulletLines(extractSection(markdown, "Working tree snapshot"));
  const referenceDate = bulletLines(extractSection(markdown, "Reference date"))[0] ?? null;

  return {
    id: "system",
    refreshed,
    changedToday,
    architecture,
    moduleInventory,
    activeCronJobs,
    runtimeScripts,
    knownIssues,
    workingTreeSnapshot,
    referenceDate,
    path: toRelativePath(systemReferencePath),
    updatedAtIso: toIso(stats.mtime),
  };
}

function parseBrief(markdown, filePath, stats) {
  const title = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? path.basename(filePath);
  const generated = parseGeneratedLine(markdown, stats.mtime);
  const priorities = bulletLines(extractSection(markdown, "Priorities for today"));
  const overnightActivity = bulletLines(extractSection(markdown, "Overnight activity"));
  const pendingActions = bulletLines(extractSection(markdown, "Pending action items"));
  const needsAttention = bulletLines(extractSection(markdown, "Needs attention"));
  const automationNote = bulletLines(extractSection(markdown, "Overnight automation note"));
  const filename = path.basename(filePath);
  const date = filename.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;

  return {
    id: filename.replace(/\.md$/i, ""),
    title,
    generated,
    filename,
    date,
    path: toRelativePath(filePath),
    updatedAtIso: toIso(stats.mtime),
    priorities,
    overnightActivity,
    pendingActions,
    needsAttention,
    automationNote,
  };
}

function summarizeSchedulerCoverage(jobStatuses, schedulerSnapshot) {
  const registered = jobStatuses.filter(
    (job) => job.scheduler.registration.state === "registered",
  ).length;
  const drift = jobStatuses.filter(
    (job) => job.scheduler.registration.state === "registered-with-drift",
  ).length;
  const manifestOnly = jobStatuses.filter(
    (job) => job.scheduler.registration.state === "not-registered",
  ).length;
  const failures = jobStatuses.filter((job) => job.scheduler.recentRun.state === "failure").length;
  const successes = jobStatuses.filter((job) => job.scheduler.recentRun.state === "success").length;

  return {
    state: schedulerSnapshot.accessible
      ? registered > 0 || drift > 0
        ? "partially-verified"
        : "configured-only"
      : "scheduler-unavailable",
    label: schedulerSnapshot.accessible
      ? `${registered + drift}/${jobStatuses.length} manifest jobs registered`
      : "Scheduler state unavailable",
    detail: schedulerSnapshot.accessible
      ? manifestOnly > 0
        ? `${manifestOnly} manifest job${manifestOnly === 1 ? "" : "s"} are not registered in the local scheduler.`
        : "Every manifest job has a scheduler entry; review run health for failures or drift."
      : (schedulerSnapshot.error ??
        "OpenClaw scheduler could not be queried from this environment."),
    manifestCount: jobStatuses.length,
    registeredCount: registered,
    driftCount: drift,
    manifestOnlyCount: manifestOnly,
    recentSuccessCount: successes,
    recentFailureCount: failures,
    schedulerAccessible: schedulerSnapshot.accessible,
    schedulerEnabled: schedulerSnapshot.status.enabled,
    schedulerJobTotal: schedulerSnapshot.status.jobCount,
    schedulerStorePath: schedulerSnapshot.status.storePath,
    checkedAtIso: schedulerSnapshot.checkedAtIso,
    error: schedulerSnapshot.error,
  };
}

function buildOpsSessions(jobs, systemReference, latestBrief, cronReadiness) {
  const urgentWorkingTree = systemReference.workingTreeSnapshot.slice(0, 6);
  const latestBriefSummary = latestBrief
    ? (latestBrief.needsAttention[0] ??
      latestBrief.pendingActions[0] ??
      "Latest brief is present but did not surface an urgent item.")
    : "No generated daily brief is available yet.";

  return [
    {
      id: "ops-cron-contract",
      title: "Automation schedule contract",
      owner: "scripts/automations/manifest.mjs",
      status:
        cronReadiness.schedulerAccessible && cronReadiness.manifestOnlyCount === 0
          ? "Active"
          : cronReadiness.schedulerAccessible
            ? "Review"
            : "Blocked",
      model: "Codex 5.3",
      preview: `${jobs.length} automation jobs are defined in the manifest. ${cronReadiness.label}.`,
      context: cronReadiness.detail,
      lastActivity: formatTimeAgo(new Date(cronReadiness.checkedAtIso)),
      nextAction: cronReadiness.schedulerAccessible
        ? cronReadiness.manifestOnlyCount > 0
          ? "Register missing manifest jobs or explicitly accept that Mission Control can only verify configuration."
          : "Review recent run health and any schedule drift before trusting unattended execution."
        : "Restore local OpenClaw scheduler visibility before using Mission Control as a cron health surface.",
      href: jobs[0] ? `/automations/${jobs[0].id}` : undefined,
      detail: [
        `Manifest jobs: ${cronReadiness.manifestCount}`,
        `Registered: ${cronReadiness.registeredCount}`,
        `Drift: ${cronReadiness.driftCount}`,
        `Recent failures: ${cronReadiness.recentFailureCount}`,
      ],
    },
    {
      id: "ops-system-reference",
      title: "System reference operational scan",
      owner: "docs/SYSTEM-REFERENCE.md",
      status: systemReference.knownIssues.length ? "Active" : "Waiting",
      model: "Gemini 3 Pro",
      preview:
        systemReference.changedToday[0] ??
        "System reference is current but did not record a material same-day change.",
      context:
        systemReference.knownIssues[0] ??
        "No known issues were captured in the current system reference.",
      lastActivity: formatTimeAgo(new Date(systemReference.updatedAtIso)),
      nextAction: urgentWorkingTree.length
        ? "Resolve or stage the highest-signal working tree items called out by the reference."
        : "Keep the rolling system reference refreshed so Ops has current architecture context.",
      href: "/reference/system",
      detail: [
        `Reference date: ${systemReference.referenceDate ?? "unknown"}`,
        `Known issues: ${systemReference.knownIssues.length}`,
        ...urgentWorkingTree.slice(0, 3).map((item) => `Working tree: ${item}`),
      ],
    },
    {
      id: "ops-brief-attention",
      title: "Latest brief attention lane",
      owner: "docs/briefs",
      status: latestBrief ? "Active" : "Blocked",
      model: "Gemini 3 Pro",
      preview: latestBriefSummary,
      context: latestBrief
        ? `${latestBrief.title} is available for Brain, but Ops can use its attention list to decide what needs execution pressure.`
        : "No brief file has been generated yet, so the shell cannot surface daily priorities from docs/briefs.",
      lastActivity: latestBrief ? formatTimeAgo(new Date(latestBrief.updatedAtIso)) : "No output",
      nextAction: latestBrief
        ? "Review the brief attention list and convert unresolved items into tracked execution work."
        : "Run the daily brief automation so Ops has a current operational summary.",
      href: latestBrief ? `/briefs/${latestBrief.id}` : undefined,
      detail: latestBrief
        ? latestBrief.needsAttention.slice(0, 4).map((item) => `Needs attention: ${item}`)
        : ["Expected source: docs/briefs/YYYY-MM-DD-brief.md"],
    },
  ];
}

function buildBrainSessions(briefs, systemReference) {
  const latestBrief = briefs[0];
  const archiveDepth = briefs.length;

  return [
    {
      id: "brain-latest-brief",
      title: latestBrief ? latestBrief.title : "Daily brief unavailable",
      owner: latestBrief ? latestBrief.path : "docs/briefs",
      status: latestBrief ? "Active" : "Blocked",
      model: "Gemini 3 Pro",
      preview: latestBrief
        ? (latestBrief.priorities[0] ??
          latestBrief.pendingActions[0] ??
          "Latest brief is available but did not contain a priority bullet.")
        : "No generated brief file was found under docs/briefs.",
      context: latestBrief
        ? (latestBrief.automationNote[0] ??
          "The latest brief is available for direct reading in Mission Control.")
        : "Brain currently depends on the daily brief automation output to render real context.",
      lastActivity: latestBrief ? formatTimeAgo(new Date(latestBrief.updatedAtIso)) : "No output",
      nextAction: latestBrief
        ? "Review the full brief sections and decide which items need to become explicit actions."
        : "Generate the next brief file so Brain can render live daily context.",
      href: latestBrief ? `/briefs/${latestBrief.id}` : undefined,
      detail: latestBrief
        ? [
            `Priorities: ${latestBrief.priorities.length}`,
            `Pending actions: ${latestBrief.pendingActions.length}`,
            `Needs attention: ${latestBrief.needsAttention.length}`,
          ]
        : ["Expected source: docs/briefs/YYYY-MM-DD-brief.md"],
    },
    {
      id: "brain-reference-context",
      title: "Rolling system reference digest",
      owner: systemReference.path,
      status: "Review",
      model: "Codex 5.3",
      preview:
        systemReference.architecture[0] ?? "System reference did not expose an architecture line.",
      context:
        systemReference.knownIssues[0] ??
        "No known issue is currently captured in the system reference.",
      lastActivity: formatTimeAgo(new Date(systemReference.updatedAtIso)),
      nextAction:
        "Use the architecture and issue digest to keep downstream agent context aligned before work fans out.",
      href: "/reference/system",
      detail: [
        `Architecture bullets: ${systemReference.architecture.length}`,
        `Runtime scripts tracked: ${systemReference.runtimeScripts.length}`,
        `Cron jobs listed: ${systemReference.activeCronJobs.length}`,
      ],
    },
    {
      id: "brain-brief-archive",
      title: "Brief archive continuity",
      owner: "docs/briefs",
      status: archiveDepth > 0 ? "Waiting" : "Blocked",
      model: "Gemini 3 Pro",
      preview:
        archiveDepth > 0
          ? `${archiveDepth} brief file${archiveDepth === 1 ? "" : "s"} available for continuity and trend review.`
          : "No archived briefs exist yet, so continuity context is not available.",
      context:
        archiveDepth > 0
          ? `Most recent files: ${briefs
              .slice(0, 3)
              .map((brief) => brief.filename)
              .join(", ")}`
          : "Archive depth will appear automatically as daily brief outputs accumulate.",
      lastActivity: latestBrief ? formatTimeAgo(new Date(latestBrief.updatedAtIso)) : "No output",
      nextAction:
        archiveDepth > 0
          ? "Use recent brief history when comparing changes in priorities or unresolved issues."
          : "Allow at least one brief run to populate the archive surface.",
      href: latestBrief ? `/briefs/${latestBrief.id}` : undefined,
      detail: briefs.slice(0, 3).map((brief) => `Archive file: ${brief.filename}`),
    },
  ];
}

function buildLabSessions(
  briefs,
  systemReference,
  cronReadiness,
  prototypes,
  overnightBuilds,
  selfImprovementLogs,
) {
  return [
    {
      id: "lab-adapter-health",
      title: "Local adapter health check",
      owner: "mission-control/server/runtime-data.mjs",
      status: cronReadiness.schedulerAccessible ? "Active" : "Review",
      model: "Codex 5.3",
      preview:
        "Mission Control now reads filesystem-backed Aries sources and only maps scheduler state onto Aries manifest jobs instead of treating the whole global cron store as product data.",
      context: `Primary sources: docs/briefs, docs/SYSTEM-REFERENCE.md, scripts/automations/manifest.mjs, OpenClaw cron CLI. Unrelated global cron jobs or orphaned run logs should not be interpreted as Ops/Brain/Lab data.`,
      lastActivity: formatTimeAgo(new Date(systemReference.updatedAtIso)),
      nextAction:
        "Keep the adapter contract narrow so it can be replaced with true Aries APIs later without redesigning the UI.",
      href: "/reference/system",
      detail: [
        `Brief files visible: ${briefs.length}`,
        `Scheduler accessible: ${cronReadiness.schedulerAccessible ? "yes" : "no"}`,
        `System reference path: ${systemReference.path}`,
      ],
    },
    {
      id: "lab-prototype-surface",
      title: "Prototype artifact surface",
      owner: "output/",
      status: prototypes.length ? "Active" : "Blocked",
      model: "Codex 5.3",
      preview:
        prototypes[0]?.summary ?? "No filesystem-backed prototype artifacts were found in output/.",
      context: prototypes.length
        ? `${prototypes.length} recent prototype file${prototypes.length === 1 ? "" : "s"} are available for overlay inspection from the Lab dashboard.`
        : "Lab needs real local prototype outputs before this module can act as a review surface.",
      lastActivity: prototypes[0]
        ? formatTimeAgo(new Date(prototypes[0].updatedAtIso))
        : "No output",
      nextAction: prototypes.length
        ? "Open the most recent prototype cards and decide which artifacts deserve promotion or repair."
        : "Generate local prototype outputs under output/ to populate this lane.",
      detail: prototypes.slice(0, 4).map((prototype) => `${prototype.title} • ${prototype.path}`),
    },
    {
      id: "lab-build-trace",
      title: "Overnight build trace",
      owner: "dist artifacts",
      status: overnightBuilds.length ? "Review" : "Blocked",
      model: "Gemini 3 Pro",
      preview:
        overnightBuilds[0]?.summary ??
        "No build directories were found for Aries or Mission Control.",
      context: overnightBuilds.length
        ? "Lab tracks production and validation build directories directly from the local filesystem so freshness stays source-backed."
        : "Build directories are missing, so Lab cannot report overnight build freshness yet.",
      lastActivity: overnightBuilds[0]?.updatedAtIso
        ? formatTimeAgo(new Date(overnightBuilds[0].updatedAtIso))
        : "No build data",
      nextAction: overnightBuilds.length
        ? "Compare dist freshness with cron/build logs before trusting the visible artifact set."
        : "Produce build artifacts locally so Lab can report overnight bundles.",
      detail: overnightBuilds.slice(0, 4).map((build) => `${build.title} • ${build.summary}`),
    },
    {
      id: "lab-self-improve",
      title: "Self-improvement memory trail",
      owner: "memory/*.md",
      status: selfImprovementLogs.length ? "Active" : "Blocked",
      model: "Gemini 3 Pro",
      preview: selfImprovementLogs[0]
        ? `${selfImprovementLogs[0].timestampLabel} • focus ${selfImprovementLogs[0].focus}`
        : "No overnight self-improvement logs were found in memory/.",
      context: selfImprovementLogs[0]
        ? `Latest run recorded ${selfImprovementLogs[0].findings ?? 0} findings with fixes ${selfImprovementLogs[0].fixes}.`
        : "Lab expects the overnight self-improvement automation to append to memory/YYYY-MM-DD.md.",
      lastActivity: selfImprovementLogs[0]?.timestampIso
        ? formatTimeAgo(new Date(selfImprovementLogs[0].timestampIso))
        : "No logs",
      nextAction: selfImprovementLogs.length
        ? "Use the Build Logs tab to compare memory notes with cron execution summaries."
        : "Run the self-improvement automation so Lab has a real log trail.",
      detail: selfImprovementLogs
        .slice(0, 4)
        .map((entry) => `${entry.focus} • fixes ${entry.fixes}`),
    },
  ];
}

async function readIfExists(filePath) {
  try {
    const [content, stats] = await Promise.all([fs.readFile(filePath, "utf8"), fs.stat(filePath)]);
    return { content, stats };
  } catch {
    return null;
  }
}

async function getBriefFiles() {
  try {
    const dirEntries = await fs.readdir(briefsRoot, { withFileTypes: true });
    const files = dirEntries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => path.join(briefsRoot, entry.name))
      .toSorted((a, b) => b.localeCompare(a));

    const briefs = [];
    for (const filePath of files) {
      const result = await readIfExists(filePath);
      if (!result) {
        continue;
      }
      briefs.push(parseBrief(result.content, filePath, result.stats));
    }

    return briefs;
  } catch {
    return [];
  }
}

async function loadBaseContext() {
  const automationJobs = await automationJobsPromise;
  const [
    systemReferenceResult,
    readmeResult,
    installerStats,
    manifestStats,
    briefs,
    schedulerSnapshot,
    prototypes,
    overnightBuilds,
    selfImprovementLogs,
  ] = await Promise.all([
    readIfExists(systemReferencePath),
    readIfExists(automationReadmePath),
    fs.stat(automationInstallerPath).catch(() => null),
    fs.stat(automationManifestPath).catch(() => null),
    getBriefFiles(),
    getSchedulerSnapshot(),
    getPrototypeFiles(),
    getBuildArtifacts(),
    getSelfImprovementLogs(),
  ]);

  if (!systemReferenceResult) {
    throw new Error(`Missing required source: ${systemReferencePath}`);
  }

  const systemReference = parseSystemReference(
    systemReferenceResult.content,
    systemReferenceResult.stats,
  );
  const automationReadme = readmeResult?.content ?? "";
  const latestBrief = briefs[0] ?? null;
  const adapterGeneratedAt = new Date();
  const schedulerJobsByName = new Map();

  for (const schedulerJob of schedulerSnapshot.jobs) {
    if (typeof schedulerJob?.name === "string" && !schedulerJobsByName.has(schedulerJob.name)) {
      schedulerJobsByName.set(schedulerJob.name, schedulerJob);
    }
  }

  const jobStatuses = [];
  for (const job of automationJobs) {
    const prompt = buildPrompt(job.script);
    const matchingByName = schedulerJobsByName.get(job.name) ?? null;
    const promptMatch =
      schedulerSnapshot.jobs.find((entry) => entry?.payload?.message === prompt) ?? null;
    const schedulerJob = matchingByName ?? promptMatch ?? null;
    const scheduleMatches = schedulerJob
      ? schedulerJob?.schedule?.expr === job.cron && schedulerJob?.schedule?.tz === job.tz
      : null;
    const registrationState = !schedulerSnapshot.accessible
      ? "unknown"
      : schedulerJob
        ? scheduleMatches
          ? "registered"
          : "registered-with-drift"
        : "not-registered";
    const runs = schedulerJob
      ? await getRunsForJob(schedulerJob.id)
      : { accessible: true, error: null, entries: [] };
    const recentRunEntry =
      runs.entries.find((entry) => entry?.action === "finished") ?? runs.entries[0] ?? null;
    const recentRunState = !schedulerSnapshot.accessible
      ? "unknown"
      : !schedulerJob
        ? "unregistered"
        : normalizeStatus(recentRunEntry?.status ?? schedulerJob?.state?.lastRunStatus);
    const lastRunAtMs = recentRunEntry?.runAtMs ?? schedulerJob?.state?.lastRunAtMs ?? null;
    const nextRunAtMs = schedulerJob?.state?.nextRunAtMs ?? null;
    const lastError = recentRunEntry?.error ?? schedulerJob?.state?.lastError ?? null;

    jobStatuses.push({
      id: job.id,
      name: job.name,
      cron: job.cron,
      tz: job.tz,
      script: job.script,
      purpose: job.purpose,
      source: {
        manifest: toRelativePath(automationManifestPath),
        installer: toRelativePath(automationInstallerPath),
        docs: toRelativePath(automationReadmePath),
        manifestUpdatedAtIso: manifestStats ? toIso(manifestStats.mtime) : null,
        installerUpdatedAtIso: installerStats ? toIso(installerStats.mtime) : null,
      },
      scheduler: {
        checkedAtIso: schedulerSnapshot.checkedAtIso,
        registration: {
          state: registrationState,
          label: mapRegistrationToLabel(registrationState),
          registeredInScheduler:
            registrationState === "registered" || registrationState === "registered-with-drift",
          scheduleMatchesManifest: scheduleMatches,
          schedulerJobId: schedulerJob?.id ?? null,
          schedulerJobName: schedulerJob?.name ?? null,
          schedulerEnabled:
            typeof schedulerJob?.enabled === "boolean" ? schedulerJob.enabled : null,
          detail:
            registrationState === "registered-with-drift"
              ? `Scheduler entry exists but differs from manifest schedule ${job.cron} ${job.tz}.`
              : registrationState === "registered"
                ? "Scheduler entry matches the manifest schedule and timezone."
                : registrationState === "not-registered"
                  ? "No matching scheduler entry was found for this manifest job."
                  : (schedulerSnapshot.error ??
                    "Scheduler state is not readable from this environment."),
        },
        recentRun: {
          state: recentRunState,
          label: mapRunStateToLabel(recentRunState),
          lastRunAtIso: typeof lastRunAtMs === "number" ? toIso(new Date(lastRunAtMs)) : null,
          nextRunAtIso: typeof nextRunAtMs === "number" ? toIso(new Date(nextRunAtMs)) : null,
          durationMs: recentRunEntry?.durationMs ?? schedulerJob?.state?.lastDurationMs ?? null,
          consecutiveErrors: schedulerJob?.state?.consecutiveErrors ?? null,
          lastError,
          runsAccessible: runs.accessible,
          runsError: runs.error,
        },
        recentRuns: runs.entries.map((entry) => ({
          action: entry.action ?? "unknown",
          status: normalizeStatus(entry.status),
          runAtIso: typeof entry.runAtMs === "number" ? toIso(new Date(entry.runAtMs)) : null,
          finishedAtIso: typeof entry.ts === "number" ? toIso(new Date(entry.ts)) : null,
          durationMs: entry.durationMs ?? null,
          error: entry.error ?? null,
          sessionId: entry.sessionId ?? null,
          sessionKey: entry.sessionKey ?? null,
          deliveryStatus: entry.deliveryStatus ?? null,
        })),
      },
      runtime: {
        installerPresent: automationReadme.includes("install-openclaw-crons.mjs"),
        announceSupport: automationReadme.includes("--announce"),
        installPrompt: `node scripts/automations/install-openclaw-crons.mjs --apply`,
      },
    });
  }

  const cronReadiness = summarizeSchedulerCoverage(jobStatuses, schedulerSnapshot);

  const adapter = {
    name: "local-runtime-modules",
    description:
      "Filesystem-backed Mission Control adapter with read-only OpenClaw scheduler inspection constrained to Aries manifest jobs.",
    sources: [
      { path: toRelativePath(systemReferencePath), kind: "system-reference" },
      { path: toRelativePath(briefsRoot), kind: "brief-directory" },
      { path: toRelativePath(automationManifestPath), kind: "automation-manifest" },
      { path: toRelativePath(automationReadmePath), kind: "automation-docs" },
      { path: "openclaw cron status/list/runs", kind: "scheduler-cli" },
    ],
  };

  const models = [
    { id: "codex-5-3", label: "Codex 5.3", role: "Execution + coding", availability: "primary" },
    {
      id: "gemini-3-pro",
      label: "Gemini 3 Pro",
      role: "Research + synthesis",
      availability: "ready",
    },
  ];

  const summary = {
    briefCount: briefs.length,
    automationJobCount: jobStatuses.length,
    registeredAutomationJobCount: cronReadiness.registeredCount + cronReadiness.driftCount,
    knownIssueCount: systemReference.knownIssues.length,
    workingTreeItemCount: systemReference.workingTreeSnapshot.length,
    latestBriefDate: latestBrief?.date ?? null,
  };

  return {
    generatedAtIso: toIso(adapterGeneratedAt),
    repoRoot,
    adapter,
    models,
    summary,
    scheduler: schedulerSnapshot.status,
    systemReference,
    briefs,
    latestBrief,
    jobs: jobStatuses,
    cronReadiness,
    prototypes,
    overnightBuilds,
    selfImprovementLogs,
    buildLogs: await getChronologicalBuildLogs(selfImprovementLogs),
  };
}

export async function loadOpsModule() {
  const context = await loadBaseContext();

  return {
    module: "ops",
    generatedAtIso: context.generatedAtIso,
    repoRoot: context.repoRoot,
    adapter: context.adapter,
    models: context.models,
    summary: context.summary,
    scheduler: context.scheduler,
    ops: {
      automationJobs: context.jobs,
      cronReadiness: context.cronReadiness,
      systemReference: context.systemReference,
      sessions: buildOpsSessions(
        context.jobs,
        context.systemReference,
        context.latestBrief,
        context.cronReadiness,
      ),
    },
  };
}

export async function loadBrainModule() {
  const context = await loadBaseContext();

  return {
    module: "brain",
    generatedAtIso: context.generatedAtIso,
    repoRoot: context.repoRoot,
    adapter: context.adapter,
    models: context.models,
    summary: context.summary,
    brain: {
      latestBrief: context.latestBrief,
      briefs: context.briefs.slice(0, 10),
      systemReference: context.systemReference,
      sessions: buildBrainSessions(context.briefs, context.systemReference),
    },
  };
}

export async function loadLabModule() {
  const context = await loadBaseContext();

  return {
    module: "lab",
    generatedAtIso: context.generatedAtIso,
    repoRoot: context.repoRoot,
    adapter: context.adapter,
    models: context.models,
    summary: context.summary,
    scheduler: context.scheduler,
    lab: {
      sources: context.adapter.sources,
      cronReadiness: context.cronReadiness,
      prototypes: context.prototypes,
      overnightBuilds: context.overnightBuilds,
      selfImprovementLogs: context.selfImprovementLogs,
      buildLogs: context.buildLogs,
      sessions: buildLabSessions(
        context.briefs,
        context.systemReference,
        context.cronReadiness,
        context.prototypes,
        context.overnightBuilds,
        context.selfImprovementLogs,
      ),
    },
  };
}

export async function loadRuntimeOverview() {
  const [opsModule, brainModule, labModule] = await Promise.all([
    loadOpsModule(),
    loadBrainModule(),
    loadLabModule(),
  ]);

  return {
    generatedAtIso: opsModule.generatedAtIso,
    repoRoot: opsModule.repoRoot,
    adapter: opsModule.adapter,
    models: opsModule.models,
    summary: opsModule.summary,
    scheduler: opsModule.scheduler,
    ops: opsModule.ops,
    brain: brainModule.brain,
    lab: labModule.lab,
  };
}

export async function loadBriefDetail(briefId) {
  const briefs = await getBriefFiles();
  const brief = briefs.find((entry) => entry.id === briefId);

  if (!brief) {
    throw new Error(`Brief not found: ${briefId}`);
  }

  const absolutePath = path.join(repoRoot, brief.path);
  const result = await readIfExists(absolutePath);
  if (!result) {
    throw new Error(`Brief source missing: ${brief.path}`);
  }

  return {
    kind: "brief-detail",
    generatedAtIso: toIso(new Date()),
    brief: {
      ...brief,
      sections: [
        { title: "Priorities for today", items: brief.priorities },
        { title: "Overnight activity", items: brief.overnightActivity },
        { title: "Pending action items", items: brief.pendingActions },
        { title: "Needs attention", items: brief.needsAttention },
        { title: "Overnight automation note", items: brief.automationNote },
      ],
      markdown: result.content,
    },
  };
}

export async function loadSystemReferenceDetail() {
  const result = await readIfExists(systemReferencePath);
  if (!result) {
    throw new Error(`Missing required source: ${systemReferencePath}`);
  }

  const reference = parseSystemReference(result.content, result.stats);

  return {
    kind: "system-reference-detail",
    generatedAtIso: toIso(new Date()),
    reference: {
      ...reference,
      sections: [
        { title: "What changed today", items: reference.changedToday },
        { title: "Current architecture overview", items: reference.architecture },
        {
          title: "Module inventory",
          items: reference.moduleInventory.map(
            (entry) => `${entry.name} — ${entry.fileCount ?? "unknown"} files`,
          ),
        },
        { title: "Active cron jobs", items: reference.activeCronJobs },
        { title: "Runtime scripts", items: reference.runtimeScripts },
        { title: "Known issues", items: reference.knownIssues },
        { title: "Working tree snapshot", items: reference.workingTreeSnapshot },
      ],
      markdown: result.content,
    },
  };
}

export async function loadAutomationJobDetail(jobId) {
  const context = await loadBaseContext();
  const job = context.jobs.find((entry) => entry.id === jobId);

  if (!job) {
    throw new Error(`Automation job not found: ${jobId}`);
  }

  return {
    kind: "automation-job-detail",
    generatedAtIso: toIso(new Date()),
    job: {
      ...job,
      summary: {
        configuredInManifest: true,
        schedulerRegistration: job.scheduler.registration.state,
        recentRunState: job.scheduler.recentRun.state,
        lastRunAtLabel: job.scheduler.recentRun.lastRunAtIso
          ? formatDisplayTime(new Date(job.scheduler.recentRun.lastRunAtIso))
          : "No recorded run",
        nextRunAtLabel: job.scheduler.recentRun.nextRunAtIso
          ? formatDisplayTime(new Date(job.scheduler.recentRun.nextRunAtIso))
          : "Not scheduled locally",
      },
    },
  };
}

export async function loadRuntimePath(pathname) {
  if (pathname === "/api/runtime/overview") {
    return loadRuntimeOverview();
  }
  if (pathname === "/api/runtime/ops") {
    return loadOpsModule();
  }
  if (pathname === "/api/runtime/brain") {
    return loadBrainModule();
  }
  if (pathname === "/api/runtime/lab") {
    return loadLabModule();
  }
  if (pathname === "/api/runtime/reference/system") {
    return loadSystemReferenceDetail();
  }

  const briefMatch = pathname.match(/^\/api\/runtime\/briefs\/([^/]+)$/);
  if (briefMatch) {
    return loadBriefDetail(decodeURIComponent(briefMatch[1]));
  }

  const jobMatch = pathname.match(/^\/api\/runtime\/jobs\/([^/]+)$/);
  if (jobMatch) {
    return loadAutomationJobDetail(decodeURIComponent(jobMatch[1]));
  }

  return null;
}
