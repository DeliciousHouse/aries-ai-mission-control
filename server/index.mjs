import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ApiError, loadApiPath } from "./api.mjs";
import {
  boardErrorPayload,
  createProjectBoardTask,
  isBoardRequestPath,
  readJsonBody,
  updateProjectBoardTask,
} from "./lib/project-board.mjs";
import {
  approveRoutingRequest,
  ingestChiefReport,
  rejectRoutingRequest,
} from "./lib/routing-requests.mjs";
import { isAllowedBuildLabFile, loadBuildLabFile } from "./loaders/build-lab-data.mjs";
import { isAllowedStandupFile, loadStandupFile } from "./loaders/standup-data.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "..");
const distRoot = path.join(workspaceRoot, "dist");
const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || "4174");

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
};

const documentCacheControl = "public, max-age=0, must-revalidate";
const immutableAssetCacheControl = "public, max-age=31536000, immutable";
const apiCacheControl = "no-store";

const securityHeaders = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "style-src-attr 'unsafe-inline'",
    "connect-src 'self' https://control.sugarandleather.com",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join('; '),
  "Strict-Transport-Security": "max-age=2592000",
  "Cross-Origin-Opener-Policy": "same-origin",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
};

function buildHeaders(extra = {}) {
  return {
    ...securityHeaders,
    ...extra,
  };
}

function fileCacheControl(filePath) {
  const relativePath = path.relative(distRoot, filePath).replace(/\\/g, "/");
  if (relativePath.startsWith("assets/")) {
    return immutableAssetCacheControl;
  }
  if (path.extname(filePath) === ".html") {
    return documentCacheControl;
  }
  return documentCacheControl;
}

async function serveFile(filePath, res) {
  const ext = path.extname(filePath);
  const contentType = contentTypes[ext] || "application/octet-stream";
  const data = await fs.readFile(filePath);
  res.writeHead(
    200,
    buildHeaders({
      "Content-Type": contentType,
      "Cache-Control": fileCacheControl(filePath),
    }),
  );
  res.end(data);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || `${host}:${port}`}`);

    if (isBoardRequestPath(url.pathname) && req.method === "POST" && url.pathname === "/api/pm-board") {
      const body = await readJsonBody(req);
      const data = await createProjectBoardTask(body);
      res.writeHead(201, buildHeaders({
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": apiCacheControl,
      }));
      res.end(JSON.stringify({ data }));
      return;
    }

    if (isBoardRequestPath(url.pathname) && req.method === "PATCH") {
      const taskId = url.pathname.replace(/^\/api\/pm-board\//, "").trim();
      if (!taskId) {
        throw new ApiError("Task id is required for PATCH /api/pm-board/:id.", 400);
      }
      const body = await readJsonBody(req);
      const data = await updateProjectBoardTask(taskId, body);
      res.writeHead(200, buildHeaders({
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": apiCacheControl,
      }));
      res.end(JSON.stringify({ data }));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/routing-requests/from-chief-report") {
      const body = await readJsonBody(req);
      const data = await ingestChiefReport(body);
      res.writeHead(201, buildHeaders({
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": apiCacheControl,
      }));
      res.end(JSON.stringify({ data }));
      return;
    }

    if (req.method === "POST" && /^\/api\/routing-requests\/[^/]+\/(approve|reject)$/.test(url.pathname)) {
      const [, requestId, action] = url.pathname.match(/^\/api\/routing-requests\/([^/]+)\/(approve|reject)$/) || [];
      if (!requestId || !action) {
        throw new ApiError("Routing request action path is invalid.", 400);
      }
      const body = await readJsonBody(req);
      const data = action === "approve"
        ? await approveRoutingRequest(requestId, body)
        : await rejectRoutingRequest(requestId, body);
      res.writeHead(200, buildHeaders({
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": apiCacheControl,
      }));
      res.end(JSON.stringify({ data }));
      return;
    }

    if (url.pathname === "/api/app/build-lab/file") {
      const pathParam = url.searchParams.get("path") || "";
      if (!isAllowedBuildLabFile(pathParam)) {
        throw new ApiError("Invalid Build Lab file path.", 400);
      }
      const { content, contentType } = await loadBuildLabFile(pathParam);
      res.writeHead(200, buildHeaders({
        "Content-Type": contentType,
        "Cache-Control": apiCacheControl,
      }));
      res.end(content);
      return;
    }

    if (url.pathname === "/api/standups/file") {
      const pathParam = url.searchParams.get("path") || "";
      if (!isAllowedStandupFile(pathParam)) {
        throw new ApiError("Invalid standup file path.", 400);
      }
      const { content, contentType } = await loadStandupFile(pathParam);
      res.writeHead(200, buildHeaders({
        "Content-Type": contentType,
        "Cache-Control": apiCacheControl,
      }));
      res.end(content);
      return;
    }

    const apiPayload = await loadApiPath(url.pathname, url);

    if (apiPayload) {
      res.writeHead(200, buildHeaders({
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": apiCacheControl,
      }));
      res.end(JSON.stringify(apiPayload));
      return;
    }

    const safePath = path.normalize(url.pathname).replace(/^([.][.][/\\])+/, "");
    const requested = safePath === "/" ? path.join(distRoot, "index.html") : path.join(distRoot, safePath);

    try {
      const stats = await fs.stat(requested);
      if (stats.isFile()) {
        await serveFile(requested, res);
        return;
      }
    } catch {
      // fall through to SPA entry
    }

    await serveFile(path.join(distRoot, "index.html"), res);
  } catch (error) {
    if (error instanceof ApiError) {
      res.writeHead(error.status, buildHeaders({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": apiCacheControl }));
      res.end(JSON.stringify({ error: error.message }));
      return;
    }

    if (error?.name === "ValidationError" || error?.name === "NotFoundError") {
      res.writeHead(error.status || (error.name === "NotFoundError" ? 404 : 400), buildHeaders({
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": apiCacheControl,
      }));
      res.end(JSON.stringify(boardErrorPayload(error)));
      return;
    }

    res.writeHead(500, buildHeaders({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": apiCacheControl }));
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown server error" }));
  }
});

server.listen(port, host, () => {
  console.log(`Mission Control server listening on http://${host}:${port}`);
});
