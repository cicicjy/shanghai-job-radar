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
const sourceAudit = document.querySelector("[data-source-audit]");
const rankingNote = document.querySelector("[data-ranking-note]");
const favoriteCount = document.querySelector("[data-favorite-count]");
const toggleFavoritesButton = document.querySelector("[data-toggle-favorites]");
const closeFavoritesButton = document.querySelector("[data-close-favorites]");
const favoritesSection = document.querySelector("[data-favorites-section]");
const favoritesList = document.querySelector("[data-favorites-list]");
const stats = {
  jobs: document.querySelector('[data-stat="jobs"]'),
  sources: document.querySelector('[data-stat="sources"]'),
  errors: document.querySelector('[data-stat="errors"]'),
};
const backTopButton = document.querySelector("[data-back-top]");

let progressTimer = null;
let activeSuggestionBox = null;
let activeRequestId = 0;
let jobsAbortController = null;

const favoriteStorageKey = "cici-job-radar-favorites-v1";
const savedJobs = new Map();

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

function readFavorites() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(favoriteStorageKey) || "[]");
    savedJobs.clear();
    for (const item of Array.isArray(parsed) ? parsed : []) {
      const key = item.favoriteKey || jobKey(item);
      if (key) savedJobs.set(key, { ...item, favoriteKey: key });
    }
  } catch {
    savedJobs.clear();
  }
}

function writeFavorites() {
  window.localStorage.setItem(favoriteStorageKey, JSON.stringify([...savedJobs.values()]));
}

function jobKey(job = {}) {
  return String(job.id || [job.company, job.jobId, job.url, job.title].filter(Boolean).join("|"));
}

function refreshFavoriteButtons() {
  for (const button of document.querySelectorAll("[data-favorite]")) {
    const card = button.closest(".job-card");
    const saved = card?.dataset.jobKey && savedJobs.has(card.dataset.jobKey);
    button.classList.toggle("is-saved", Boolean(saved));
    button.textContent = saved ? "已收藏" : "收藏";
    button.setAttribute("aria-pressed", saved ? "true" : "false");
  }
  favoriteCount.textContent = String(savedJobs.size);
}

function findJobForFavorite(key) {
  return state.jobs.find((job) => jobKey(job) === key) || savedJobs.get(key);
}

