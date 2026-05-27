const { auditSources } = require("../lib/audit");

function readQuery(req) {
  const url = new URL(req.url || "/", "http://localhost");
  return Object.fromEntries(url.searchParams.entries());
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    const query = readQuery(req);
    const data = await auditSources({
      company: query.company || "",
      sourceId: query.sourceId || "",
      sampleSize: query.sampleSize || 8,
      minScore: query.minScore || 35,
      timeoutMs: Number(query.timeoutMs || process.env.SCRAPE_TIMEOUT_MS || 9000),
      concurrency: Number(query.concurrency || 3),
    });
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(data));
  } catch (error) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ checkedAt: new Date().toISOString(), error: error.message || String(error), results: [] }));
  }
};
