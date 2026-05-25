#!/usr/bin/env node
const { fetchJobs } = require("../lib/scraper");
const { findNewJobs, readState, updateStateWithJobs, writeState } = require("../lib/state");
const { notifyNewJobs } = require("../lib/notify");

async function main() {
  const minScore = Number(process.env.ALERT_MIN_SCORE || 62);
  const data = await fetchJobs({
    minScore,
    priority: process.env.SOURCE_PRIORITY || "all",
    sourceLimit: Number(process.env.SOURCE_LIMIT || 87),
    timeoutMs: Number(process.env.SCRAPE_TIMEOUT_MS || 9000),
    concurrency: Number(process.env.SCRAPE_CONCURRENCY || 6),
  });

  const state = await readState({ preferFile: true });
  const isFirstRun = !state.lastRunAt && Object.keys(state.seen || {}).length === 0;
  const newJobs = findNewJobs(data.jobs, state, { minScore });
  const shouldAlert = newJobs.length > 0 && (!isFirstRun || process.env.ALERT_ON_FIRST_RUN === "true");
  const notification = shouldAlert ? await notifyNewJobs(newJobs, data.meta) : { sent: [], errors: [] };

  await writeState(updateStateWithJobs(state, data.jobs), { preferFile: true });

  const summary = {
    ok: true,
    scannedAt: data.meta.scannedAt,
    sources: data.meta.sourceCount,
    jobsFound: data.jobs.length,
    newJobs: newJobs.length,
    alertSent: shouldAlert,
    firstRunSeeded: isFirstRun && !shouldAlert,
    channels: notification.sent,
    notificationErrors: notification.errors,
    topMatches: data.jobs.slice(0, 10).map((job) => ({
      score: job.match.score,
      company: job.company,
      title: job.title,
      department: job.department,
      url: job.url,
    })),
  };

  console.log(JSON.stringify(summary, null, 2));

  if (notification.errors.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
