import fs from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import { listFiles, resolveRepoRoot, toIso } from "../lib/fs-utils.mjs";

const repoRoot = resolveRepoRoot();
const meetingsRoot = path.join(repoRoot, "team", "meetings");

function normalizePath(filePath) {
  return path.relative(repoRoot, filePath).replace(/\\/g, "/");
}

function makeId(relativePath) {
  return relativePath.replace(/\.md$/i, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function splitFrontmatter(markdown) {
  if (!markdown.startsWith("---")) {
    return { metadata: {}, body: markdown };
  }

  const match = markdown.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?([\s\S]*)$/);
  if (!match) {
    return { metadata: {}, body: markdown };
  }

  const metadata = {};
  for (const rawLine of match[1].split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim().replace(/^['"]|['"]$/g, "");
    metadata[key] = value;
  }

  return {
    metadata,
    body: match[2] || "",
  };
}

function extractSection(body, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`^## ${escaped}\\s*$([\\s\\S]*?)(?=^## |\\Z)`, "m");
  const match = body.match(regex);
  return match?.[1]?.trim() || "";
}

function firstBullet(section) {
  const lines = (section || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const bullet = lines.find((line) => /^-\s+/.test(line));
  return bullet ? bullet.replace(/^-\s+/, "") : lines[0] || "No preview available.";
}

function chiefStatusFromSection(sectionBody, metadata, fallbackKey) {
  const explicit = sectionBody.match(/^-\s+report_status:\s+(.+)$/m)?.[1]?.trim();
  if (explicit) return explicit;
  if (fallbackKey && metadata[fallbackKey]) return metadata[fallbackKey];
  return "unknown";
}

function chiefAgentIdFromSection(sectionBody, metadata, fallbackKey) {
  const explicit = sectionBody.match(/^-\s+chief_agent_id:\s+(.+)$/m)?.[1]?.trim();
  if (explicit) return explicit;
  if (fallbackKey && metadata[fallbackKey]) return metadata[fallbackKey];
  return null;
}

function chiefIdFromSection(sectionBody) {
  return sectionBody.match(/^-\s+chief_id:\s+(.+)$/m)?.[1]?.trim() || null;
}

function extractChiefSections(body, metadata) {
  const chiefReports = extractSection(body, "Chief Reports");
  if (!chiefReports) return [];

  const regex = /^###\s+(.+?)\s*$([\s\S]*?)(?=^###\s+|\Z)/gm;
  const sections = [];
  let match;
  while ((match = regex.exec(chiefReports))) {
    const title = match[1].trim();
    const sectionBody = match[2].trim();
    const chiefId = chiefIdFromSection(sectionBody) || title.toLowerCase().split(" ")[0];
    const statusKey = chiefId === "forge" ? "forge_status" : chiefId === "signal" ? "signal_status" : chiefId === "ledger" ? "ledger_status" : null;
    const agentIdKey = chiefId === "forge" ? "forge_agent_id" : chiefId === "signal" ? "signal_agent_id" : chiefId === "ledger" ? "ledger_agent_id" : null;

    sections.push({
      chiefId,
      title,
      status: chiefStatusFromSection(sectionBody, metadata, statusKey),
      agentId: chiefAgentIdFromSection(sectionBody, metadata, agentIdKey),
      preview: firstBullet(extractSection(sectionBody, "Current Status") || sectionBody),
      markdown: `### ${title}\n${sectionBody}`.trim(),
    });
  }

  return sections;
}

function parseDateFromPath(relativePath, metadata, stats) {
  const explicit = metadata.date || relativePath.match(/(\d{4}-\d{2}-\d{2})/)?.[1];
  if (explicit) return explicit;
  return toIso(stats.mtimeMs).slice(0, 10);
}

function parseStatus(metadata, body) {
  const status = (metadata.status || "").trim().toLowerCase();
  if (["complete", "partial", "failed"].includes(status)) {
    return status;
  }

  const standupHealth = extractSection(body, "Standup Health").toLowerCase();
  if (standupHealth.includes("overall_status: failed")) return "failed";
  if (standupHealth.includes("overall_status: partial")) return "partial";
  if (standupHealth.includes("overall_status: complete")) return "complete";
  return "partial";
}

function computeSummary(items) {
  const summary = { latestId: null, total: items.length, complete: 0, partial: 0, failed: 0 };
  for (const item of items) {
    if (item.status === "complete") summary.complete += 1;
    else if (item.status === "failed") summary.failed += 1;
    else summary.partial += 1;
  }
  if (items[0]) summary.latestId = items[0].id;
  return summary;
}

const audioContentTypes = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".webm": "audio/webm",
};

export function isAllowedStandupFile(rawPath) {
  if (!rawPath || typeof rawPath !== "string") return false;
  const normalized = rawPath.replace(/\\/g, "/").replace(/^\/+/, "");
  return normalized.startsWith("team/meetings/");
}

export async function loadStandupFile(rawPath) {
  const normalized = rawPath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!isAllowedStandupFile(normalized)) {
    const error = new Error("Invalid standup file path.");
    error.code = "BAD_REQUEST";
    throw error;
  }

  const absolutePath = path.join(repoRoot, normalized);
  if (!absolutePath.startsWith(repoRoot) || !existsSync(absolutePath)) {
    const error = new Error(`Standup file not found: ${normalized}`);
    error.code = "NOT_FOUND";
    throw error;
  }

  const ext = path.extname(absolutePath).toLowerCase();
  const content = await fs.readFile(absolutePath);
  return {
    content,
    contentType: audioContentTypes[ext] || "application/octet-stream",
  };
}

export async function loadStandupArchiveData() {
  const warnings = [];
  let files = [];

  try {
    files = await listFiles(meetingsRoot, (filePath) => filePath.endsWith(".md") && !filePath.endsWith("README.md"));
  } catch (error) {
    warnings.push(`Unable to read team/meetings: ${error instanceof Error ? error.message : "Unknown error"}`);
  }

  const items = [];
  for (const filePath of files) {
    try {
      const [markdown, stats] = await Promise.all([fs.readFile(filePath, "utf8"), fs.stat(filePath)]);
      const relativePath = normalizePath(filePath);
      const { metadata, body } = splitFrontmatter(markdown);
      const date = parseDateFromPath(relativePath, metadata, stats);
      const chiefs = extractChiefSections(body, metadata);
      const topSummary = extractSection(body, "Top Summary");
      const standupHealth = extractSection(body, "Standup Health");
      const status = parseStatus(metadata, body);

      items.push({
        id: metadata.standup_id || makeId(relativePath),
        title: metadata.title || `Daily Standup — ${date}`,
        date,
        path: relativePath,
        updatedAt: toIso(stats.mtimeMs),
        generatedAt: metadata.generated_at || metadata.generatedAt || toIso(stats.mtimeMs),
        status,
        preview: firstBullet(topSummary || standupHealth || body),
        markdown,
        audioPath: metadata.audio_path || metadata.audioPath || null,
        delivery: metadata.delivery || "not-wired",
        boardPath: metadata.board_path || "/app/mission-control/server/data/execution-tasks.json",
        chiefs,
      });
    } catch (error) {
      warnings.push(`Failed to read standup transcript ${normalizePath(filePath)}: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  items.sort((left, right) => {
    const leftTime = Date.parse(left.generatedAt || left.updatedAt || "") || 0;
    const rightTime = Date.parse(right.generatedAt || right.updatedAt || "") || 0;
    return rightTime - leftTime;
  });

  if (!items.length) {
    warnings.push("No standup transcripts found in team/meetings.");
  }

  return {
    items,
    warnings,
    summary: computeSummary(items),
  };
}
