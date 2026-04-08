import path from "node:path";
import {
  headingList,
  listFiles,
  readTextIfExists,
  relativeToRepo,
  resolveRepoRoot,
  summarizeMarkdown,
  toIso,
} from "../lib/fs-utils.mjs";

function inferType(relativePath, markdown) {
  const lowerPath = relativePath.toLowerCase();
  const lowerMarkdown = markdown.toLowerCase();

  if (lowerPath.startsWith("docs/briefs/")) {return "daily-engineering-brief";}
  if (lowerPath === "docs/system-reference.md") {return "system-reference";}
  if (lowerPath.startsWith("memory/")) {return "implementation-lessons";}
  if (lowerPath.startsWith("docs/plans/")) {return "plan";}
  if (lowerPath.includes("blocker") || lowerMarkdown.includes("blocker")) {return "current-blockers";}
  if (lowerPath.includes("decision") || lowerMarkdown.includes("decision")) {return "decisions-made";}
  if (lowerPath.includes("handoff") || lowerMarkdown.includes("handoff")) {return "handoff-notes";}
  if (lowerPath.includes("bootcamp") || lowerMarkdown.includes("bootcamp")) {return "bootcamp-translation";}
  return "note";
}

function makeId(relativePath) {
  return relativePath.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export async function loadBriefingData() {
  const repoRoot = resolveRepoRoot();
  const sourceRoots = [
    path.join(repoRoot, "docs", "briefs"),
    path.join(repoRoot, "docs", "plans"),
    path.join(repoRoot, "memory"),
    path.join(repoRoot, "docs", "SYSTEM-REFERENCE.md"),
  ];

  const filePaths = [
    ...(await listFiles(path.join(repoRoot, "docs", "briefs"), (file) => file.endsWith(".md"))),
    ...(await listFiles(path.join(repoRoot, "docs", "plans"), (file) => file.endsWith(".md"))),
    ...(await listFiles(path.join(repoRoot, "memory"), (file) => file.endsWith(".md"))),
    path.join(repoRoot, "docs", "SYSTEM-REFERENCE.md"),
  ];

  const seen = new Set();
  const briefs = [];

  for (const filePath of filePaths) {
    if (seen.has(filePath)) {continue;}
    seen.add(filePath);
    const result = await readTextIfExists(filePath);
    if (!result) {continue;}

    const relativePath = relativeToRepo(repoRoot, filePath);
    const type = inferType(relativePath, result.content);
    briefs.push({
      id: makeId(relativePath),
      title:
        result.content.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? path.basename(filePath, path.extname(filePath)),
      type,
      path: relativePath,
      updatedAt: toIso(result.stats.mtimeMs),
      sourceGroup: relativePath.split("/")[0],
      summary: summarizeMarkdown(result.content),
      headings: headingList(result.content),
      markdown: result.content,
    });
  }

  briefs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const counts = new Map();
  for (const brief of briefs) {
    counts.set(brief.type, (counts.get(brief.type) || 0) + 1);
  }

  return {
    sourceRoots: sourceRoots.map((root) => relativeToRepo(repoRoot, root)),
    briefs,
    summary: {
      newestBriefId: briefs[0]?.id ?? null,
      briefCount: briefs.length,
      typeCounts: [...counts.entries()].map(([type, count]) => ({ type, count })),
    },
  };
}
