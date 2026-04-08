import fs from "node:fs/promises";
import path from "node:path";
import { listFiles, toIso, resolveRepoRoot } from "../lib/fs-utils.mjs";

function isBriefSource(filePath) {
  const lower = filePath.toLowerCase();
  if (lower.startsWith("docs/briefs/")) {return "brief";}
  if (lower.startsWith("docs/plans/")) {return "plan";}
  if (lower.includes("debrief")) {return "debrief";}
  if (lower.startsWith("memory/")) {return "implementation-lessons";}
  return "note";
}

async function scanDirectory(directory, predicate, files) {
  try {
    await fs.access(directory);
  } catch {
    return;
  }

  const matches = await listFiles(directory, predicate);
  for (const filePath of matches) {
    files.push(filePath);
  }
}

function deriveDeliveryStatus(relativePath, fileName, updatedAt) {
  if (!updatedAt) {return "Unknown";}

  const hasDatePrefix = /\b\d{4}-\d{2}-\d{2}\b/.test(fileName);
  if (relativePath.startsWith("docs/briefs/") && !hasDatePrefix) {
    return "Unknown";
  }

  const today = new Date();
  const fileDate = new Date(updatedAt);

  const sameDay =
    fileDate.getUTCFullYear() === today.getUTCFullYear() &&
    fileDate.getUTCMonth() === today.getUTCMonth() &&
    fileDate.getUTCDate() === today.getUTCDate();

  if (sameDay && hasDatePrefix) {
    return "Delivered";
  }

  return "Delivered";
}

function getTitle(content, fileName) {
  const heading = content.match(/^#\s+(.+)$/m);
  return heading?.[1]?.trim() ?? fileName;
}

function getPreview(content) {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
  return (lines[0] || "No preview available.").slice(0, 260);
}

export async function loadBriefingArchiveData() {
  const repoRoot = resolveRepoRoot();
  const warnings = [];
  const files = [];
  const candidateDirs = [
    path.join(repoRoot, "docs", "briefs"),
    path.join(repoRoot, "docs", "plans"),
    path.join(repoRoot, "debriefs"),
    path.join(repoRoot, "docs", "debriefs"),
  ];

  const seen = new Set();

  const addDirFromScan = async (dir, label) => {
    try {
      await scanDirectory(dir, (filePath) => filePath.endsWith(".md"), files);
    } catch (error) {
      warnings.push(`Unable to read ${label}: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  };

  await Promise.all(candidateDirs.map((dir) => addDirFromScan(dir, path.relative(repoRoot, dir))));

  const deduped = [];
  for (const filePath of files) {
    const relative = path.relative(repoRoot, filePath).replace(/\\/g, "/");
    if (seen.has(relative)) {continue;}
    seen.add(relative);
    deduped.push(filePath);
  }

  const items = [];
  for (const filePath of deduped) {
    try {
      const [content, stats] = await Promise.all([fs.readFile(filePath, "utf8"), fs.stat(filePath)]);
      const relativePath = path.relative(repoRoot, filePath).replace(/\\/g, "/");
      const updatedAt = toIso(stats.mtimeMs);
      const fileName = path.basename(relativePath);
      const type = isBriefSource(relativePath);
      const id = relativePath
        .replace(/\.md$/i, "")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");

      items.push({
        id,
        title: getTitle(content, fileName),
        type,
        path: relativePath,
        updatedAt,
        preview: getPreview(content),
        markdown: content,
        deliveryStatus: deriveDeliveryStatus(relativePath, fileName, updatedAt),
      });
    } catch (error) {
      const relativePath = path.relative(repoRoot, filePath).replace(/\\/g, "/");
      warnings.push(`Failed to read briefing source ${relativePath}: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  if (!items.length) {
    if (!files.length) {
      warnings.push("No qualifying briefing sources were found in docs/briefs, docs/plans, or debrief directories.");
    }
  }

  items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return {
    items,
    warnings,
  };
}
