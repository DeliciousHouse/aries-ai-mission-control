import fs from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import { listFiles, resolveRepoRoot } from "../lib/fs-utils.mjs";
import { runOpenClawJson } from "../lib/cli.mjs";

const APP_SKILL_ROOT = resolveRepoRoot();

const SKILL_ROOTS = {
  Workspace: path.join(APP_SKILL_ROOT, "skills"),
  Local: "/app/skills",
  Bundled: path.join(process.cwd(), "node_modules", "openclaw", "skills"),
  BundledExtensions: "/app/dist/extensions",
};

function splitFrontmatter(rawContent) {
  if (!rawContent.startsWith("---")) {
    return { parsed: false, name: null, description: "", error: null };
  }

  const matcher = /^---\s*[\r\n]+([\s\S]*?)\r?\n---/;
  const match = rawContent.match(matcher);
  if (!match) {
    return { parsed: false, name: null, description: "", error: "Malformed frontmatter" };
  }

  const frontmatter = match[1].trim();
  const fields = new Map();

  for (const rawLine of frontmatter.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim();
    const value = line
      .slice(colon + 1)
      .trim()
      .replace(/^"|"$/g, "")
      .replace(/^'|'$/g, "");
    fields.set(key, value);
  }

  return {
    parsed: true,
    name: fields.get("name") || null,
    description: fields.get("description") || "",
    error: null,
  };
}

function deriveCategory(source, filePath) {
  const normalized = filePath.replace(/\\/g, "/");
  const base =
    source === "Workspace"
      ? SKILL_ROOTS.Workspace
      : source === "Local"
        ? SKILL_ROOTS.Local
        : source === "Bundled"
          ? SKILL_ROOTS.Bundled
          : SKILL_ROOTS.BundledExtensions;

  const remainder = normalized
    .replace(base, "")
    .replace(/^\//, "")
    .split("/");
  if (!remainder.length || !remainder[0]) return null;
  return remainder[0] || null;
}

function uniquePathKey(filePath) {
  return filePath.replace(/\\/g, "/").toLowerCase();
}

function toReferenceRows(skillName, cronRefs) {
  const rows = [];

  for (const item of cronRefs.slice(0, 8)) {
    rows.push({
      kind: "automation",
      label: "OpenClaw Cron",
      detail: item,
    });
  }

  if (!rows.length) {
    return [];
  }

  return rows;
}

function buildCronLinks(jobs) {
  const linksBySkill = new Map();

  for (const job of jobs) {
    const jobName = job?.name || job?.id || "Unnamed job";
    const payloadText = JSON.stringify(job?.payload || {});
    const match = payloadText.match(/"[\/a-zA-Z0-9_-]*skill[a-zA-Z0-9_-]*"\s*:\s*"([a-zA-Z0-9_-]+)"/g);

    if (match) {
      for (const hit of match) {
        const skill = hit.match(/"[a-zA-Z0-9_-]+"\s*:\s*"([a-zA-Z0-9_-]+)"/)?.[1];
        if (!skill) continue;
        const entry = linksBySkill.get(skill) ?? [];
        entry.push(`Cron: ${jobName}`);
        linksBySkill.set(skill, entry);
      }
    }

    const quotedWords = payloadText.match(/([a-z0-9-]+(?:_[a-z0-9-]+){0,2})/gi) || [];
    for (const token of quotedWords) {
      const key = token.trim();
      if (!key.includes("skill")) continue;
      const entry = linksBySkill.get(key) ?? [];
      entry.push(`Cron: ${jobName}`);
      linksBySkill.set(key, entry);
    }
  }

  return linksBySkill;
}

async function collectCronReferences() {
  try {
    const result = await runOpenClawJson(["cron", "list", "--all", "--json"]);
    const jobs = Array.isArray(result?.jobs) ? result.jobs : [];
    return buildCronLinks(jobs);
  } catch {
    return new Map();
  }
}

async function readSkillFilesBySource() {
  const roots = [
    { source: "Workspace", base: SKILL_ROOTS.Workspace },
    { source: "Local", base: SKILL_ROOTS.Local },
    { source: "Bundled", base: path.join(process.cwd(), "node_modules", "openclaw", "skills") },
    { source: "Bundled", base: SKILL_ROOTS.BundledExtensions },
  ];

  const discovered = [];
  for (const root of roots) {
    if (!existsSync(root.base)) continue;
    try {
      const filePaths = await listFiles(root.base, (filePath) => {
        const normalized = filePath.replace(/\\/g, "/");
        return normalized.endsWith("/SKILL.md");
      });
      for (const filePath of filePaths) {
        discovered.push({ source: root.source, filePath });
      }
    } catch {
      continue;
    }
  }

  return discovered;
}

function dedupeByPath(items) {
  const seen = new Set();
  const out = [];
  for (const entry of items) {
    const key = uniquePathKey(entry.path);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  return out;
}

export async function loadSkillsCatalogData() {
  const repoRoot = resolveRepoRoot();
  const warnings = [];
  let discovered = [];

  try {
    discovered = await readSkillFilesBySource();
  } catch (error) {
    warnings.push(`Unable to enumerate skill files: ${error instanceof Error ? error.message : "Unknown error"}`);
  }

  const records = [];

  const cronLinks = await collectCronReferences();

  for (const item of discovered) {
    try {
      const raw = await fs.readFile(item.filePath, "utf8");
      const parsed = splitFrontmatter(raw);
      const normalizedPath = item.filePath.replace(/\\/g, "/");
      const repoRelative = path.relative(repoRoot, item.filePath).replace(/\\/g, "/");
      const nameFromPath = normalizedPath.split("/").slice(-2, -1)[0];
      const skillName = parsed.name || nameFromPath;

      const refs = cronLinks
        .get(skillName) || cronLinks.get(`/${normalizedPath}`) || [];

      records.push({
        name: skillName,
        description: parsed.description,
        path: repoRelative,
        source: item.source,
        category: deriveCategory(item.source, item.filePath),
        frontmatterParsed: parsed.parsed,
        frontmatterError: parsed.error,
        references: refs.length ? toReferenceRows(skillName, refs) : [],
      });
    } catch (error) {
      warnings.push(
        `Failed to read skill at ${item.filePath.replace(/\\/g, "/")}: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  const unique = dedupeByPath(records);

  const categories = [...new Set(unique.map((item) => item.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));

  return {
    records: unique,
    categories,
    warnings,
  };
}
