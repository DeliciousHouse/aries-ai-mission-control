import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const missionControlRoot = path.resolve(__dirname, "../..");

export function getMissionControlRoot() {
  return missionControlRoot;
}

export function resolveRepoRoot() {
  const candidates = [
    process.env.ARIES_APP_ROOT,
    "/app/aries-app",
    "/home/node/openclaw/aries-app",
    path.resolve(missionControlRoot, "../aries-app"),
    path.resolve(missionControlRoot, "../../aries-app"),
    path.resolve(missionControlRoot, "../../../aries-app"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const normalized = path.resolve(candidate);
    if (existsSync(path.join(normalized, "docs"))) {
      return normalized;
    }
  }

  throw new Error(`Unable to resolve Aries repo root. Checked: ${candidates.join(", ")}`);
}

export async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

export async function readText(filePath) {
  return fs.readFile(filePath, "utf8");
}

export async function readTextIfExists(filePath) {
  try {
    const [content, stats] = await Promise.all([fs.readFile(filePath, "utf8"), fs.stat(filePath)]);
    return { content, stats };
  } catch {
    return null;
  }
}

export async function listFiles(root, predicate = () => true) {
  const results = [];

  async function visit(current) {
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const next = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await visit(next);
      } else if (entry.isFile() && predicate(next)) {
        results.push(next);
      }
    }
  }

  await visit(root);
  return results;
}

export function toIso(value) {
  return new Date(value).toISOString();
}

export function relativeToRepo(repoRoot, targetPath) {
  return path.relative(repoRoot, targetPath).replace(/\\/g, "/");
}

export function formatBytes(value) {
  if (!Number.isFinite(value) || value <= 0) {return "0 B";}
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size >= 10 || index === 0 ? Math.round(size) : size.toFixed(1)} ${units[index]}`;
}

export function headingList(markdown) {
  return [...markdown.matchAll(/^#{1,6}\s+(.+)$/gm)].map((match) => match[1].trim());
}

export function summarizeMarkdown(markdown) {
  const lines = markdown
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("#"));
  return (lines[0] || "No summary available.").slice(0, 220);
}
