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

const searchAliasGroups = [
  ["百事", "pepsi", "pepsico", "百事可乐"],
  ["庄臣", "sc johnson", "scj"],
  ["品牌", "品牌传播", "品牌策略", "brand", "branding", "brand marketing", "brand strategy", "brand management"],
  ["市场", "营销", "市场营销", "marketing", "campaign", "consumer marketing", "digital marketing"],
  ["新品", "创新", "产品创新", "新品上市", "npd", "innovation", "new product", "product development", "product innovation", "launch"],
  ["新创", "食品新创", "food venture", "venture", "r&d", "研发"],
  ["电商", "电子商务", "天猫", "京东", "抖音", "e-commerce", "ecommerce", "e-com", "digital commerce", "tmall", "jd", "douyin"],
  ["全渠道", "即时零售", "到家", "o2o", "omnichannel", "omni", "instant retail"],
  ["品类", "商品", "商品策略", "渠道", "category", "category strategy", "trade marketing", "shopper", "merchandising", "assortment"],
  ["洞察", "消费者洞察", "用户洞察", "consumer insight", "consumer insights", "insight", "market research"],
  ["内容", "小红书", "种草", "kol", "koc", "content", "social", "xiaohongshu", "red book"],
  ["数据", "分析", "analytics", "data analysis", "excel", "power bi", "tableau", "sql"],
  ["项目", "跨部门", "project management", "cross-functional", "stakeholder"],
];

const actionTitlePattern =
  /^(?:view\s+jobs?|view\s+all\s+jobs?|view\s+role|login|log\s+in|sign\s+in|apply|apply\s+now|share|share\s+this\s+job|learn\s+more|read\s+more|job\s+search|search\s+jobs|open\s+positions?|join\s+talent\s+community|job\s+alerts?|职位详情|查看职位|查看岗位|登录|申请|立即申请|分享)$/i;

const nonShanghaiLocationPattern =
  /\b(?:melbourne|victoria|levallois|paris|london|new york|sydney|singapore|tokyo|osaka|seoul|bangkok|jakarta|mumbai|hong kong|taipei|taiwan|berlin|munich|toronto|vancouver|amsterdam|dublin|madrid|milan|rome|dubai|auckland|kuala lumpur|manila|bengaluru|bangalore|delhi|gurgaon|remote|makati|cebu|philippines|racine|wisconsin|boise|idaho|arese|italy|brampton|ontario|canada|miguel hidalgo|mexico|multiple)\b/i;

const codeNoisePattern =
  /\\n|FOOTER|LINK-\d+|NAV_LOGO|SOCIAL(?:LINK)?|Glassdoor|Privacy Policy|Terms of Use|Code of Conduct|assets\/|\.jpg|\.png|\.svg|path d=|viewBox|token-typ|token-data/i;

const roleTitlePattern =
  /\b(?:manager|director|analyst|specialist|planner|supervisor|lead|associate|coordinator|executive|officer|consultant|head|marketing|brand|category|commerce|innovation|product|consumer|insight|strategy|venture|r&d)\b|经理|主管|总监|专员|分析|市场|营销|品牌|品类|商品|电商|渠道|创新|新创|研发|消费者|洞察|战略|计划|拓展|负责人/i;

const nonTargetFunctionPattern =
  /\b(?:supply chain|warehouse|technician|procurement|finance|accounting|legal|human resources|talent acquisition|recruiter|recruiting|government affairs|it\s*&|software engineering|engineering|demand planning|forecast|statistical modeling|quality|manufacturing|operations)\b|供应链|仓储|技术员|采购|财务|法务|人力资源|招聘|政府事务|软件|工程|生产|质量|运营/i;

function cleanText(value = "") {
  return String(value)
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/\\n|\\r|\\t/g, " ")
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

