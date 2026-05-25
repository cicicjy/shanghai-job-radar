const { fetchJobs } = require("../lib/scraper");

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
    const data = await fetchJobs({
      query: query.q || "",
      industry: query.industry || "all",
      function: query.function || "all",
      originRegion: query.originRegion || "all",
      postedWithin: query.postedWithin || "all",
      minScore: query.minScore || 35,
      priority: query.priority || "all",
      company: query.company || "",
      sourceLimit: Number(query.sourceLimit || process.env.SOURCE_LIMIT || 87),
      timeoutMs: Number(query.timeoutMs || process.env.SCRAPE_TIMEOUT_MS || 9000),
      concurrency: Number(query.concurrency || process.env.SCRAPE_CONCURRENCY || 6),
    });
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(data));
  } catch (error) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(
      JSON.stringify({
        jobs: [],
        meta: {
          scannedAt: new Date().toISOString(),
          error: error.message || String(error),
        },
      }),
    );
  }
};
