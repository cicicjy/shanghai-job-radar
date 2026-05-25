const state = {
  jobs: [],
  meta: null,
  loading: false,
};

const feed = document.querySelector("[data-feed]");
const form = document.querySelector("[data-filters]");
const refreshButton = document.querySelector("[data-refresh]");
const livePill = document.querySelector("[data-live-pill]");
const minScoreOutput = document.querySelector("[data-min-score]");
const timestamp = document.querySelector("[data-timestamp]");
const sourceList = document.querySelector("[data-source-list]");
const stats = {
  jobs: document.querySelector('[data-stat="jobs"]'),
  sources: document.querySelector('[data-stat="sources"]'),
  errors: document.querySelector('[data-stat="errors"]'),
};

function formatTime(value) {
  if (!value) return "尚未刷新";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function getFilters() {
  const data = new FormData(form);
  return new URLSearchParams({
    q: data.get("q") || "",
    industry: data.get("industry") || "all",
    function: data.get("function") || "all",
    priority: data.get("priority") || "all",
    minScore: data.get("minScore") || "35",
  });
}

function setLoading(next) {
  state.loading = next;
  refreshButton.disabled = next;
  refreshButton.querySelector("span:last-child").textContent = next ? "抓取中" : "刷新";
}

function setStatus(type, text) {
  livePill.classList.toggle("is-live", type === "live");
  livePill.classList.toggle("is-error", type === "error");
  livePill.textContent = text;
}

function createChip(text) {
  const chip = document.createElement("span");
  chip.className = "chip";
  chip.textContent = text;
  return chip;
}

function sourceLabel(sourceType) {
  const labels = {
    "official-jsonld": "官方 JD",
    "official-html": "官方页面",
    "official-embedded": "官方职位数据",
  };
  return labels[sourceType] || "官方源";
}

function compactText(text, maxLength = 260) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}

function renderJobs(jobs, meta) {
  feed.innerHTML = "";
  if (!jobs.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = "<strong>暂时没有实时岗位</strong><span>如果你是直接打开本地 HTML 文件，浏览器无法调用实时抓取接口。请用本地服务或 Vercel 线上站访问；系统不会再用样例岗位冒充真实岗位。</span>";
    feed.append(empty);
    return;
  }

  const template = document.querySelector("#job-card-template");
  for (const job of jobs) {
    const fragment = template.content.cloneNode(true);
    fragment.querySelector("[data-score]").textContent = `${job.match.score}%`;
    fragment.querySelector("[data-score-label]").textContent = job.match.label;
    fragment.querySelector("[data-company]").textContent = job.company;
    fragment.querySelector("[data-industry]").textContent = job.industry;
    fragment.querySelector("[data-location]").textContent = job.location;
    const title = fragment.querySelector("[data-title]");
    title.textContent = job.title;
    title.href = job.url;
    fragment.querySelector("[data-department]").textContent = job.department;
    fragment.querySelector("[data-experience]").textContent = job.match.experience?.label || "未明确";
    fragment.querySelector("[data-source-type]").textContent = sourceLabel(job.sourceType);
    const skills = fragment.querySelector("[data-skills]");
    const skillItems = job.match.skills?.length ? job.match.skills : ["官网未抓到明确技能"];
    skillItems.forEach((skill) => skills.append(createChip(skill)));
    fragment.querySelector("[data-reasons]").textContent = `匹配点：${(job.match.reasons || []).join("、") || "岗位方向相关"}`;
    const jdText = job.description || "官网未返回可解析的岗位摘要。";
    fragment.querySelector("[data-description]").textContent = compactText(jdText, 220);
    fragment.querySelector("[data-jd]").textContent = jdText;
    const apply = fragment.querySelector("[data-apply]");
    apply.href = job.url;
    const source = fragment.querySelector("[data-source]");
    source.href = job.sourceUrl || job.careersUrl || job.url;
    feed.append(fragment);
  }

  if (meta?.jobCount !== jobs.length) {
    console.info("Filtered jobs rendered", jobs.length, meta);
  }
}

function renderSources(meta) {
  const sources = meta?.sources || [];
  sourceList.innerHTML = "";
  for (const source of sources.slice(0, 40)) {
    const row = document.createElement("a");
    row.className = "source-row";
    row.href = source.careersUrl;
    row.target = "_blank";
    row.rel = "noreferrer";
    const label = document.createElement("strong");
    label.textContent = source.company;
    const count = document.createElement("span");
    count.textContent = source.errors?.length ? "复查" : `${source.jobCount}`;
    row.append(label, count);
    sourceList.append(row);
  }
}

function renderMeta(meta, jobs) {
  stats.jobs.textContent = String(jobs.length);
  stats.sources.textContent = String(meta?.sourceCount || 0);
  stats.errors.textContent = String(meta?.errorCount || 0);
  timestamp.textContent = meta?.scannedAt ? `刷新于 ${formatTime(meta.scannedAt)} · ${meta.elapsedMs}ms` : "尚未刷新";
  renderSources(meta);
}

function renderLoading() {
  feed.innerHTML = '<div class="loading-state"><strong>正在抓取官网岗位</strong><span>不同外企官网速度不一样，通常需要几十秒。</span></div>';
}

async function loadJobs() {
  if (state.loading) return;
  setLoading(true);
  setStatus("loading", "正在抓取官网源");
  renderLoading();

  try {
    const params = getFilters();
    const response = await fetch(`/api/jobs?${params.toString()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`API ${response.status}`);
    const data = await response.json();
    state.jobs = data.jobs || [];
    state.meta = data.meta || null;
    renderJobs(state.jobs, state.meta);
    renderMeta(state.meta, state.jobs);
    setStatus("live", state.jobs.length ? "已连接官网源" : "官网源已扫描");
  } catch (error) {
    state.meta = {
      scannedAt: new Date().toISOString(),
      sourceCount: 0,
      errorCount: 1,
      sources: [],
      elapsedMs: 0,
    };
    state.jobs = [];
    renderJobs(state.jobs, state.meta);
    renderMeta(state.meta, state.jobs);
    setStatus("error", "未连接实时接口");
    console.warn(error);
  } finally {
    setLoading(false);
  }
}

let filterTimer = null;
form.addEventListener("input", () => {
  const minScore = form.elements.minScore.value;
  minScoreOutput.textContent = minScore;
  window.clearTimeout(filterTimer);
  filterTimer = window.setTimeout(loadJobs, 500);
});

form.addEventListener("change", () => {
  window.clearTimeout(filterTimer);
  filterTimer = window.setTimeout(loadJobs, 150);
});

refreshButton.addEventListener("click", loadJobs);

window.setInterval(loadJobs, 10 * 60 * 1000);
loadJobs();
