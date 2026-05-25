const crypto = require("crypto");
const {
  careerSources,
  negativeTitleKeywords,
  profileKeywords,
  targetKeywordGroups,
} = require("./sources");

const DEFAULT_TIMEOUT_MS = Number(process.env.SCRAPE_TIMEOUT_MS || 9000);
const DEFAULT_CONCURRENCY = Number(process.env.SCRAPE_CONCURRENCY || 6);
const DEFAULT_SOURCE_LIMIT = Number(process.env.SOURCE_LIMIT || 87);

const skillRules = [
  { label: "Consumer Insights", keywords: ["consumer insight", "insights", "market research", "用户洞察", "消费者洞察"] },
  { label: "Trend & Lifestyle", keywords: ["trend", "lifestyle", "文化趋势", "生活方式"] },
  { label: "Brand Strategy", keywords: ["brand strategy", "brand management", "brand manager", "品牌策略", "品牌管理"] },
  { label: "NPD / Innovation", keywords: ["innovation", "new product", "npd", "product development", "product innovation", "新品", "产品创新"] },
  { label: "Go-to-Market", keywords: ["go-to-market", "gtm", "launch", "上市", "上市策略"] },
  { label: "E-commerce", keywords: ["e-commerce", "ecommerce", "e-com", "tmall", "jd", "douyin", "电商", "天猫", "京东", "抖音"] },
  { label: "O2O / Omnichannel", keywords: ["o2o", "omni", "omnichannel", "instant retail", "全渠道", "即时零售"] },
  { label: "Retail Media", keywords: ["retail media", "media plan", "paid media", "媒介", "投放"] },
  { label: "Trade Marketing", keywords: ["trade marketing", "shopper", "retail marketing", "渠道营销", "购物者"] },
  { label: "Category Strategy", keywords: ["category", "assortment", "merchandising", "品类", "商品策略", "选品"] },
  { label: "Content / Social", keywords: ["content", "social", "xiaohongshu", "red book", "kol", "koc", "内容", "小红书", "种草"] },
  { label: "Data Analysis", keywords: ["analytics", "data analysis", "sql", "excel", "power bi", "tableau", "数据分析"] },
  { label: "Project Management", keywords: ["project management", "cross-functional", "stakeholder", "项目管理", "跨部门"] },
  { label: "English", keywords: ["english", "英语"] },
];

function cleanText(value = "") {
  return String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function safeLower(value = "") {
  return cleanText(value).toLowerCase();
}

function hashJob(parts) {
  return crypto.createHash("sha1").update(parts.filter(Boolean).join("|")).digest("hex").slice(0, 16);
}

function unique(items, getKey) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = getKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function includesAny(text, keywords) {
  const haystack = safeLower(text);
  return keywords.some((keyword) => haystack.includes(keyword.toLowerCase()));
}

function hasTargetKeyword(text) {
  return Object.values(targetKeywordGroups).some((keywords) => includesAny(text, keywords));
}

function hasNegativeTitle(title) {
  return includesAny(title, negativeTitleKeywords);
}

function sourceAssumesShanghai(url, source) {
  return /shanghai|上海|1796236|location=china/i.test(`${url} ${source.careersUrl}`);
}

function hasShanghaiSignal(text, url, source) {
  return /shanghai|上海/i.test(`${text} ${url}`) || sourceAssumesShanghai(url, source);
}

function absoluteUrl(href, baseUrl) {
  if (!href || href.startsWith("#") || href.startsWith("javascript:") || href.startsWith("mailto:")) return "";
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return "";
  }
}

function isSpecificJobUrl(url, source) {
  if (!url) return false;
  const normalizedUrl = url.replace(/\/+$/, "");
  const normalizedCareer = (source.careersUrl || "").replace(/\/+$/, "");
  if (normalizedUrl === normalizedCareer) return false;
  return /job|jobs|career|careers|requisition|position|posting|opportunit|vacanc|search-results\/item|\/r-\d+|\/\d{4,}/i.test(url);
}

function parseMaybeJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function flattenJobPostings(value, result = []) {
  if (!value) return result;
  if (Array.isArray(value)) {
    value.forEach((item) => flattenJobPostings(item, result));
    return result;
  }
  if (typeof value !== "object") return result;
  const type = value["@type"];
  if (type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"))) {
    result.push(value);
  }
  for (const next of Object.values(value)) {
    if (next && typeof next === "object") flattenJobPostings(next, result);
  }
  return result;
}

