const fs = require("fs/promises");
const path = require("path");

const DEFAULT_STATE_FILE = path.join(process.cwd(), ".job-cache", "seen-jobs.json");
const DEFAULT_STATE_KEY = process.env.JOB_STATE_KEY || "cici-job-radar-seen";

function emptyState() {
  return {
    seen: {},
    lastRunAt: null,
  };
}

function normalizeState(value) {
  if (!value) return emptyState();
  if (Array.isArray(value)) {
    return {
      seen: Object.fromEntries(value.map((id) => [id, new Date().toISOString()])),
      lastRunAt: null,
    };
  }
  if (typeof value === "string") {
    try {
      return normalizeState(JSON.parse(value));
    } catch {
      return emptyState();
    }
  }
  return {
    seen: value.seen && typeof value.seen === "object" ? value.seen : {},
    lastRunAt: value.lastRunAt || null,
  };
}

function hasKvConfig() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

async function redisCommand(command) {
  const response = await fetch(process.env.KV_REST_API_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(command),
  });
  if (!response.ok) {
    throw new Error(`KV command failed: ${response.status}`);
  }
  return response.json();
}

async function readKvState(key = DEFAULT_STATE_KEY) {
  if (!hasKvConfig()) return null;
  const data = await redisCommand(["GET", key]);
  return normalizeState(data.result);
}

async function writeKvState(state, key = DEFAULT_STATE_KEY) {
  if (!hasKvConfig()) return false;
  await redisCommand(["SET", key, JSON.stringify(state)]);
  return true;
}

async function readFileState(file = process.env.JOB_STATE_FILE || DEFAULT_STATE_FILE) {
  try {
    const raw = await fs.readFile(file, "utf8");
    return normalizeState(JSON.parse(raw));
  } catch {
    return emptyState();
  }
}

async function writeFileState(state, file = process.env.JOB_STATE_FILE || DEFAULT_STATE_FILE) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  return true;
}

async function readState(options = {}) {
  if (options.preferFile) {
    return readFileState(options.file);
  }
  if (hasKvConfig()) {
    try {
      return await readKvState(options.key);
    } catch (error) {
      if (!options.allowFileFallback) throw error;
    }
  }
  return readFileState(options.file);
}

async function writeState(state, options = {}) {
  if (options.preferFile) {
    return writeFileState(state, options.file);
  }
  if (hasKvConfig()) {
    try {
      return await writeKvState(state, options.key);
    } catch (error) {
      if (!options.allowFileFallback) throw error;
    }
  }
  return writeFileState(state, options.file);
}

function findNewJobs(jobs, state, options = {}) {
  const minScore = Number(options.minScore || process.env.ALERT_MIN_SCORE || 62);
  const seen = normalizeState(state).seen;
  return jobs.filter((job) => job.match.score >= minScore && !seen[job.id]);
}

function updateStateWithJobs(state, jobs) {
  const next = normalizeState(state);
  const now = new Date().toISOString();
  for (const job of jobs) {
    next.seen[job.id] = next.seen[job.id] || now;
  }
  next.lastRunAt = now;
  return next;
}

module.exports = {
  emptyState,
  findNewJobs,
  hasKvConfig,
  readState,
  updateStateWithJobs,
  writeState,
};
