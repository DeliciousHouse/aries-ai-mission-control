import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runOpenClawJson } from "../lib/cli.mjs";
import { toIso } from "../lib/fs-utils.mjs";

function resolveCronJobsPath() {
  return path.join(process.env.OPENCLAW_HOME || os.homedir(), ".openclaw", "cron", "jobs.json");
}

async function loadCronJobsPayload() {
  try {
    return JSON.parse(await fs.readFile(resolveCronJobsPath(), "utf8"));
  } catch {
    return await runOpenClawJson(["cron", "list", "--all", "--json"]);
  }
}

function toIsoIfNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? toIso(value) : null;
}

function normalizeStatus(job) {
  if (!job) return "unavailable";
  if (job.enabled === false) return "disabled";

  const last = (job.state?.lastRunStatus || job.state?.lastStatus || "").toLowerCase();
  if (!last) {
    return "unavailable";
  }

  if (["failed", "failure", "error", "errored", "fatal"].includes(last)) {
    return "failed";
  }

  if (last === "ok" || last === "success" || last === "passed") {
    return "healthy";
  }

  return "unavailable";
}

function statusCounts(jobs) {
  const tally = { healthy: 0, failed: 0, disabled: 0, unavailable: 0, disconnected: 0 };
  for (const job of jobs) {
    tally[job.status] = (tally[job.status] || 0) + 1;
  }
  return tally;
}

export async function loadCronHealthData() {
  const generatedAt = toIso(Date.now());
  const warnings = [];

  let listPayload;
  try {
    listPayload = await loadCronJobsPayload();
  } catch (error) {
    return {
      stats: { healthy: 0, failed: 0, disabled: 0, unavailable: 0, disconnected: 1 },
      jobs: [],
      warnings: [
        `Cron source unavailable: ${error instanceof Error ? error.message : "Unable to read cron surface via openclaw cron list --all --json."}`,
      ],
      generatedAt,
    };
  }

  const jobs = Array.isArray(listPayload?.jobs) ? listPayload.jobs : [];
  if (!jobs.length) {
    warnings.push("Cron list returned no jobs.");
  }

  const rows = jobs.map((job) => {
    const status = normalizeStatus(job);
    const id = job?.id || job?.name || "unknown-job";

    return {
      id,
      name: job?.name || job?.id || "Unnamed job",
      enabled: job?.enabled ?? true,
      status,
      lastRun: toIsoIfNumber(job?.state?.lastRunAtMs),
      nextRun: toIsoIfNumber(job?.state?.nextRunAtMs),
      lastError: job?.state?.lastError || null,
      schedule:
        job?.schedule?.expr ? `${job.schedule.expr}${job.schedule.tz ? ` (${job.schedule.tz})` : ""}` : "Unavailable",
    };
  });

  return {
    stats: statusCounts(rows),
    jobs: rows,
    warnings,
    generatedAt,
  };
}
