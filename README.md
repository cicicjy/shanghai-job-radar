# Cici 上海消费零售外企岗位雷达

这个网站会实时请求外企官方招聘页，筛选上海 base 的 Marketing、Branding、NPD、O2O、Category、Insights 等岗位，并按 Cici 的简历画像给出匹配度、经验要求、技能要求、部门方向和可展开 JD 摘要。Feed 只展示能解析到官网具体岗位页的机会，不用样例岗位冒充真实岗位。

## 本地运行

```bash
npm start
```

打开 `http://localhost:3000`。

## 新岗位提醒

推荐用 GitHub Actions 做 15 分钟巡检，状态保存在 `.job-cache/seen-jobs.json`。第一次运行默认只建立缓存，不推送历史岗位；后续出现新岗位才提醒。

可配置的提醒渠道：

- `ALERT_WEBHOOK_URL`：任意 webhook，POST JSON
- `RESEND_API_KEY` + `ALERT_EMAIL_TO`：邮件提醒
- `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`：Telegram 提醒
- `SERVER_CHAN_SEND_KEY`：Server 酱微信提醒

可配置的筛选变量：

- `ALERT_MIN_SCORE`：提醒阈值，默认 `62`
- `SOURCE_LIMIT`：扫描官网源数量，默认 `87`
- `SCRAPE_CONCURRENCY`：并发数，默认 `6`
- `SCRAPE_TIMEOUT_MS`：单个官网超时，默认 `9000`

## Vercel Cron

`vercel.json` 已配置 `/api/check-jobs` 每 15 分钟触发一次。要让 Vercel Cron 记住历史岗位，需要配置 KV：

- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`
- `CRON_SECRET`

Hobby 计划的 Cron 最小频率通常不足以做到第一时间提醒；如果不用 Pro，建议使用 GitHub Actions 巡检。

## 说明

官网招聘站结构差异很大，有些页面会强依赖 JavaScript 或限制服务器抓取。系统会把抓取失败的官网源标成“复查”，同时保留官方招聘入口，避免混入非官方岗位。
