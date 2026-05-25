function jobLine(job) {
  return `${job.match.score}% ${job.company}｜${job.title}｜${job.department}｜${job.location}\n${job.url}`;
}

function buildAlertText(jobs, meta = {}) {
  const header = `发现 ${jobs.length} 个新的上海消费零售外企岗位`;
  const scanned = meta.scannedAt ? `扫描时间：${meta.scannedAt}` : "";
  const body = jobs
    .slice(0, 12)
    .map((job, index) => `${index + 1}. ${jobLine(job)}\n匹配点：${job.match.reasons.join("、") || "岗位方向相关"}`)
    .join("\n\n");
  return [header, scanned, body].filter(Boolean).join("\n\n");
}

async function sendWebhook(jobs, meta) {
  if (!process.env.ALERT_WEBHOOK_URL) return null;
  const response = await fetch(process.env.ALERT_WEBHOOK_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      text: buildAlertText(jobs, meta),
      jobs,
      meta,
    }),
  });
  if (!response.ok) throw new Error(`Webhook failed: ${response.status}`);
  return "webhook";
}

async function sendTelegram(jobs, meta) {
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) return null;
  const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: process.env.TELEGRAM_CHAT_ID,
      text: buildAlertText(jobs, meta).slice(0, 3900),
      disable_web_page_preview: true,
    }),
  });
  if (!response.ok) throw new Error(`Telegram failed: ${response.status}`);
  return "telegram";
}

async function sendServerChan(jobs, meta) {
  if (!process.env.SERVER_CHAN_SEND_KEY) return null;
  const url = `https://sctapi.ftqq.com/${process.env.SERVER_CHAN_SEND_KEY}.send`;
  const params = new URLSearchParams();
  params.set("title", `新岗位提醒：${jobs.length} 个上海外企岗位`);
  params.set("desp", buildAlertText(jobs, meta));
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!response.ok) throw new Error(`ServerChan failed: ${response.status}`);
  return "server-chan";
}

async function sendResendEmail(jobs, meta) {
  if (!process.env.RESEND_API_KEY || !process.env.ALERT_EMAIL_TO) return null;
  const from = process.env.ALERT_EMAIL_FROM || "Cici Job Radar <onboarding@resend.dev>";
  const htmlItems = jobs
    .slice(0, 20)
    .map(
      (job) => `
        <li style="margin-bottom:16px">
          <strong>${job.company}</strong><br/>
          <a href="${job.url}">${job.title}</a><br/>
          <span>${job.department} · ${job.location} · 匹配度 ${job.match.score}%</span><br/>
          <span>经验：${job.match.experience.label}</span><br/>
          <span>技能：${job.match.skills.join(", ") || "未抓到明确技能"}</span>
        </li>`,
    )
    .join("");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [process.env.ALERT_EMAIL_TO],
      subject: `新岗位提醒：${jobs.length} 个上海外企岗位`,
      text: buildAlertText(jobs, meta),
      html: `<h2>新岗位提醒</h2><p>${meta.scannedAt || ""}</p><ol>${htmlItems}</ol>`,
    }),
  });
  if (!response.ok) throw new Error(`Resend failed: ${response.status}`);
  return "resend";
}

async function notifyNewJobs(jobs, meta = {}) {
  if (!jobs.length) {
    return { sent: [], errors: [] };
  }
  const senders = [sendWebhook, sendTelegram, sendServerChan, sendResendEmail];
  const settled = await Promise.allSettled(senders.map((sender) => sender(jobs, meta)));
  const sent = [];
  const errors = [];
  for (const item of settled) {
    if (item.status === "fulfilled" && item.value) sent.push(item.value);
    if (item.status === "rejected") errors.push(item.reason.message || String(item.reason));
  }
  return { sent, errors };
}

module.exports = {
  buildAlertText,
  notifyNewJobs,
};