function extractJsonLdJobs(html, source, pageUrl) {
  const jobs = [];
  const scripts = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const match of scripts) {
    const json = parseMaybeJson(cleanText(match[1]));
    for (const posting of flattenJobPostings(json)) {
      const locationText = cleanText(JSON.stringify(posting.jobLocation || ""));
      const description = cleanText(posting.description || posting.responsibilities || posting.qualifications || "");
      const title = cleanText(posting.title || "");
      const text = `${title} ${locationText} ${description}`;
      if (!title || !hasTargetKeyword(text) || !hasShanghaiSignal(text, pageUrl, source) || hasNegativeTitle(title)) {
        continue;
      }
      jobs.push({
        title,
        company: source.company,
        industry: source.industry,
        location: locationText || "Shanghai",
        url: absoluteUrl(posting.url || pageUrl, pageUrl),
        department: inferDepartment(text),
        description,
        datePosted: cleanText(posting.datePosted || ""),
        sourceId: source.id,
        sourceUrl: pageUrl,
        sourceType: "official-jsonld",
      });
    }
  }
  return jobs.filter((job) => isSpecificJobUrl(job.url, source));
}

function extractAnchorJobs(html, source, pageUrl) {
  const jobs = [];
  const anchors = html.matchAll(/<a\b([^>]*?)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi);
  for (const match of anchors) {
    const href = match[2];
    const title = cleanText(match[4]);
    if (!title || title.length < 4 || title.length > 140 || hasNegativeTitle(title)) continue;
    const url = absoluteUrl(href, pageUrl);
    if (!url) continue;
    if (!isSpecificJobUrl(url, source)) continue;
    const index = Math.max(0, match.index - 700);
    const snippet = cleanText(html.slice(index, Math.min(html.length, match.index + 1800)));
    const text = `${title} ${url} ${snippet}`;
    if (!hasTargetKeyword(text) || !hasShanghaiSignal(text, pageUrl, source)) continue;
    jobs.push({
      title,
      company: source.company,
      industry: source.industry,
      location: /上海|shanghai/i.test(snippet) ? "Shanghai" : "Shanghai / China",
      url,
      department: inferDepartment(text),
      description: snippet.slice(0, 900),
      datePosted: extractDate(snippet),
      sourceId: source.id,
      sourceUrl: pageUrl,
      sourceType: "official-html",
    });
  }
  return jobs;
}