function toggleFavorite(key) {
  const job = findJobForFavorite(key);
  if (!job) return;
  if (savedJobs.has(key)) {
    savedJobs.delete(key);
  } else {
    savedJobs.set(key, {
      ...job,
      favoriteKey: key,
      savedAt: new Date().toISOString(),
    });
  }
  writeFavorites();
  renderFavorites();
  refreshFavoriteButtons();
}

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
    sourceId: data.get("sourceId") || "",
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

  for (const name of Object.keys(suggestionSets)) {
    const input = form.elements[name];
    if (!input) continue;
    input.removeAttribute("list");
    const box = document.createElement("div");
    box.className = "suggestion-box";
    box.hidden = true;
    input.closest("label").append(box);

    const render = () => {
      closeSuggestions(box);
      const keyword = normalizeSuggestionText(input.value);
      const suggestions = suggestionSets[name] || [];
      const limit = name === "company" ? 120 : 10;
      const matches = suggestions
        .filter((item) => {
          const text = suggestionSearchText(item);
          return !keyword || text.includes(keyword) || compactSuggestionText(text).includes(compactSuggestionText(keyword));
        })
        .slice(0, limit);
      box.innerHTML = "";
      for (const item of matches) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = suggestionLabel(item);
        button.addEventListener("mousedown", (event) => {
          event.preventDefault();
          input.value = suggestionLabel(item);
          if (name === "company" && form.elements.sourceId) {
            form.elements.sourceId.value = item.id || "";
          }
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
    input.addEventListener("input", () => {
      if (name === "company" && form.elements.sourceId) form.elements.sourceId.value = "";
      render();
    });
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

async function loadCompanySuggestions() {
  try {
    const response = await fetch("/api/sources", { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    const companies = (data.sources || [])
      .map((source) => ({
        id: source.id,
        label: source.label,
        aliases: source.aliases || [],
        brands: source.brands || [],
      }))
      .filter((source) => source.label);
    if (companies.length) suggestionSets.company = uniqueSuggestionItems(companies);
  } catch (error) {
    console.warn("Company suggestions fallback in use", error);
  }
}

function normalizeSuggestionText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactSuggestionText(value = "") {
  return normalizeSuggestionText(value).replace(/\s+/g, "");
}

function suggestionLabel(item) {
  return typeof item === "string" ? item : item.label || "";
}

function suggestionSearchText(item) {
  if (typeof item === "string") return normalizeSuggestionText(item);
  return normalizeSuggestionText([item.label, item.id, ...(item.aliases || []), ...(item.brands || [])].filter(Boolean).join(" "));
}

function uniqueSuggestionItems(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = item.id || normalizeSuggestionText(item.label || item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
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

function hasReadableChinese(text) {
  const value = normalizeBulletText(text);
  const chineseCount = (value.match(/[\u4e00-\u9fa5]/g) || []).length;
  if (chineseCount < 6) return false;
  const noisyLatin = (value.match(/[A-Za-z]{3,}/g) || []).filter((word) => !["NPD", "O2O", "CRM", "AFH", "JBP", "KA"].includes(word.toUpperCase()));
  return noisyLatin.length <= 1;
}

function chineseLabelsFor(text) {
  return uniqueTextItems(translationHints.filter((hint) => hint.pattern.test(text)).map((hint) => hint.label)).slice(0, 4);
}

function chineseActionFor(text) {
  if (/experience|years|degree|english|skill|require|qualification|能力|经验|本科|英语|要求/i.test(text)) return "需要";
  if (/lead|drive|own|manage|负责|推进|管理/i.test(text)) return "负责";
  if (/support|assist|coordinate|collaborate|partner|协助|协作/i.test(text)) return "协同推进";
  if (/develop|build|create|design|制定|搭建|开发/i.test(text)) return "制定";
  if (/analy[sz]e|research|insight|data|洞察|分析/i.test(text)) return "分析";
  return "关注";
}

function chineseSummaryForBullet(item) {
  const provided = normalizeBulletText(item.zh);
  if (hasReadableChinese(provided)) return compactText(provided, 96);

  const text = normalizeBulletText(item.text);
  if (hasReadableChinese(text)) return compactText(text, 96);

  const labels = chineseLabelsFor(text);
  const topic = labels.length ? labels.join("、") : "岗位核心职责";
  const action = chineseActionFor(text);
  if (action === "需要") return `需要${topic}相关经验或能力。`;
  if (action === "分析") return `分析${topic}相关数据与机会。`;
  return `${action}${topic}相关工作。`;
}

function englishSummaryForBullet(item) {
  const text = normalizeBulletText(item.text);
  if (!/[A-Za-z]{3,}/.test(text)) return "";
  return compactText(
    text
      .replace(/[\u4e00-\u9fa5]+/g, " ")
      .replace(/[，。；、：]/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
    180,
  );
}

function appendJdSection(container, title, items) {
  if (!items.length) return;
  const section = document.createElement("section");
  section.className = "jd-language-section";
  const heading = document.createElement("h4");
  heading.textContent = title;
  const list = document.createElement("ul");
  for (const item of items) {
    const li = document.createElement("li");
    appendHighlightedText(li, item);
    list.append(li);
  }
  section.append(heading, list);
  container.append(section);
}

function renderJdSummary(container, items) {
  container.innerHTML = "";
  const chineseItems = uniqueTextItems(items.map(chineseSummaryForBullet).filter(Boolean)).slice(0, 5);
  const englishItems = uniqueTextItems(items.map(englishSummaryForBullet).filter(Boolean)).slice(0, 5);

  appendJdSection(container, "中文总结", chineseItems);
  appendJdSection(container, "英文重点", englishItems);

  if (!container.children.length) {
    const note = document.createElement("p");
    note.className = "jd-empty-note";
    note.textContent = "官网没有返回可读的 JD 正文，建议直接打开官网具体岗位查看完整原文。";
    container.append(note);
  }
}

function conciseChineseSummary(items) {
  const summaries = uniqueTextItems(items.map(chineseSummaryForBullet).filter(Boolean));
  return compactText(summaries.slice(0, 3).join("；"), 180);
}

function limitedLabelList(text, maxItems = 2) {
  return String(text || "")
    .replace(/O2O\s*\/\s*E-?commerce/gi, "O2O_E-commerce")
    .replace(/Category\s*\/\s*Trade/gi, "Category_Trade")
    .replace(/Content\s*\/\s*Social/gi, "Content_Social")
    .replace(/NPD\s*\/\s*Innovation/gi, "NPD_Innovation")
    .split("/")
    .map((item) =>
      item
        .trim()
        .replace(/O2O_E-commerce/g, "O2O / E-commerce")
        .replace(/Category_Trade/g, "Category / Trade")
        .replace(/Content_Social/g, "Content / Social")
        .replace(/NPD_Innovation/g, "NPD / Innovation"),
    )
    .filter(Boolean)
    .slice(0, maxItems)
    .join(" / ");
}

function companyLogoText(company) {
  const value = String(company || "").replace(/\s+/g, " ").trim();
  const latinWords = value.match(/[A-Za-z][A-Za-z0-9&.'’+-]*/g) || [];
  if (latinWords.length) return latinWords.slice(0, 2).join(" ");
  const chinese = value.match(/[\u4e00-\u9fa5]/g);
  if (chinese?.length) return chinese.slice(0, 4).join("");
  return "企业";
}

function renderCompanyLogo(fragment, job) {
  const logoLink = fragment.querySelector("[data-company-logo-link]");
  const logo = fragment.querySelector("[data-logo]");
  const fallback = fragment.querySelector("[data-logo-fallback]");
  const href = job.careersUrl || job.sourceUrl || job.url || "#";
  const candidates = uniqueTextItems([job.logoUrl, ...(job.logoCandidates || [])].filter(Boolean));
  let index = 0;

  logoLink.href = href;
  fallback.textContent = companyLogoText(job.company);

  const showFallback = () => {
    logo.hidden = true;
    fallback.hidden = false;
  };

  const loadNextLogo = () => {
    const src = candidates[index];
    index += 1;
    if (!src) {
      showFallback();
      return;
    }
    fallback.hidden = true;
    logo.hidden = false;
    logo.src = src;
  };

  if (!candidates.length) {
    showFallback();
    return;
  }

  logo.alt = `${job.company || "公司"} logo`;
  logo.addEventListener("error", loadNextLogo);
  loadNextLogo();
}

function simplifyMatchReason(reason) {
  const value = String(reason || "").replace(/^匹配点[:：]\s*/, "").trim();
  if (!value || /未抓到|未明确|暂不重扣|关键词较少|官方|官网|发布时间偏久|岗位仍可尝试/i.test(value)) return "";
  if (/地点匹配上海|base\s*上海/i.test(value)) return "上海";
  if (/职能偏离|偏离目标方向/i.test(value)) return "职能可能偏离";
  if (/岗位职级偏高|director|head of|vp/i.test(value)) return "职级偏高";
  if (/经验要求明显高于|经验要求偏高/i.test(value)) return "经验偏高";
  if (/经验要求略高/i.test(value)) return "经验略高";
  if (/经验要求适合|4-5年背景/i.test(value)) return "经验适配";
  if (/近期|较新/i.test(value)) return "近期发布";
  if (/职级可冲/i.test(value)) return "职级可冲";

  const direction = value.match(/方向命中\s*(.+)$/i);
  if (direction) return limitedLabelList(direction[1], 2);

  const skills = value.match(/技能匹配\s*(.+)$/i);
  if (skills) return limitedLabelList(skills[1], 2);

  const track = value.match(/(.+?)赛道相关/);
  if (track) return compactText(track[1].replace(/\s*\/\s*/g, "/").trim(), 22);

  return compactText(value, 24);
}

function simplifiedMatchPoints(job) {
  const match = job.match || {};
  return uniqueTextItems([...(match.reasons || []), ...(match.warnings || [])].map(simplifyMatchReason).filter(Boolean)).slice(0, 5);
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

  return tags.length ? tags : ["技能待确认"];
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

function renderJobCard(job) {
  const template = document.querySelector("#job-card-template");
  const fragment = template.content.cloneNode(true);
  const card = fragment.querySelector(".job-card");
  const key = job.favoriteKey || jobKey(job);
  const match = job.match || {};

  card.dataset.jobKey = key;
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
  const jdItems = jdSummaryItemsFor(job);
  const matchPoints = simplifiedMatchPoints(job);
  fragment.querySelector("[data-insight-match]").textContent = matchPoints.length ? matchPoints.join(" · ") : "岗位方向相关";
  fragment.querySelector("[data-insight-summary]").textContent = conciseChineseSummary(jdItems);
  renderJdSummary(fragment.querySelector("[data-jd]"), jdItems);
  fragment.querySelector("[data-apply]").href = job.url || "#";
  refreshFavoriteButtons();
  return fragment;
}

function renderEmptyState(meta) {
  const empty = document.createElement("div");
  const title = document.createElement("strong");
  const detail = document.createElement("span");
  const company = form.elements.company.value.trim();
  const supplemental = meta?.supplementalSources || [];

  empty.className = "empty-state";
  if (window.location.protocol === "file:") {
    title.textContent = "暂时没有实时岗位";
    detail.textContent = "如果你是直接打开本地 HTML 文件，浏览器无法调用实时抓取接口。请用本地服务或 Vercel 线上站访问；系统不会再用样例岗位冒充真实岗位。";
  } else if (company && Number(meta?.sourceCount || 0) === 0) {
    title.textContent = "没有找到这个公司源";
    detail.textContent = `公司列表里暂时没有匹配“${company}”的官网源。可以换中文名、英文名或公司简称试试。`;
  } else if (company) {
    title.textContent = "这家公司暂时没有匹配岗位";
    detail.textContent = `已扫描“${company}”的官网源，但当前关键词、方向和匹配度下没有抓到岗位。可以清空关键词或把最低匹配度调低后再刷新。`;
  } else {
    title.textContent = "当前筛选没有匹配岗位";
    detail.textContent = "官网源已扫描完成，但这组条件下没有抓到岗位。可以放宽关键词、公司、方向或最低匹配度。";
  }
  empty.append(title, detail);
  if (supplemental.length) {
    const links = document.createElement("div");
    links.className = "lead-links";
    const leadTitle = document.createElement("b");
    leadTitle.textContent = "补充线索";
    links.append(leadTitle);
    for (const lead of supplemental.slice(0, 6)) {
      const link = document.createElement("a");
      link.href = lead.url;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = lead.label;
      link.title = lead.note || "补充渠道";
      links.append(link);
    }
    empty.append(links);
  }
  feed.append(empty);
}

function renderJobs(jobs, meta) {
  feed.innerHTML = "";
  if (!jobs.length) {
    renderEmptyState(meta);
    return;
  }

  for (const job of jobs) feed.append(renderJobCard(job));
  refreshFavoriteButtons();
  if (meta?.jobCount !== jobs.length) {
    console.info("Filtered jobs rendered", jobs.length, meta);
  }
}

function renderFavorites() {
  favoritesList.innerHTML = "";
  const favorites = [...savedJobs.values()].sort((a, b) => String(b.savedAt || "").localeCompare(String(a.savedAt || "")));
  if (!favorites.length) {
    const empty = document.createElement("div");
    empty.className = "favorite-empty";
    empty.textContent = "还没有收藏岗位。看到想回头看的岗位，点卡片底部的“收藏”就会出现在这里。";
    favoritesList.append(empty);
  } else {
    for (const job of favorites) favoritesList.append(renderJobCard(job));
  }
  refreshFavoriteButtons();
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
    const audit = source.audit || {};
    count.textContent = source.errors?.length ? "复查" : `沪 ${audit.shanghaiJobCount ?? source.jobCount}`;
    row.title = `抓到 ${audit.capturedJobCount ?? source.jobCount} 个；上海 ${audit.shanghaiJobCount ?? 0} 个；>50% ${audit.matchGt50Count ?? 0} 个`;
    row.append(label, count);
    sourceList.append(row);
  }
}

function auditStatusLabel(status) {
  const labels = {
    ok: "可用",
    blocked: "受限",
    no_jobs_captured: "未解析",
    no_shanghai_jobs: "无上海",
    no_target_roles: "无目标方向",
    below_min_score: "低于阈值",
    fetch_error: "抓取失败",
  };
  return labels[status] || "待复查";
}

function renderSourceAudit(meta) {
  if (!sourceAudit) return;
  const sample = meta?.sourceAudit?.randomSample;
  sourceAudit.innerHTML = "";
  if (!sample) {
    sourceAudit.hidden = true;
    return;
  }
  sourceAudit.hidden = false;
  const title = document.createElement("div");
  title.className = "source-audit-title";
  title.innerHTML = `<strong>抽查 agent</strong><span>${auditStatusLabel(sample.status)}</span>`;
  const company = document.createElement("a");
  company.href = sample.careersUrl || "#";
  company.target = "_blank";
  company.rel = "noreferrer";
  company.textContent = sample.company;
  const metrics = document.createElement("div");
  metrics.className = "audit-metrics";
  metrics.innerHTML = `
    <span>抓到 <b>${sample.capturedJobCount || 0}</b></span>
    <span>上海 <b>${sample.shanghaiJobCount || 0}</b></span>
    <span>>50% <b>${sample.matchGtThresholdCount || 0}</b></span>
  `;
  sourceAudit.append(title, company, metrics);
}

function renderMeta(meta, jobs) {
  stats.jobs.textContent = String(jobs.length);
  stats.sources.textContent = String(meta?.sourceCount || 0);
  stats.errors.textContent = String(meta?.errorCount || 0);
  timestamp.textContent = meta?.scannedAt ? `刷新于 ${formatTime(meta.scannedAt)} · ${meta.elapsedMs}ms` : "尚未刷新";
  rankingNote.textContent = meta?.ranking ? `排序：${meta.ranking}` : "排序：匹配度优先，并穿插不同公司。";
  renderSourceAudit(meta);
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
  const requestId = activeRequestId + 1;
  activeRequestId = requestId;
  if (jobsAbortController) jobsAbortController.abort();
  jobsAbortController = new AbortController();
  setLoading(true);
  setStatus("loading", "正在抓取官网源");
  const params = getFilters();
  renderLoading(params);

  try {
    const response = await fetch(`/api/jobs?${params.toString()}`, {
      cache: "no-store",
      signal: jobsAbortController.signal,
    });
    if (!response.ok) throw new Error(`API ${response.status}`);
    const data = await response.json();
    if (requestId !== activeRequestId) return;
    state.jobs = data.jobs || [];
    state.meta = data.meta || null;
    renderJobs(state.jobs, state.meta);
    renderMeta(state.meta, state.jobs);
    setStatus("live", state.jobs.length ? "已连接官网源" : "官网源已扫描");
  } catch (error) {
    if (error.name === "AbortError" || requestId !== activeRequestId) return;
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
    if (requestId === activeRequestId) {
      stopProgress();
      setLoading(false);
      jobsAbortController = null;
    }
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

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-favorite]");
  if (!button) return;
  const card = button.closest(".job-card");
  if (!card?.dataset.jobKey) return;
  toggleFavorite(card.dataset.jobKey);
});

toggleFavoritesButton.addEventListener("click", () => {
  favoritesSection.hidden = !favoritesSection.hidden;
  if (!favoritesSection.hidden) {
    renderFavorites();
    favoritesSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }
});

closeFavoritesButton.addEventListener("click", () => {
  favoritesSection.hidden = true;
});

backTopButton.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});

window.addEventListener("scroll", () => {
  backTopButton.classList.toggle("is-visible", window.scrollY > 520);
});

function applyUrlFilters() {
  const params = new URLSearchParams(window.location.search);
  for (const name of ["q", "company", "sourceId", "industry", "function", "originRegion", "postedWithin", "priority", "minScore"]) {
    const value = params.get(name);
    const control = form.elements[name];
    if (value !== null && control) control.value = value;
  }
  minScoreOutput.textContent = form.elements.minScore.value;
}

window.setInterval(loadJobs, 10 * 60 * 1000);
applyUrlFilters();
setupSuggestions();
readFavorites();
renderFavorites();
loadCompanySuggestions();
loadJobs();
