import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const DEFAULT_TIMEOUT = Number(process.env.MISSION_CONTROL_OPENCLAW_TIMEOUT_MS || 30000);
const MAX_BUFFER = 1024 * 1024 * 8;

function resolveOpenClawBin() {
  if (process.env.OPENCLAW_BIN) {return process.env.OPENCLAW_BIN;}
  return "openclaw";
}

function resolveLegacyBundledOpenClawBin() {
  const localBin = path.resolve(process.cwd(), "node_modules/.bin/openclaw");
  if (existsSync(localBin)) {return localBin;}
  return null;
}

function resolveOpenClawCommandCwd() {
  return process.env.OPENCLAW_HOME || os.homedir();
}

function parseJsonCandidate(text) {
  const raw = typeof text === "string" ? text.trim() : "";
  if (!raw) {return null;}

  const direct = tryParse(raw);
  if (direct.ok) {return direct.value;}

  const objectIndex = raw.indexOf("{");
  const arrayIndex = raw.indexOf("[");
  const starts = [objectIndex, arrayIndex].filter((value) => value >= 0).toSorted((a, b) => a - b);

  for (const start of starts) {
    const sliced = raw.slice(start);
    const parsed = tryParse(sliced);
    if (parsed.ok) {return parsed.value;}
  }

  return null;
}

function tryParse(value) {
  try {
    return { ok: true, value: JSON.parse(value) };
  } catch {
    return { ok: false, value: null };
  }
}

async function runOpenClawCommand(args, { timeout = DEFAULT_TIMEOUT } = {}) {
  return execFileAsync(resolveOpenClawBin(), args, {
    timeout,
    maxBuffer: MAX_BUFFER,
    env: process.env,
    cwd: resolveOpenClawCommandCwd(),
  });
}

async function runLegacyBundledOpenClawCommand(args, { timeout = DEFAULT_TIMEOUT } = {}) {
  const legacyBin = resolveLegacyBundledOpenClawBin();
  if (!legacyBin || legacyBin === resolveOpenClawBin()) {
    return null;
  }
  return execFileAsync(legacyBin, args, {
    timeout,
    maxBuffer: MAX_BUFFER,
    env: process.env,
    cwd: resolveOpenClawCommandCwd(),
  });
}

export async function runOpenClawJson(args, { timeout = DEFAULT_TIMEOUT } = {}) {
  try {
    const { stdout = "", stderr = "" } = await runOpenClawCommand(args, { timeout });
    const parsed = parseJsonCandidate(stdout) ?? parseJsonCandidate(stderr);
    if (parsed !== null) {return parsed;}
    throw new Error("Unexpected end of JSON input");
  } catch (error) {
    const stdout = typeof error?.stdout === "string" ? error.stdout.trim() : "";
    const stderr = typeof error?.stderr === "string" ? error.stderr.trim() : "";
    const parsed = parseJsonCandidate(stdout) ?? parseJsonCandidate(stderr);
    if (parsed !== null) {return parsed;}

    const fallback = await runLegacyBundledOpenClawCommand(args, { timeout }).catch(() => null);
    if (fallback) {
      const parsedFallback = parseJsonCandidate(fallback.stdout) ?? parseJsonCandidate(fallback.stderr);
      if (parsedFallback !== null) {return parsedFallback;}
    }

    const detail = [stderr, stdout].filter(Boolean).join(" | ") || error.message;
    const wrapped = new Error(detail);
    wrapped.stdout = stdout;
    wrapped.stderr = stderr;
    throw wrapped;
  }
}

export async function runOpenClawText(args, { timeout = DEFAULT_TIMEOUT } = {}) {
  const { stdout } = await runOpenClawCommand(args, { timeout });
  return stdout;
}
