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
const rankingNote = document.querySelector("[data-ranking-note]");
const stats = {
  jobs: document.querySelector('[data-stat="jobs"]'),
  sources: document.querySelector('[data-stat="sources"]'),
  errors: document.querySelector('[data-stat="errors"]'),
};
const backTopButton = document.querySelector("[data-back-top]");

let progressTimer = null;
let activeSuggestionBox = null;

const highlightTerms = [
  "consumer insight",
  "e-commerce",
  "omnichannel",
  "xiaohongshu",
  "new product",
  "retail media",
  "marketing",
  "branding",
  "category",
  "innovation",
  "launch",
  "content",
  "trade",
  "brand",
  "O2O",
  "NPD",
  "CRM",
  "fragrance",
  "flavor",
  "ingredient",
  "application",
  "formulation",
  "sensory",
  "新品",
  "品牌",
  "市场",
  "电商",
  "小红书",
  "内容",
  "品类",
  "洞察",
  "上市",
  "消费者",
  "零售",
  "香精",
  "香料",
  "原料",
  "配料",
  "配方",
  "感官",
];

const translationHints = [
  { pattern: /\bbrand(?:ing)?\b|品牌/i, label: "品牌策略/表达" },
  { pattern: /\bmarketing\b|市场/i, label: "市场营销" },
  { pattern: /\bNPD\b|new product|innovation|新品|创新/i, label: "新品开发" },
  { pattern: /e-?commerce|O2O|omnichannel|电商|全渠道/i, label: "电商/O2O" },
  { pattern: /consumer insight|insight|research|消费者|洞察/i, label: "消费者洞察" },
  { pattern: /category|trade|品类|渠道/i, label: "品类/渠道" },
  { pattern: /content|social|xiaohongshu|小红书|内容/i, label: "内容种草" },
  { pattern: /launch|go[-\s]?to[-\s]?market|GTM|上市/i, label: "上市节奏" },
  { pattern: /retail|store|门店|零售/i, label: "零售执行" },
  { pattern: /CRM|membership|loyalty|会员/i, label: "会员运营" },
  { pattern: /ingredient|fragrance|flavo[u]?r|application|formulation|sensory|香精|香料|原料|配料|配方|感官/i, label: "原料/配方应用" },
];

const highlightPattern = new RegExp(
  highlightTerms
    .slice()
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join("|"),
  "gi",
);

