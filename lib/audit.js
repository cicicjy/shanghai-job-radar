const { careerSources } = require("./sources");
const { filterSources, scanSource } = require("./scraper");

function shuffle(items) {
  return items
    .map((item) => ({ item, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ item }) => item);
}

async function runPool(items, worker, concurrency = 3) {
  const result = [];
  let index = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      result.push(await worker(current));
    }
  });
  await Promise.all(workers);
  return result;
}

function summarizeAudit(result) {
  const audit = result.audit || {};
  return {
    id: result.sourceId,
    company: result.company,
    careersUrl: result.careersUrl,
    status: audit.status || (result.errors?.length ? "fetch_error" : "unknown"),
    capturedJobCount: audit.capturedJobCount || 0,
    shanghaiJobCount: audit.shanghaiJobCount || 0,
    targetRoleCount: audit.targetRoleCount || 0,
    matchGt50Count: audit.matchGt50Count || 0,
    finalVisibleJobCount: audit.finalVisibleJobCount || result.jobs?.length || 0,
    topScore: audit.topScore || 0,
    errors: (result.errors || []).slice(0, 3),
    leadSources: (result.leadSources || []).slice(0, 6),
    checkedAt: audit.checkedAt || new Date().toISOString(),
  };
}

async function auditSources(options = {}) {
  const startedAt = Date.now();
  const sampleSize = Math.max(1, Math.min(Number(options.sampleSize || 8), 20));
  const selectedSources = options.company || options.sourceId
    ? filterSources({ ...options, sourceLimit: careerSources.length })
    : shuffle(careerSources).slice(0, sampleSize);

  const results = await runPool(
    selectedSources,
    (source) => scanSource(source, { ...options, minScore: options.minScore || 35, urlsPerSource: options.urlsPerSource || 8 }),
    Number(options.concurrency || 3),
  );
  const summaries = results.map(summarizeAudit).sort((a, b) => b.matchGt50Count - a.matchGt50Count || b.shanghaiJobCount - a.shanghaiJobCount);
  return {
    checkedAt: new Date().toISOString(),
    elapsedMs: Date.now() - startedAt,
    sampleSize: selectedSources.length,
    totals: {
      capturedJobCount: summaries.reduce((sum, item) => sum + item.capturedJobCount, 0),
      shanghaiJobCount: summaries.reduce((sum, item) => sum + item.shanghaiJobCount, 0),
      targetRoleCount: summaries.reduce((sum, item) => sum + item.targetRoleCount, 0),
      matchGt50Count: summaries.reduce((sum, item) => sum + item.matchGt50Count, 0),
      blockedSourceCount: summaries.filter((item) => item.status === "blocked").length,
      errorSourceCount: summaries.filter((item) => item.errors.length).length,
    },
    results: summaries,
  };
}

module.exports = {
  auditSources,
};