function extractEmbeddedJsonJobs(html, source, pageUrl) {
  const jobs = [];
  const titleMatches = [...html.matchAll(/["'](?:title|jobTitle|name)["']\s*:\s*["']([^"']{4,140})["']/gi)];
  for (const match of titleMatches.slice(0, 220)) {
    const title = cleanText(match[1]);
    if (!title || hasNegativeTitle(title)) continue;
    const snippet = cleanText(html.slice(Math.max(0, match.index - 1200), Math.min(html.length, match.index + 2600)));
    const text = `${title} ${snippet}`;
    if (!hasTargetKeyword(text) || !hasShanghaiSignal(text, pageUrl, source)) continue;
    const pathMatch =
      snippet.match(/["'](?:url|externalPath|jobUrl|applyUrl)["']\s*:\s*["']([^"']+)["']/i) ||
      snippet.match(/["'](?:canonicalPositionUrl)["']\s*:\s*["']([^"']+)["']/i);
    const jobUrl = pathMatch ? absoluteUrl(pathMatch[1].replace(/\\\//g, "/"), pageUrl) : pageUrl;
    if (!isSpecificJobUrl(jobUrl, source)) continue;
    jobs.push({
      title,
      company: source.company,
      industry: source.industry,
      location: /上海|shanghai/i.test(snippet) ? "Shanghai" : "Shanghai / China",
      url: jobUrl,
      department: inferDepartment(text),
      description: snippet.slice(0, 900),
      datePosted: extractDate(snippet),
      sourceId: source.id,
      sourceUrl: pageUrl,
      sourceType: "official-embedded",
    });
  }
  return jobs;
}

function extractDate(text) {
  const value = cleanText(text);
  const iso = value.match(/\b20\d{2}-\d{2}-\d{2}\b/);
  if (iso) return iso[0];
  const slash = value.match(/\b20\d{2}[/.]\d{1,2}[/.]\d{1,2}\b/);
  if (slash) return slash[0].replace(/[/.]/g, "-");
  const relative = value.match(/\b(?:posted|updated)\s+(?:on\s+)?([A-Za-z]{3,9}\s+\d{1,2},?\s+20\d{2})/i);
  return relative ? relative[1] : "";
}

function inferDepartment(text) {
  const lower = safeLower(text);
  const scores = [
    ["Branding", targetKeywordGroups.branding],
    ["Marketing", targetKeywordGroups.marketing],
    ["Product Innovation / NPD", targetKeywordGroups.npd],
    ["O2O / E-commerce", targetKeywordGroups.o2o],
    ["Category / Trade", targetKeywordGroups.category],
    ["Consumer Insights", targetKeywordGroups.insights],
  ].map(([label, keywords]) => ({
    label,
    score: keywords.reduce((sum, keyword) => sum + (lower.includes(keyword.toLowerCase()) ? 1 : 0), 0),
  }));
  scores.sort((a, b) => b.score - a.score);
  return scores[0].score > 0 ? scores[0].label : "Marketing / Brand";
}

function extractExperience(text) {
  const value = cleanText(text);
  const patterns = [
    /(\d{1,2})\s*\+\s*(?:years|yrs)/i,
    /(\d{1,2})\s*(?:-\s*(\d{1,2}))?\s*(?:years|yrs)\s+(?:of\s+)?(?:relevant\s+)?experience/i,
    /minimum\s+of\s+(\d{1,2})\s*(?:years|yrs)/i,
    /至少\s*(\d{1,2})\s*年/,
    /(\d{1,2})\s*年以上/,
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match) {
      const min = Number(match[1]);
      const max = match[2] ? Number(match[2]) : null;
      return {
        label: max ? `${min}-${max} years` : `${min}+ years`,
        minYears: min,
        maxYears: max,
      };
    }
  }
  if (/fresh graduate|graduate program|management trainee|管培/i.test(value)) {
    return { label: "Fresh graduate / trainee", minYears: 0, maxYears: 1 };
  }
  return { label: "未明确", minYears: null, maxYears: null };
}

function extractSkills(text) {
  const lower = safeLower(text);
  return skillRules
    .filter((rule) => rule.keywords.some((keyword) => lower.includes(keyword.toLowerCase())))
    .map((rule) => rule.label)
    .slice(0, 8);
}

function scoreJob(job, source) {
  const text = `${job.title} ${job.department} ${job.description} ${job.industry} ${source.brands.join(" ")}`;
  const lower = safeLower(text);
  const reasons = [];
  let score = 0;

  if (/上海|shanghai/i.test(`${job.location} ${job.sourceUrl}`)) {
    score += 12;
    reasons.push("base 上海");
  }

  if (/美妆|个护|消费健康|食品饮料|咖啡|零售|奢侈|生活方式|运动/.test(source.industry)) {
    score += source.priority === "A" ? 18 : 13;
    reasons.push(source.industry);
  }

  const functionScores = [
    ["Marketing", targetKeywordGroups.marketing, 15],
    ["Branding", targetKeywordGroups.branding, 16],
    ["NPD", targetKeywordGroups.npd, 17],
    ["O2O/E-commerce", targetKeywordGroups.o2o, 16],
    ["Category/Trade", targetKeywordGroups.category, 12],
    ["Insights", targetKeywordGroups.insights, 10],
  ];
  for (const [label, keywords, points] of functionScores) {
    if (keywords.some((keyword) => lower.includes(keyword.toLowerCase()))) {
      score += points;
      reasons.push(label);
    }
  }

  const skills = extractSkills(text);
  score += Math.min(22, skills.length * 4);
  if (skills.length) reasons.push(`${skills.slice(0, 3).join(" / ")} 能力`);

  const profileHits = profileKeywords.filter((keyword) => lower.includes(keyword.toLowerCase()));
  score += Math.min(18, profileHits.length * 2);

  const experience = extractExperience(text);
  if (experience.minYears === null) {
    score += 6;
  } else if (experience.minYears <= 4) {
    score += 16;
    reasons.push("经验门槛友好");
  } else if (experience.minYears <= 6) {
    score += 9;
    reasons.push("略高但可冲");
  } else {
    score -= 4;
    reasons.push("经验偏高");
  }

  if (/manager|senior|lead/i.test(job.title) && !/director|head of/i.test(job.title)) {
    score += 5;
  }
  if (/director|head of|vp/i.test(job.title)) {
    score -= 10;
  }

  const bounded = Math.max(0, Math.min(100, Math.round(score)));
  return {
    score: bounded,
    label: bounded >= 78 ? "高匹配" : bounded >= 62 ? "可重点看" : bounded >= 45 ? "可尝试" : "低匹配",
    reasons: unique(reasons, (item) => item).slice(0, 6),
    experience,
    skills,
  };
}

function normalizeJob(job, source) {
  const title = cleanText(job.title);
  const description = cleanText(job.description || "");
  const department = job.department || inferDepartment(`${title} ${description}`);
  const match = scoreJob({ ...job, title, description, department }, source);
  const id = hashJob([source.id, title, job.location, job.url]);
  return {
    id,
    title,
    company: source.company,
    industry: source.industry,
    brands: source.brands,
    location: job.location || "Shanghai",
    department,
    url: job.url || source.careersUrl,
    careersUrl: source.careersUrl,
    sourceUrl: job.sourceUrl,
    sourceType: job.sourceType,
    datePosted: job.datePosted || "",
    description,
    match,
    capturedAt: new Date().toISOString(),
  };
}

async function fetchText(url, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
        "user-agent":
          "Mozilla/5.0 (compatible; CiciJobRadar/1.0; +https://vercel.app; official-careers-monitor)",
      },
    });
    const text = await response.text();
    return { ok: response.ok, status: response.status, finalUrl: response.url || url, text };
  } finally {
    clearTimeout(timer);
  }
}

async function scanSource(source, options = {}) {
  const urls = unique([...(source.searchUrls || []), source.careersUrl], (item) => item).slice(0, options.urlsPerSource || 4);
  const jobs = [];
  const errors = [];

  for (const url of urls) {
    try {
      const fetched = await fetchText(url, options.timeoutMs || DEFAULT_TIMEOUT_MS);
      if (!fetched.ok) {
        errors.push(`${fetched.status} ${url}`);
        continue;
      }
      const html = fetched.text;
      const pageUrl = fetched.finalUrl || url;
      jobs.push(...extractJsonLdJobs(html, source, pageUrl));
      jobs.push(...extractEmbeddedJsonJobs(html, source, pageUrl));
      jobs.push(...extractAnchorJobs(html, source, pageUrl));
    } catch (error) {
      errors.push(`${error.name || "Error"} ${url}`);
    }
  }

  const normalized = unique(
    jobs.map((job) => normalizeJob(job, source)),
    (job) => job.url && job.url !== source.careersUrl ? job.url : `${job.company}|${job.title}|${job.location}`,
  )
    .filter((job) => job.match.score >= (options.minScore || 35))
    .sort((a, b) => b.match.score - a.match.score);

  return {
    sourceId: source.id,
    company: source.company,
    industry: source.industry,
    priority: source.priority,
    careersUrl: source.careersUrl,
    jobs: normalized,
    errors,
    scannedUrls: urls,
  };
}

async function runPool(items, worker, concurrency) {
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

function filterSources({ sourceLimit, priority, company } = {}) {
  let sources = careerSources.slice();
  if (priority && priority !== "all") {
    sources = sources.filter((source) => source.priority === priority);
  }
  if (company) {
    const needle = safeLower(company);
    sources = sources.filter((source) => safeLower(`${source.company} ${source.brands.join(" ")}`).includes(needle));
  }
  return sources.slice(0, sourceLimit || DEFAULT_SOURCE_LIMIT);
}

function filterJobs(jobs, filters = {}) {
  let result = jobs.slice();
  if (filters.query) {
    const needle = safeLower(filters.query);
    result = result.filter((job) => safeLower(`${job.title} ${job.company} ${job.description} ${job.department}`).includes(needle));
  }
  if (filters.industry && filters.industry !== "all") {
    result = result.filter((job) => job.industry.includes(filters.industry));
  }
  if (filters.function && filters.function !== "all") {
    const keywords = targetKeywordGroups[filters.function] || [];
    result = result.filter((job) => includesAny(`${job.title} ${job.department} ${job.description}`, keywords));
  }
  if (filters.minScore) {
    result = result.filter((job) => job.match.score >= Number(filters.minScore));
  }
  return result.sort((a, b) => b.match.score - a.match.score || a.company.localeCompare(b.company));
}

async function fetchJobs(options = {}) {
  const startedAt = Date.now();
  const sources = filterSources(options);
  const sourceResults = await runPool(
    sources,
    (source) => scanSource(source, options),
    options.concurrency || DEFAULT_CONCURRENCY,
  );
  const jobs = unique(
    sourceResults.flatMap((result) => result.jobs),
    (job) => job.url && !job.url.endsWith(job.careersUrl) ? job.url : `${job.company}|${job.title}|${job.location}`,
  );
  const filteredJobs = filterJobs(jobs, options);
  return {
    jobs: filteredJobs,
    meta: {
      scannedAt: new Date().toISOString(),
      elapsedMs: Date.now() - startedAt,
      sourceCount: sources.length,
      scannedSourceCount: sourceResults.length,
      jobCount: filteredJobs.length,
      errorCount: sourceResults.reduce((sum, result) => sum + result.errors.length, 0),
      sources: sourceResults.map((result) => ({
        id: result.sourceId,
        company: result.company,
        industry: result.industry,
        priority: result.priority,
        careersUrl: result.careersUrl,
        jobCount: result.jobs.length,
        errors: result.errors.slice(0, 3),
      })),
    },
  };
}

module.exports = {
  careerSources,
  cleanText,
  fetchJobs,
  filterJobs,
  scanSource,
};