const suggestionSets = {
  q: [
    "市场 marketing",
    "品牌 branding",
    "新品 innovation",
    "食品新创 food venture",
    "消费者 consumer engagement",
    "消费者洞察 consumer insight",
    "原料 ingredient",
    "香精香料 fragrance flavor",
    "配方应用 formulation application",
    "电商 e-commerce",
    "O2O omnichannel",
    "品类 category",
    "小红书 xiaohongshu",
  ],
  company: [
    "百事 PepsiCo",
    "欧莱雅 L'Oreal",
    "雅诗兰黛 Estee Lauder",
    "资生堂 Shiseido",
    "汉高 Henkel",
    "宝洁 P&G",
    "联合利华 Unilever",
    "费列罗 Ferrero",
    "雀巢 Nestle",
    "玛氏 Mars",
    "dsm-firmenich 芬美意",
    "Givaudan 奇华顿",
    "IFF 国际香精香料",
    "Symrise 德之馨",
    "Apple",
    "Shopee",
    "宜家 IKEA",
    "PUMA",
    "Nike",
    "adidas",
  ],
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

function formatPostedDate(value) {
  if (!value) return "未抓到";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getFilters() {
  const data = new FormData(form);
  return new URLSearchParams({
    q: data.get("q") || "",
    company: data.get("company") || "",
    industry: data.get("industry") || "all",
    function: data.get("function") || "all",
    originRegion: data.get("originRegion") || "all",
    postedWithin: data.get("postedWithin") || "all",
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

function setupSuggestions() {
  const closeSuggestions = (except = null) => {
    for (const box of form.querySelectorAll(".suggestion-box")) {
      if (box !== except) box.hidden = true;
    }
    if (!except) activeSuggestionBox = null;
  };

  for (const [name, suggestions] of Object.entries(suggestionSets)) {
    const input = form.elements[name];
    if (!input) continue;
    input.removeAttribute("list");
    const box = document.createElement("div");
    box.className = "suggestion-box";
    box.hidden = true;
    input.closest("label").append(box);

    const render = () => {
      closeSuggestions(box);
      const keyword = input.value.trim().toLowerCase();
      const matches = suggestions
        .filter((item) => !keyword || item.toLowerCase().includes(keyword) || item.split(/\s+/).some((part) => part.toLowerCase().startsWith(keyword)))
        .slice(0, 7);
      box.innerHTML = "";
      for (const item of matches) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = item;
        button.addEventListener("mousedown", (event) => {
          event.preventDefault();
          input.value = item;
          box.hidden = true;
          activeSuggestionBox = null;
          loadJobs();
        });
        box.append(button);
      }
      box.hidden = !matches.length || document.activeElement !== input;
      activeSuggestionBox = box.hidden ? null : box;
    };

    input.addEventListener("focus", render);
    input.addEventListener("input", render);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        box.hidden = true;
        activeSuggestionBox = null;
      }
    });
    input.addEventListener("blur", () => {
      window.setTimeout(() => {
        box.hidden = true;
        if (activeSuggestionBox === box) activeSuggestionBox = null;
      }, 120);
    });
  }

  document.addEventListener("pointerdown", (event) => {
    if (!form.contains(event.target)) closeSuggestions();
  });
}

function createChip(text) {
  const chip = document.createElement("span");
  chip.className = "chip";
  chip.textContent = text;
  return chip;
}

function sourceLabel(sourceType) {
  const labels = {
    "official-api": "官方 API",
    "official-list": "官方列表",
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

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeBasicEntities(text) {
  return String(text || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function cleanHtmlText(text) {
  return decodeBasicEntities(text)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:li|p|div|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\r/g, "\n");
}

function normalizeBulletText(text) {
  return cleanHtmlText(text)
    .replace(/^[\s•●▪◆*·\-–—]+/, "")
    .replace(/^\d+[.)、]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueTextItems(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = String(item || "").toLowerCase().trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function splitSummaryText(text) {
  const raw = cleanHtmlText(text);
  const sectioned = raw.replace(
    /(Responsibilities?|Qualifications?|Requirements?|What you'll do|What you will do|About the role|岗位职责|职责描述|任职要求|职位要求|工作内容|岗位描述)[:：]/gi,
    "\n$1: ",
  );
  let pieces = sectioned
    .split(/\n+|\n\s*[-–—]\s+|(?:^|\s)[•●▪◆*]\s+|(?:^|\s)\d+[.)、]\s+/)
    .map(normalizeBulletText)
    .filter((item) => item.length >= 12);

  if (pieces.length < 2) {
    const compact = normalizeBulletText(sectioned);
    pieces = (compact.match(/[^。！？.!?；;]+[。！？.!?；;]?/g) || [compact]).map(normalizeBulletText).filter((item) => item.length >= 12);
  }

  return uniqueTextItems(pieces).slice(0, 6);
}

function pairSummaryArrays(enItems, zhItems = []) {
  const enList = Array.isArray(enItems) ? enItems : splitSummaryText(enItems);
  const zhList = Array.isArray(zhItems) ? zhItems : splitSummaryText(zhItems);
  return enList.map((item, index) => ({
    text: normalizeBulletText(item),
    zh: normalizeBulletText(zhList[index] || ""),
  }));
}

function summaryObjectsFromValue(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(summaryObjectsFromValue);

  if (typeof value === "object") {
    if (Array.isArray(value.en) || Array.isArray(value.zh)) {
      return pairSummaryArrays(value.en || value.text || [], value.zh || value.cn || value.translation || []);
    }

    const sectionKeys = ["overview", "responsibilities", "requirements", "qualifications"];
    const sectionItems = sectionKeys.flatMap((key) => summaryObjectsFromValue(value[key]));
    if (sectionItems.length) return sectionItems;

    const collectionKeys = ["bullets", "items", "highlights"];
    const collected = collectionKeys.flatMap((key) => summaryObjectsFromValue(value[key]));
    if (collected.length) return collected;

    const text = value.text || value.en || value.original || value.content || value.title || (typeof value.summary === "string" ? value.summary : "");
    const zh = value.zh || value.cn || value.translation || value.chinese || value.summaryZh || "";
    if (!text) return Object.values(value).flatMap(summaryObjectsFromValue);

    const textItems = splitSummaryText(text);
    const zhItems = splitSummaryText(zh);
    return textItems.map((item, index) => ({
      text: item,
      zh: zhItems[index] || (textItems.length === 1 ? normalizeBulletText(zh) : ""),
    }));
  }

  return splitSummaryText(value).map((item) => ({ text: item, zh: "" }));
}

function sanitizeSummaryItems(items) {
  const seen = new Set();
  return items
    .map((item) => ({
      text: normalizeBulletText(item.text),
      zh: normalizeBulletText(item.zh),
    }))
    .filter((item) => {
      const key = item.text.toLowerCase();
      if (!item.text || item.text.length < 12 || seen.has(key) || looksMessy(item.text)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 6);
}

function jdSummaryItemsFor(job) {
  const provided = sanitizeSummaryItems([job.jdSummary, job.summary].flatMap(summaryObjectsFromValue));
  if (provided.length) return provided;

  const fallback = sanitizeSummaryItems(summaryObjectsFromValue(jdTextFor(job)));
  if (fallback.length) return fallback;

  return [
    {
      text: "官网没有返回可读的 JD 正文，建议直接打开官网具体岗位查看完整原文。",
      zh: "",
    },
  ];
}

function appendHighlightedText(container, text) {
  const value = String(text || "");
  let lastIndex = 0;
  let hasHighlight = false;
  const regex = new RegExp(highlightPattern.source, highlightPattern.flags);

  for (const match of value.matchAll(regex)) {
    const index = match.index || 0;
    if (index > lastIndex) container.append(document.createTextNode(value.slice(lastIndex, index)));
    const mark = document.createElement("mark");
    mark.className = "keyword-mark";
    mark.textContent = match[0];
    container.append(mark);
    lastIndex = index + match[0].length;
    hasHighlight = true;
  }

  if (lastIndex < value.length) container.append(document.createTextNode(value.slice(lastIndex)));
  if (!hasHighlight && !value.length) container.textContent = "";
}

function translationForBullet(item) {
  const provided = normalizeBulletText(item.zh);
  if (provided) return provided.startsWith("中文") ? provided : `中文速读：${provided}`;

  const text = normalizeBulletText(item.text);
  if (/[\u4e00-\u9fa5]/.test(text)) return `中文速读：${compactText(text, 120)}`;

  const labels = uniqueTextItems(translationHints.filter((hint) => hint.pattern.test(text)).map((hint) => hint.label)).slice(0, 4);
  const action = /lead|drive|own|manage|负责/i.test(text)
    ? "负责"
    : /support|assist|coordinate|协助/i.test(text)
      ? "支持"
      : /develop|build|create|design|制定/i.test(text)
        ? "制定/搭建"
        : /analy[sz]e|research|insight|洞察/i.test(text)
          ? "分析"
          : "关注";

  return `中文速读：${action}${labels.length ? labels.join("、") : "岗位核心职责"}。`;
}

function renderJdBullets(container, items) {
  container.innerHTML = "";
  for (const item of items) {
    const li = document.createElement("li");
    const original = document.createElement("p");
    original.className = "jd-original";
    appendHighlightedText(original, item.text);

    const translation = document.createElement("span");
    translation.className = "jd-translation";
    translation.textContent = translationForBullet(item);

    li.append(original, translation);
    container.append(li);
  }
}

function companyInitials(company) {
  const value = String(company || "").trim();
  const latin = value.match(/[A-Za-z0-9]/g);
  if (latin?.length) return latin.slice(0, 2).join("").toUpperCase();
  const chinese = value.match(/[\u4e00-\u9fa5]/g);
  if (chinese?.length) return chinese.slice(0, 2).join("");
  return "企";
}

function renderCompanyLogo(fragment, job) {
  const logoLink = fragment.querySelector("[data-company-logo-link]");
  const logo = fragment.querySelector("[data-logo]");
  const fallback = fragment.querySelector("[data-logo-fallback]");
  const href = job.careersUrl || job.sourceUrl || job.url || "#";

  logoLink.href = href;
  fallback.textContent = companyInitials(job.company);

  if (!job.logoUrl) {
    logo.hidden = true;
    fallback.hidden = false;
    return;
  }

  logo.hidden = false;
  fallback.hidden = true;
  logo.src = job.logoUrl;
  logo.alt = `${job.company || "公司"} logo`;
  logo.addEventListener("error", () => {
    logo.hidden = true;
    fallback.hidden = false;
  });
}

function tagItemsFor(job) {
  const rawItems = [
    ...(job.match?.skills || []),
    ...(job.jdSummary?.keywords || []),
    ...(job.summary?.keywords || []),
  ];
  if (job.department) rawItems.push(job.department);

  const tags = uniqueTextItems(
    rawItems
      .map((item) => compactText(String(item || "").replace(/^匹配点[:：]/, ""), 28))
      .filter((item) => item && !/未抓到|未明确|官方源|官网源/i.test(item)),
  ).slice(0, 10);

  return tags.length ? tags : ["官网未抓到明确技能"];
}

function looksMessy(text) {
  const value = String(text || "");
  if (!value.trim()) return true;
  if (/href|class|system-path|main-menu|node\/\d+|data-[a-z-]+|button\.dataset|eventAction|eventLabel|querySelector|dataLayer|undefined/i.test(value)) {
    return true;
  }
  const codeMarks = (value.match(/[{}[\]=<>;]/g) || []).length;
  return codeMarks > 8 && codeMarks > value.length / 50;
}

function jdTextFor(job) {
  const fallback = "官网没有返回可读的 JD 正文，建议直接打开官网具体岗位查看完整原文。";
  const value = String(job.description || "").replace(/\s+/g, " ").trim();
  if (looksMessy(value)) return fallback;
  return value;
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
    const match = job.match || {};
    fragment.querySelector("[data-score]").textContent = `${match.score ?? 0}%`;
    fragment.querySelector("[data-score-label]").textContent = match.label || "匹配";
    renderCompanyLogo(fragment, job);
    const company = fragment.querySelector("[data-company]");
    company.textContent = job.company || "未标注公司";
    company.href = job.careersUrl || job.sourceUrl || job.url || "#";
    fragment.querySelector("[data-origin]").textContent = `${job.originCountry || "未标注"}企业`;
    fragment.querySelector("[data-industry]").textContent = job.industry || "未标注行业";
    fragment.querySelector("[data-location]").textContent = job.location || "未标注地点";
    const postedLabel = formatPostedDate(job.datePosted);
    const title = fragment.querySelector("[data-title]");
    title.textContent = job.title || "未命名岗位";
    title.href = job.url || "#";
    fragment.querySelector("[data-job-id]").textContent = job.jobId || "未抓到";
    fragment.querySelector("[data-department]").textContent = job.department || "未明确";
    fragment.querySelector("[data-experience]").textContent = match.experience?.label || "未明确";
    fragment.querySelector("[data-date-posted]").textContent = postedLabel;
    fragment.querySelector("[data-source-type]").textContent = sourceLabel(job.sourceType);
    const skills = fragment.querySelector("[data-skills]");
    tagItemsFor(job).forEach((skill) => skills.append(createChip(skill)));
    const warningText = match.warnings?.length ? `｜注意：${match.warnings.join("、")}` : "";
    fragment.querySelector("[data-reasons]").textContent = `匹配点：${(match.reasons || []).join("、") || "岗位方向相关"}${warningText}`;
    const jdItems = jdSummaryItemsFor(job);
    fragment.querySelector("[data-description]").textContent = compactText(jdItems.map((item) => translationForBullet(item).replace(/^中文速读：/, "")).join(" / "), 220);
    renderJdBullets(fragment.querySelector("[data-jd]"), jdItems);
    const apply = fragment.querySelector("[data-apply]");
    apply.href = job.url || "#";
    const source = fragment.querySelector("[data-source]");
    source.href = job.sourceUrl || job.careersUrl || job.url || "#";
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
  rankingNote.textContent = meta?.ranking ? `排序：${meta.ranking}` : "排序：匹配度优先，并穿插不同公司。";
  renderSources(meta);
}

function estimateSeconds(params) {
  if (params.get("company")) return 10;
  if (params.get("priority") && params.get("priority") !== "all") return 28;
  if (params.get("originRegion") && params.get("originRegion") !== "all") return 24;
  return 55;
}

function stopProgress() {
  window.clearInterval(progressTimer);
  progressTimer = null;
}

function startProgress(totalSeconds) {
  stopProgress();
  const startedAt = Date.now();
  const bar = feed.querySelector("[data-progress-bar]");
  const text = feed.querySelector("[data-progress-text]");
  const tick = () => {
    const elapsed = Math.floor((Date.now() - startedAt) / 1000);
    const remaining = Math.max(3, totalSeconds - elapsed);
    const ratio = Math.min(92, Math.round((elapsed / totalSeconds) * 100));
    if (bar) bar.style.width = `${ratio}%`;
    if (text) text.textContent = `预计还需 ${remaining} 秒左右`;
  };
  tick();
  progressTimer = window.setInterval(tick, 1000);
}

function renderLoading(params) {
  const seconds = estimateSeconds(params);
  feed.innerHTML = `
    <div class="loading-state">
      <strong>正在抓取官网岗位</strong>
      <span>正在访问招聘官网并清洗岗位内容，页面会在结果回来后自动更新。</span>
      <div class="progress-track" aria-hidden="true"><div data-progress-bar></div></div>
      <em data-progress-text>预计还需 ${seconds} 秒左右</em>
    </div>
  `;
  startProgress(seconds);
}

async function loadJobs() {
  if (state.loading) return;
  setLoading(true);
  setStatus("loading", "正在抓取官网源");
  const params = getFilters();
  renderLoading(params);

  try {
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
    stopProgress();
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

backTopButton.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});

window.addEventListener("scroll", () => {
  backTopButton.classList.toggle("is-visible", window.scrollY > 520);
});

function applyUrlFilters() {
  const params = new URLSearchParams(window.location.search);
  for (const name of ["q", "company", "industry", "function", "originRegion", "postedWithin", "priority", "minScore"]) {
    const value = params.get(name);
    const control = form.elements[name];
    if (value !== null && control) control.value = value;
  }
  minScoreOutput.textContent = form.elements.minScore.value;
}

window.setInterval(loadJobs, 10 * 60 * 1000);
applyUrlFilters();
setupSuggestions();
loadJobs();
