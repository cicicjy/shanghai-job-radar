const { auditSources } = require("../lib/audit");

function readArgs(argv) {
  const options = {};
  for (const arg of argv) {
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (match) options[match[1]] = match[2];
  }
  return options;
}

function printResult(data) {
  console.log(`抽查完成：${data.sampleSize} 个源，耗时 ${data.elapsedMs}ms`);
  console.log(
    `抓到 ${data.totals.capturedJobCount} 个岗位；上海 ${data.totals.shanghaiJobCount} 个；目标方向 ${data.totals.targetRoleCount} 个；>50% ${data.totals.matchGt50Count} 个`,
  );
  for (const item of data.results) {
    console.log(
      `${item.company} | 状态 ${item.status} | 抓到 ${item.capturedJobCount} | 上海 ${item.shanghaiJobCount} | >50% ${item.matchGt50Count} | 可见 ${item.finalVisibleJobCount}`,
    );
    if (item.errors.length) console.log(`  复查：${item.errors.join("；")}`);
  }
}

auditSources(readArgs(process.argv.slice(2)))
  .then(printResult)
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
