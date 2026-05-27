const http = require("http");
const fs = require("fs/promises");
const path = require("path");

const jobsHandler = require("./api/jobs");
const checkJobsHandler = require("./api/check-jobs");
const sourcesHandler = require("./api/sources");
const auditSourcesHandler = require("./api/audit-sources");

const root = __dirname;
const port = Number(process.env.PORT || 3000);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".md": "text/markdown; charset=utf-8",
};

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const normalized = path.normalize(decoded === "/" ? "/index.html" : decoded).replace(/^(\.\.[/\\])+/, "");
  return path.join(root, normalized);
}

async function serveStatic(req, res) {
  const filePath = safePath(req.url || "/");
  if (!filePath.startsWith(root)) {
    res.statusCode = 403;
    res.end("Forbidden");
    return;
  }
  try {
    const buffer = await fs.readFile(filePath);
    res.setHeader("Content-Type", mimeTypes[path.extname(filePath)] || "application/octet-stream");
    res.end(buffer);
  } catch {
    res.statusCode = 404;
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  if ((req.url || "").startsWith("/api/jobs")) {
    await jobsHandler(req, res);
    return;
  }
  if ((req.url || "").startsWith("/api/check-jobs")) {
    await checkJobsHandler(req, res);
    return;
  }
  if ((req.url || "").startsWith("/api/sources")) {
    await sourcesHandler(req, res);
    return;
  }
  if ((req.url || "").startsWith("/api/audit-sources")) {
    await auditSourcesHandler(req, res);
    return;
  }
  await serveStatic(req, res);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Cici Job Radar running at http://localhost:${port}`);
});