function compactCleanText(value = "") {
  return cleanText(value)
    .replace(/\s*;\s*/g, "；")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanJobText(value = "") {
  const raw = String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/\\u003c/gi, "<")
    .replace(/\\u003e/gi, ">")
    .replace(/\\u0026/gi, "&")
    .replace(/\\"/g, '"')
    .replace(/\\n|\\r|\\t/g, " ");

  let text = cleanText(raw)
    .replace(/&#xA;|&#10;|&mdash;|&rsquo;|&lsquo;|&ldquo;|&rdquo;/gi, " ")
    .replace(/[-\w:]+=(?:"[^"]*"|'[^']*')/g, " ")
    .replace(/['"]?(?:eventAction|eventLabel|eventCategory|eventValue|socialNetwork|canonicalPositionUrl|externalPath|applyUrl|jobUrl|ecommerce)['"]?\s*:\s*[^,;。]{0,220}/gi, " ")
    .replace(/\b(?:button\.dataset|dataLayer|gtag|querySelector|addEventListener|window\.|document\.|undefined)\b[^.。]{0,180}/gi, " ")
    .replace(/\b(?:const|let|var|function|return)\b[^.。]{0,180}/gi, " ")
    .replace(/\b(?:class|href|data|aria|role|target|rel|id|src|alt)\b/gi, " ")
    .replace(/\b(?:main-menu|menu__link|system-path|node\/\d+|level-\d+)\b/gi, " ")
    .replace(/\b(?:Share this job|Share job|Copy link|AddThis|Login|Log in|View job)\b[\s\S]*$/i, " ")
    .replace(/[{}()[\];<>]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const starterPatterns = [
    /hello,\s+we[’']?re/i,
    /\bat\s+[A-Z][A-Za-z&.\s]{2,40},?\s+we\b/i,
    /\babout\s+(?:the\s+)?(?:role|team|job|position|us)\b/i,
    /\bjob\s+description\b/i,
    /\bresponsibilit(?:y|ies)\b/i,
    /\bqualification(?:s)?\b/i,
    /\bwhat\s+you[’']?ll\s+do\b/i,
    /\ba\s+day\s+in\s+the\s+life\b/i,
    /\byour\s+role\b/i,
    /岗位职责|职位描述|工作职责|任职要求|关于我们|你将负责/,
  ];
  const hasLeadingNoise = /eventAction|eventLabel|button\.dataset|dataLayer|undefined|querySelector|Share this job/i.test(
    text.slice(0, 260),
  );
  const starts = starterPatterns
    .map((pattern) => {
      const match = text.match(pattern);
      return match ? match.index : -1;
    })
    .filter((index) => index > 0);
  if (starts.length) {
    const firstStart = Math.min(...starts);
    const beforeStart = text.slice(0, firstStart);
    if (hasLeadingNoise || /category\s*:|socialnetwork|,\s*,|Posted\s+\d{1,2}-[A-Za-z]{3}/i.test(beforeStart)) {
      text = text.slice(firstStart).trim();
    }
  }

  text = text
    .replace(/\b(?:Share this job|Share job|Copy link|Apply now|Apply for this job|Back to search results)\b[\s\S]*$/i, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!isReadableDescription(text)) return "";
  return text;
}

function isReadableDescription(text = "") {
  const value = String(text || "").trim();
  if (value.length < 36) return false;
  if (/href|class|system-path|main-menu|node\/\d+|data-[a-z-]+|button\.dataset|eventAction|eventLabel|querySelector|dataLayer/i.test(value)) {
    return false;
  }
  const codeMarks = (value.match(/[{}[\]=;]/g) || []).length;
  if (codeMarks > 8 && codeMarks > value.length / 45) return false;
  const noiseHits = (value.match(/\b(?:undefined|dataset|eventAction|eventLabel|function|querySelector|canonicalPositionUrl)\b/gi) || []).length;
  if (noiseHits >= 2) return false;
  const letters = value.replace(/[^a-zA-Z\u4e00-\u9fa5]/g, "");
  if (letters.length < 24) return false;
  const jobWords = /(responsibilit|qualification|requirement|experience|skill|role|team|business|brand|marketing|product|category|commercial|职责|要求|经验|能力|岗位|团队|品牌|市场|产品|品类)/i;
  return jobWords.test(value) || value.length >= 120;
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

function expandSearchToken(token) {
  const cleaned = cleanText(token).toLowerCase();
  if (!cleaned) return [];
  const group = searchAliasGroups.find((items) =>
    items.some((item) => {
      const value = item.toLowerCase();
      return value === cleaned || value.includes(cleaned) || cleaned.includes(value);
    }),
  );
  return unique([cleaned, ...(group || [])], (item) => item.toLowerCase());
}

function matchesSearchQuery(text, query) {
  const tokens = cleanText(query)
    .split(/[\s,，/、|]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (!tokens.length) return true;
  const haystack = safeLower(text);
  return tokens.every((token) => expandSearchToken(token).some((alias) => haystack.includes(alias.toLowerCase())));
}

function hasTargetKeyword(text) {
  return Object.values(targetKeywordGroups).some((keywords) => includesAny(text, keywords));
}

function hasNegativeTitle(title) {
  return includesAny(title, negativeTitleKeywords);
}

function isGenericLandingTitle(title) {
  return /^(marketing|product management|e-?commerce|retail|sales|merchandising|brand|careers?|jobs?|teams?|overview|transformation|leadership|board committee composition)$/i.test(cleanText(title));
}

function isInvalidJobTitle(title) {
  const value = cleanText(title);
  if (!value || value.length < 4 || value.length > 140) return true;
  if (codeNoisePattern.test(value)) return true;
  if (actionTitlePattern.test(value)) return true;
  if (/^(?:home|menu|search|filter|privacy|cookie|terms|language)$/i.test(value)) return true;
  if (/^(?:view|login|apply|share|learn more|read more)\b/i.test(value) && value.length < 28) return true;
  if (!roleTitlePattern.test(value)) return true;
  if (hasNegativeTitle(value) || isGenericLandingTitle(value)) return true;
  return false;
}

function hasConflictingLocation(title, text = "", url = "") {
  const focused = `${title} ${url}`;
  if (/上海|shanghai/i.test(focused)) return false;
  if (nonShanghaiLocationPattern.test(focused)) return true;
  const earlyText = cleanText(text).slice(0, 280);
  return nonShanghaiLocationPattern.test(earlyText) && !/上海|shanghai/i.test(earlyText);
}

function hasExplicitShanghaiSignal(text) {
  return /上海|shanghai/i.test(cleanText(text));
}

function isShanghaiJob(text, url = "") {
  const value = `${text} ${url}`;
  if (!hasExplicitShanghaiSignal(value)) return false;
  return !hasConflictingLocation("", value, url);
}

function hasTargetRoleSignal(job) {
  const text = `${job.title || ""} ${job.department || ""} ${job.description || ""}`;
  return hasTargetKeyword(text);
}

function isNonTargetRole(job) {
  const titleAndDepartment = `${job.title || ""} ${job.department || ""}`;
  if (!nonTargetFunctionPattern.test(titleAndDepartment)) return false;
  return !hasTargetKeyword(titleAndDepartment);
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
  if (/\/careers\/teams?\/|\/teams?\/|\/login|\/signin|\/sign-in/i.test(url)) return false;
  if (/search(?:-jobs|-results|results)?[/?#]/i.test(url) && !/search-results\/item/i.test(url)) return false;
  if (/[?&](?:keyword|keywords|location|q|search)=/i.test(url) && !/(?:job_id|jobid|requisition|reqid|gh_jid|jobId)=/i.test(url)) {
    return false;
  }
  return /\/job\/|\/jobs\/|jobs\?|job_id|jobid|requisition|position|posting|vacanc|search-results\/item|\/r-\d+|\/\d{4,}/i.test(url);
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
      const description = cleanJobText(posting.description || posting.responsibilities || posting.qualifications || "");
      const title = cleanText(posting.title || "");
      const text = `${title} ${locationText} ${description}`;
      if (
        isInvalidJobTitle(title) ||
        hasConflictingLocation(title, locationText, absoluteUrl(posting.url || pageUrl, pageUrl)) ||
        !hasTargetKeyword(text) ||
        !isShanghaiJob(`${title} ${locationText} ${description}`, absoluteUrl(posting.url || pageUrl, pageUrl))
      ) {
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
    if (isInvalidJobTitle(title)) continue;
    const url = absoluteUrl(href, pageUrl);
    if (!url) continue;
    if (!isSpecificJobUrl(url, source)) continue;
    const index = Math.max(0, match.index - 700);
    const snippet = cleanJobText(html.slice(index, Math.min(html.length, match.index + 1800)));
    const text = `${title} ${url} ${snippet}`;
    if (hasConflictingLocation(title, snippet, url)) continue;
    if (!hasTargetKeyword(text) || !isShanghaiJob(text, url)) continue;
    jobs.push({
      title,
      company: source.company,
      industry: source.industry,
      location: inferLocation(`${title} ${snippet} ${url}`),
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
    if (isInvalidJobTitle(title)) continue;
    const rawSnippet = html.slice(Math.max(0, match.index - 1200), Math.min(html.length, match.index + 2600));
    const snippet = cleanJobText(rawSnippet);
    const text = `${title} ${snippet}`;
    const pathMatch =
      rawSnippet.match(/["'](?:url|externalPath|jobUrl|applyUrl)["']\s*:\s*["']([^"']+)["']/i) ||
      rawSnippet.match(/["'](?:canonicalPositionUrl)["']\s*:\s*["']([^"']+)["']/i);
    const jobUrl = pathMatch ? absoluteUrl(pathMatch[1].replace(/\\\//g, "/"), pageUrl) : pageUrl;
    if (!isSpecificJobUrl(jobUrl, source)) continue;
    if (hasConflictingLocation(title, snippet, jobUrl)) continue;
    if (!hasTargetKeyword(text) || !isShanghaiJob(text, jobUrl)) continue;
    jobs.push({
      title,
      company: source.company,
      industry: source.industry,
      location: inferLocation(`${title} ${snippet} ${jobUrl}`),
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

function extractStructuredListJobs(html, source, pageUrl) {
  const jobs = [];
  const items = html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi);
  for (const item of items) {
    const block = item[1];
    if (!/data-job-id|job-location|Req ID|req_id/i.test(block)) continue;
    const anchor = block.match(/<a\b([^>]*?)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/i);
    if (!anchor) continue;
    const url = absoluteUrl(anchor[2], pageUrl);
    if (!isSpecificJobUrl(url, source)) continue;
    const title = cleanText((block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i) || [])[1] || anchor[4]);
    if (isInvalidJobTitle(title)) continue;
    const location = cleanText((block.match(/class=["'][^"']*job-location[^"']*["'][^>]*>([\s\S]*?)<\/span>/i) || [])[1] || "");
    const department = cleanText((block.match(/class=["'][^"']*(?:job-area|job-category|sr-facet)[^"']*["'][^>]*>([\s\S]*?)<\/span>/i) || [])[1] || "");
    const jobId = cleanText((block.match(/data-job-id=["']([^"']+)["']/i) || [])[1] || extractJobId(block, url));
    const snippet = cleanJobText(block);
    const text = `${title} ${location} ${department} ${snippet}`;
    if (!isShanghaiJob(`${title} ${location}`, url)) continue;
    if (!hasTargetKeyword(text)) continue;
    jobs.push({
      title,
      company: source.company,
      industry: source.industry,
      location: location || inferLocation(text),
      url,
      department: department || inferDepartment(text),
      description: snippet,
      datePosted: extractDate(block),
      jobId,
      sourceId: source.id,
      sourceUrl: pageUrl,
      sourceType: "official-list",
    });
  }
  return jobs;
}

function normalizeApiJobUrl(data, source) {
  if (data.url) return absoluteUrl(data.url, source.careersUrl);
  if (data.jobUrl) return absoluteUrl(data.jobUrl, source.careersUrl);
  if (data.apply_url && !/\/login(?:[/?#]|$)/i.test(data.apply_url)) return data.apply_url;
  const slug = data.slug || data.req_id || data.jobId || data.id;
  if (!slug) return source.careersUrl;
  const language = data.language || "en-us";
  const context = /pepsicojobs\.com\/china/i.test(source.careersUrl) ? "china" : "";
  const path = context ? `/${context}/jobs/${slug}` : `/jobs/${slug}`;
  return absoluteUrl(`${path}?lang=${encodeURIComponent(language)}`, source.careersUrl);
}

function extractApiJobs(payload, source, pageUrl) {
  const jobs = [];
  const records = Array.isArray(payload?.jobs)
    ? payload.jobs
    : Array.isArray(payload?.results)
      ? payload.results
      : Array.isArray(payload)
        ? payload
        : [];
  for (const record of records) {
    const data = record?.data || record;
    if (!data || typeof data !== "object") continue;
    const title = compactCleanText(data.title || data.jobTitle || data.name || "");
    if (isInvalidJobTitle(title)) continue;
    const categoryText = [
      data.category,
      data.categories,
      data.jobFunction,
      data.department,
      data.tags,
      data.tags1,
      data.tags2,
    ]
      .flatMap((item) => (Array.isArray(item) ? item : [item]))
      .map((item) => (typeof item === "object" ? item.name || item.label || item.value || "" : item || ""))
      .join(" ");
    const location = compactCleanText(
      data.full_location ||
        data.short_location ||
        [data.city, data.state, data.country].filter(Boolean).join(", ") ||
        data.location ||
        data.location_name ||
        "",
    );
    const description = cleanJobText(
      [data.description, data.responsibilities, data.qualifications, data.summary].filter(Boolean).join(" "),
    );
    const url = normalizeApiJobUrl(data, source);
    const text = `${title} ${location} ${categoryText} ${description}`;
    if (!isShanghaiJob(`${title} ${location}`, url)) continue;
    if (hasConflictingLocation(title, location, url)) continue;
    if (!hasTargetKeyword(text)) continue;
    jobs.push({
      title,
      company: source.company,
      industry: source.industry,
      location: location || inferLocation(text),
      url,
      department: inferDepartment(`${title} ${categoryText} ${description}`),
      description,
      datePosted: cleanText(data.posted_date || data.datePosted || data.create_date || data.update_date || ""),
      jobId: cleanText(data.req_id || data.jobId || data.job_id || data.id || data.slug || extractJobId(text, url)),
      sourceId: source.id,
      sourceUrl: pageUrl,
      sourceType: "official-api",
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
  const dashMonth = value.match(/\b(\d{1,2})-([A-Za-z]{3,9})-(20\d{2})\b/);
  if (dashMonth) {
    const parsed = new Date(`${dashMonth[2]} ${dashMonth[1]}, ${dashMonth[3]}`);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }
  const relative = value.match(/\b(?:posted|updated)\s+(?:on\s+)?([A-Za-z]{3,9}\s+\d{1,2},?\s+20\d{2})/i);
  if (relative) return relative[1];
  const daysAgo = value.match(/\b(\d{1,2})\s+days?\s+ago\b/i);
  if (daysAgo) {
    const date = new Date();
    date.setDate(date.getDate() - Number(daysAgo[1]));
    return date.toISOString().slice(0, 10);
  }
  return "";
}

function parseDateValue(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  const monthParsed = new Date(`${value.replace(",", "")}`);
  return Number.isNaN(monthParsed.getTime()) ? null : monthParsed;
}

function inferLocation(text) {
  const value = cleanText(text);
  if (/上海|shanghai/i.test(value)) return "Shanghai / China";
  const known = value.match(
    /\b(?:Makati City, Philippines|Cebu, Philippines|Racine, Wisconsin|Boise, Idaho|Arese, Italy|Brampton, Ontario Canada|MIGUEL HIDALGO, Distrito Federal Mexico|Singapore|Hong Kong|Taipei|Tokyo|Seoul|Melbourne|London|Paris|New York)\b/i,
  );
  return known ? known[0] : "未明确";
}

function extractJobId(text = "", url = "") {
  const value = `${cleanText(text)} ${url}`;
  const patterns = [
    /\b(?:Req(?:uisition)?|Job)\s*ID\s*[:#]?\s*([A-Z0-9-]{3,})/i,
    /\b(?:req_id|jobId|job_id|data-job-id)["'\s:=]+([A-Z0-9-]{3,})/i,
    /\/(?:jobs?|job)\/(\d{4,})(?:[/?#]|$)/i,
    /\/(\d{4,})(?:[/?#]|$)/i,
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match) return match[1];
  }
  return "";
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

  if (/上海|shanghai/i.test(`${job.location} ${job.title} ${job.url}`)) {
    score += 16;
    reasons.push("base 上海");
  }

  if (/美妆|个护|消费健康|食品饮料|咖啡|零售|奢侈|生活方式|运动/.test(source.industry)) {
    score += source.priority === "A" ? 14 : 10;
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

  if (isNonTargetRole(job)) {
    score -= 45;
    reasons.push("职能偏离");
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
  const description = cleanJobText(job.description || "");
  const department = job.department || inferDepartment(`${title} ${description}`);
  const location = job.location || inferLocation(`${title} ${description} ${job.url}`);
  const url = job.url || source.careersUrl;
  const jobId = cleanText(job.jobId || extractJobId(`${title} ${description}`, url));
  const match = scoreJob({ ...job, title, description, department, location, url }, source);
  const id = hashJob([source.id, jobId, title, location, url]);
  return {
    id,
    jobId,
    title,
    company: source.company,
    originCountry: source.originCountry,
    originRegion: source.originRegion,
    industry: source.industry,
    brands: source.brands,
    location,
    department,
    url,
    careersUrl: source.careersUrl,
    sourceUrl: job.sourceUrl,
    sourceType: job.sourceType,
    datePosted: job.datePosted || extractDate(description) || "",
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
    return { ok: response.ok, status: response.status, finalUrl: response.url || url, contentType: response.headers.get("content-type") || "", text };
  } finally {
    clearTimeout(timer);
  }
}

async function scanSource(source, options = {}) {
  const urlCandidates = source.apiUrls?.length ? source.apiUrls : [...(source.searchUrls || []), source.careersUrl];
  const urls = unique(urlCandidates, (item) => item).slice(0, options.urlsPerSource || 8);
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
      const contentType = fetched.contentType || "";
      if (/json/i.test(contentType) || /^[\s\n\r]*[{[]/.test(html)) {
        const json = parseMaybeJson(html);
        jobs.push(...extractApiJobs(json, source, pageUrl));
      } else {
        jobs.push(...extractJsonLdJobs(html, source, pageUrl));
        jobs.push(...extractStructuredListJobs(html, source, pageUrl));
        jobs.push(...extractEmbeddedJsonJobs(html, source, pageUrl));
        jobs.push(...extractAnchorJobs(html, source, pageUrl));
      }
    } catch (error) {
      errors.push(`${error.name || "Error"} ${url}`);
    }
  }

  const normalized = unique(
    jobs.map((job) => normalizeJob(job, source)),
    (job) => job.url && job.url !== source.careersUrl ? job.url : `${job.company}|${job.title}|${job.location}`,
  )
    .filter((job) => !isInvalidJobTitle(job.title) && isShanghaiJob(`${job.title} ${job.location}`, job.url))
    .filter((job) => hasTargetRoleSignal(job) && !isNonTargetRole(job))
    .filter((job) => job.match.score >= (options.minScore || 35))
    .sort((a, b) => b.match.score - a.match.score);

  return {
    sourceId: source.id,
    company: source.company,
    industry: source.industry,
    originCountry: source.originCountry,
    originRegion: source.originRegion,
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

function filterSources({ sourceLimit, priority, company, originRegion } = {}) {
  let sources = careerSources.slice();
  if (priority && priority !== "all") {
    sources = sources.filter((source) => source.priority === priority);
  }
  if (company) {
    sources = sources.filter((source) =>
      matchesSearchQuery(`${source.company} ${source.brands.join(" ")} ${source.originCountry} ${source.originRegion}`, company),
    );
  }
  if (originRegion && originRegion !== "all") {
    sources = sources.filter((source) => source.originRegion === originRegion);
  }
  return sources.slice(0, sourceLimit || DEFAULT_SOURCE_LIMIT);
}

function rankScore(job, filters = {}) {
  let score = job.match.score;
  if (filters.query && matchesSearchQuery(`${job.title} ${job.department}`, filters.query)) {
    score += 12;
  }
  if (filters.function && filters.function !== "all") {
    const keywords = targetKeywordGroups[filters.function] || [];
    if (includesAny(`${job.title} ${job.department}`, keywords)) score += 10;
  }
  const posted = parseDateValue(job.datePosted);
  if (posted) {
    const ageDays = Math.max(0, Math.floor((Date.now() - posted.getTime()) / 86400000));
    if (ageDays <= 7) score += 6;
    else if (ageDays <= 30) score += 4;
    else if (ageDays <= 90) score += 2;
  }
  if (job.sourceType === "official-jsonld") score += 2;
  if (job.sourceType === "official-api") score += 3;
  if (job.description) score += 1;
  if (job.jobId) score += 1;
  return score;
}

function diversifyJobs(jobs, filters = {}) {
  const ranked = jobs
    .map((job) => ({ ...job, rankScore: rankScore(job, filters) }))
    .sort((a, b) => b.rankScore - a.rankScore || b.match.score - a.match.score || a.company.localeCompare(b.company));

  if (filters.company || ranked.length <= 3) return ranked;

  const groups = new Map();
  for (const job of ranked) {
    if (!groups.has(job.company)) groups.set(job.company, []);
    groups.get(job.company).push(job);
  }

  const result = [];
  while (groups.size) {
    const activeGroups = [...groups.entries()].sort((a, b) => b[1][0].rankScore - a[1][0].rankScore);
    for (const [company, companyJobs] of activeGroups) {
      if (!companyJobs.length) {
        groups.delete(company);
        continue;
      }
      if (result.at(-1)?.company === company && activeGroups.length > 1) continue;
      result.push(companyJobs.shift());
      if (!companyJobs.length) groups.delete(company);
    }
  }

  return result;
}

function filterJobs(jobs, filters = {}) {
  let result = jobs.slice();
  if (filters.query) {
    result = result.filter((job) =>
      matchesSearchQuery(
        `${job.title} ${job.company} ${job.brands.join(" ")} ${job.description} ${job.department} ${job.industry} ${job.originCountry}`,
        filters.query,
      ),
    );
  }
  if (filters.industry && filters.industry !== "all") {
    result = result.filter((job) => job.industry.includes(filters.industry));
  }
  if (filters.originRegion && filters.originRegion !== "all") {
    result = result.filter((job) => job.originRegion === filters.originRegion);
  }
  if (filters.function && filters.function !== "all") {
    const keywords = targetKeywordGroups[filters.function] || [];
    result = result.filter((job) => includesAny(`${job.title} ${job.department} ${job.description}`, keywords));
  }
  if (filters.postedWithin && filters.postedWithin !== "all") {
    const days = Number(filters.postedWithin);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    result = result.filter((job) => {
      const date = parseDateValue(job.datePosted);
      return date && date >= cutoff;
    });
  }
  if (filters.minScore) {
    result = result.filter((job) => job.match.score >= Number(filters.minScore));
  }
  return diversifyJobs(result, filters);
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
      ranking: "按匹配度、新鲜度与 JD 可读性排序，并穿插不同公司，避免同一家公司连续刷屏。",
      errorCount: sourceResults.reduce((sum, result) => sum + result.errors.length, 0),
      sources: sourceResults.map((result) => ({
        id: result.sourceId,
        company: result.company,
        industry: result.industry,
        originCountry: result.originCountry,
        originRegion: result.originRegion,
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
  cleanJobText,
  cleanText,
  fetchJobs,
  filterJobs,
  scanSource,
};
