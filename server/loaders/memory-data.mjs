import fs from "node:fs/promises";
import path from "node:path";
import { existsSync, statSync } from "node:fs";
import { listFiles, resolveRepoRoot, toIso } from "../lib/fs-utils.mjs";

function sanitizePath(value) {
  return value
    .replace(/\.{2,}/g, "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+/, "/");
}



function normalizeForwardSlashes(value) {
  return value.replace(/\\/g, "/");
}

function isPinned(relativePath) {
  return relativePath === "MEMORY.md" || relativePath === "BACKLOG.md";
}

function toMeta(repoRoot, filePath, stats) {
  const relativePath = normalizeForwardSlashes(path.relative(repoRoot, filePath));
  return {
    path: relativePath,
    sizeBytes: stats.size,
    updatedAt: toIso(stats.mtimeMs),
    isPinned: isPinned(relativePath),
  };
}

export async function loadMemoryFiles() {
  const repoRoot = resolveRepoRoot();
  const candidates = [];
  const warnings = [];

  const memoryRoot = path.join(repoRoot, "memory");
  const explicit = [path.join(repoRoot, "MEMORY.md"), path.join(repoRoot, "BACKLOG.md")];

  for (const explicitPath of explicit) {
    if (existsSync(explicitPath)) {
      candidates.push(explicitPath);
    }
  }

  if (existsSync(memoryRoot)) {
    try {
      const nested = await listFiles(memoryRoot, (filePath) => filePath.endsWith(".md"));
      candidates.push(...nested);
    } catch (error) {
      warnings.push(`Failed to read memory directory at ${normalizeForwardSlashes(path.relative(repoRoot, memoryRoot))}: ${
        error instanceof Error ? error.message : "Unknown error"
      }`);
    }
  } else {
    warnings.push("No memory directory found at memory/.");
  }

  const uniqueByPath = new Set();
  const rows = [];

  for (const filePath of candidates) {
    try {
      const realPath = path.resolve(filePath);
      if (uniqueByPath.has(realPath)) continue;
      uniqueByPath.add(realPath);
      const stats = await fs.stat(realPath);
      if (!stats.isFile()) continue;
      rows.push(toMeta(repoRoot, realPath, stats));
    } catch (error) {
      warnings.push(`Unable to read file ${normalizeForwardSlashes(path.relative(repoRoot, filePath))}: ${
        error instanceof Error ? error.message : "Unknown error"
      }`);
    }
  }

  rows.sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });

  return { files: rows, warnings };
}

export async function loadMemoryFileContent(rawPath) {
  const repoRoot = resolveRepoRoot();
  if (typeof rawPath !== "string" || !rawPath.trim()) {
    const error = new Error("Missing required query path parameter.");
    error.code = "BAD_REQUEST";
    throw error;
  }

  const relativePath = sanitizePath(rawPath);
  const normalized = normalizeForwardSlashes(relativePath);
  const absolutePath = path.join(repoRoot, normalized);

  if (absolutePath.includes("..") || !absolutePath.startsWith(repoRoot)) {
    const error = new Error("Invalid path.");
    error.code = "BAD_REQUEST";
    throw error;
  }

  const isAllowed = normalized === "MEMORY.md" || normalized === "BACKLOG.md" || normalized.startsWith("memory/");
  if (!isAllowed) {
    const error = new Error(`Only MEMORY.md, BACKLOG.md, or files under memory/ are allowed.`);
    error.code = "BAD_REQUEST";
    throw error;
  }

  if (!existsSync(absolutePath)) {
    const error = new Error(`File not found: ${normalized}`);
    error.code = "NOT_FOUND";
    throw error;
  }

  try {
    const stats = await fs.stat(absolutePath);
    if (!stats.isFile()) {
      const error = new Error(`Path is not a file: ${normalized}`);
      error.code = "BAD_REQUEST";
      throw error;
    }
    const content = await fs.readFile(absolutePath, "utf8");
    return {
      path: normalized,
      content,
      updatedAt: toIso(stats.mtimeMs),
      sizeBytes: stats.size,
    };
  } catch (error) {
    if (error.code === "BAD_REQUEST" || error.code === "NOT_FOUND") throw error;
    const wrapped = new Error(`Unable to read file ${normalized}: ${error instanceof Error ? error.message : "Unknown error"}`);
    wrapped.code = "READ_ERROR";
    throw wrapped;
  }
}
