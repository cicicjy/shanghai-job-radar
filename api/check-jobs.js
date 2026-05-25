const { fetchJobs } = require("../lib/scraper");
const { findNewJobs, hasKvConfig, readState, updateStateWithJobs, writeState } = require("../lib/state");
const { notifyNewJobs } = require("../lib/notify");

function isAuthorized(req) {
  if (!process.env.CRON_SECRET) return true;
  return req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");

  if (!isAuthorized(req)) {
    res.statusCode = 401;
    res.end("Unauthorized");
    return;
  }

  try {
    const minScore = Number(process.env.ALERT_MIN_SCORE || 62);
    const data = await fetchJobs({
      minScore,
      sourceLimit: Number(process.env.SOURCE_LIMIT || 87),
      timeoutMs: Number(process.env.SCRAPE_TIMEOUT_MS || 9000),
      concurrency: Number(process.env.SCRAPE_CONCURRENCY || 6),
    });

    if (!hasKvConfig()) {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(
        JSON.stringify({
          ok: true,
          alertSent: false,
          reason: "Set KV_REST_API_URL and KV_REST_API_TOKEN for Vercel Cron state storage, or use GitHub Actions.",
          jobsFound: data.jobs.length,
          meta: data.meta,
        }),
      );
      return;
    }

    const state = await readState();
    const isFirstRun = !state.lastRunAt && Object.keys(state.seen || {}).length === 0;
    const newJobs = findNewJobs(data.jobs, state, { minScore });
    const shouldAlert = newJobs.length > 0 && (!isFirstRun || process.env.ALERT_ON_FIRST_RUN === "true");
    const notification = shouldAlert ? await notifyNewJobs(newJobs, data.meta) : { sent: [], errors: [] };
    await writeState(updateStateWithJobs(state, data.jobs));

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(
      JSON.stringify({
        ok: true,
        alertSent: shouldAlert,
        firstRunSeeded: isFirstRun && !shouldAlert,
        jobsFound: data.jobs.length,
        newJobs: newJobs.length,
        notification,
        meta: data.meta,
      }),
    );
  } catch (error) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ ok: false, error: error.message || String(error) }));
  }
};
