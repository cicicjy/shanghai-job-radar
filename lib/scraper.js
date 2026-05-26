const crypto = require("crypto");
const {
  careerSources,
  negativeTitleKeywords,
  profileKeywords,
  targetKeywordGroups,
} = require("./sources");

const DEFAULT_TIMEOUT_MS = Number(process.env.SCRAPE_TIMEOUT_MS || 9000);
const DEFAULT_CONCURRENCY = Number(process.env.SCRAPE_CONCURRENCY || 6);
const DEFAULT_SOURCE_LIMIT = Number(process.env.SOURCE_LIMIT || careerSources.length);

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
  { label: "Ingredients / Application", keywords: ["ingredient", "fragrance", "flavor", "flavour", "application", "formulation", "sensory", "nutrition", "food science", "personal care", "active ingredient", "香精", "香料", "配方", "应用", "感官", "原料", "配料"] },
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
  /\b(?:supply chain|logistics|warehouse|technician|procurement|finance|accounting|legal|human resources|talent acquisition|recruiter|recruiting|government affairs|it\s*&|software engineering|engineering|demand planning|forecast|statistical modeling|quality|manufacturing|operations)\b|供应链|物流|仓储|技术员|采购|财务|法务|人力资源|招聘|政府事务|软件|工程|生产|质量|运营/i;

const nonFullTimeTitlePattern =
  /\b(?:intern(?:ship|s)?|trainee|management\s+trainee|graduate\s+(?:program|scheme)|campus|part[-\s]?time|temporary|temp|contract(?:or|ual)?|fixed[-\s]?term|seasonal)\b|实习|见习|管培|校招|校园招聘|应届|兼职|临时|合同工|派遣|季节性|暑期/i;

const nonFullTimeContextPattern =
  /\b(?:intern(?:ship|s)?|trainee|management\s+trainee|graduate\s+(?:program|scheme)|campus|part[-\s]?time|temporary|temp|contract(?:or|ual)?|fixed[-\s]?term|contingent|seasonal)\b|实习|见习|管培|校招|校园招聘|应届|兼职|临时|合同工|派遣|季节性|暑期/i;

const nonFullTimeMarkerPattern =
  /\b(?:employment|job|work|worker|schedule|time)\s*type\b|职位类型|工作类型|工作性质|雇佣类型|岗位性质|contract\s+role|fixed[-\s]?term|part[-\s]?time|internship|实习/i;

const summaryNoisePattern =
  /\b(?:equal opportunity|privacy policy|terms of use|cookie|background check|diversity and inclusion|all qualified applicants|applicant privacy|click here|apply now|share this job)\b|隐私|平等机会|申请须知/i;

const chinesePhraseMap = [
  [/\bresponsible for\b/gi, "负责"],
  [/\blead(?:ing)?\b/gi, "主导"],
  [/\bdrive\b/gi, "推动"],
  [/\bdevelop\b/gi, "制定"],
  [/\bmanage\b/gi, "管理"],
  [/\bpartner with\b/gi, "协同"],
  [/\bcollaborate with\b/gi, "协作"],
  [/\bcross[-\s]?functional\b/gi, "跨部门"],
  [/\bstakeholders?\b/gi, "利益相关方"],
  [/\bconsumer insights?\b/gi, "消费者洞察"],
  [/\bmarket research\b/gi, "市场研究"],
  [/\bbrand strategy\b/gi, "品牌策略"],
  [/\bbrand\b/gi, "品牌"],
  [/\bmarketing\b/gi, "市场营销"],
  [/\bcampaigns?\b/gi, "营销活动"],
  [/\binnovation\b/gi, "创新"],
  [/\bnew product\b/gi, "新品"],
  [/\be-?commerce\b/gi, "电商"],
  [/\bomnichannel\b/gi, "全渠道"],
  [/\bo2o\b/gi, "O2O"],
  [/\bcategory\b/gi, "品类"],
  [/\btrade marketing\b/gi, "渠道营销"],
  [/\banalytics?\b/gi, "分析"],
  [/\bdata\b/gi, "数据"],
  [/\bstrategy\b/gi, "策略"],
  [/\bproject management\b/gi, "项目管理"],
  [/\bexperience\b/gi, "经验"],
  [/\byears?\b/gi, "年"],
  [/\bbachelor'?s?\b/gi, "本科"],
  [/\bdegree\b/gi, "学历"],
  [/\benglish\b/gi, "英语"],
  [/\bcommunication\b/gi, "沟通"],
  [/\bfluent\b/gi, "流利"],
  [/\bstrong\b/gi, "较强"],
  [/\bskills?\b/gi, "能力"],
  [/\brequired\b/gi, "需要"],
  [/\bpreferred\b/gi, "优先"],
];

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

function matchesAnySearchToken(text, query) {
  const tokens = cleanText(query)
    .split(/[\s,，/、|]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (!tokens.length) return true;
  const haystack = safeLower(text);
  return tokens.some((token) => expandSearchToken(token).some((alias) => haystack.includes(alias.toLowerCase())));
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
  const title = `${job.title || ""}`;
  if (nonTargetFunctionPattern.test(title) && !hasTargetKeyword(title)) return true;
  const titleAndDepartment = `${job.title || ""} ${job.department || ""}`;
  if (!nonTargetFunctionPattern.test(titleAndDepartment)) return false;
  return !hasTargetKeyword(titleAndDepartment);
}

function stringifySignal(value) {
  if (Array.isArray(value)) return value.map((item) => stringifySignal(item)).join(" ");
  if (value && typeof value === "object") return Object.values(value).map((item) => stringifySignal(item)).join(" ");
  return cleanText(value || "");
}

function hasNonFullTimeSignal(job = {}) {
  const titleFocus = cleanText(`${job.title || ""} ${job.department || ""}`);
  if (nonFullTimeTitlePattern.test(titleFocus)) return true;

  const structuredText = stringifySignal([
    job.employmentType,
    job.workType,
    job.workerType,
    job.jobType,
    job.schedule,
    job.categoryText,
    job.categories,
    job.tags,
  ]);
  if (nonFullTimeContextPattern.test(structuredText)) return true;

  if (/\b(?:intern(?:ship)?|trainee|campus|part[-\s]?time|temporary|fixed[-\s]?term|seasonal)\b|实习|校招|兼职/i.test(String(job.url || ""))) {
    return true;
  }

  const earlyDescription = cleanText(job.description || "").slice(0, 1200);
  return nonFullTimeMarkerPattern.test(earlyDescription) && nonFullTimeContextPattern.test(earlyDescription);
}

function isFullTimeJob(job = {}) {
  return !hasNonFullTimeSignal(job);
}

function truncateSummaryText(value = "", maxLength = 180) {
  const text = cleanText(value)
    .replace(/^[-*•\d.)\s]+/, "")
    .replace(/\b(?:responsibilities|requirements|qualifications|overview|job description)\s*[:：-]?\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}…`;
}

function cleanSummaryBullet(value = "") {
  const text = truncateSummaryText(value);
  if (!text || text.length < 16) return "";
  if (summaryNoisePattern.test(text)) return "";
  if (codeNoisePattern.test(text)) return "";
  return text;
}

function splitSummarySentences(text = "") {
  const prepared = cleanText(text)
    .replace(/\b(?:key\s+)?responsibilit(?:y|ies)\b\s*[:：-]?\s*/gi, ". ")
    .replace(/\b(?:qualifications?|requirements?)\b\s*[:：-]?\s*/gi, ". ")
    .replace(/\b(?:Lead|Drive|Develop|Manage|Own|Support|Collaborate|Partner|Analyze|Build|Create|Ensure)\b/g, ". $&")
    .replace(/(?:岗位职责|工作职责|任职要求|职位要求|资格要求)\s*[:：-]?\s*/g, ". ");
  const pieces = prepared.match(/[^.!?。！？；;]+[.!?。！？；;]?/g) || [];
  return unique(
    pieces
      .map((piece) => cleanSummaryBullet(piece))
      .filter(Boolean),
    (item) => item.toLowerCase(),
  ).slice(0, 36);
}

function extractSummarySections(description = "") {
  const value = cleanText(description);
  const configs = [
    {
      key: "overview",
      pattern: /\b(?:overview|job\s+description|about\s+(?:the\s+)?(?:role|job|team)|your\s+role)\b|职位描述|岗位描述|关于岗位|关于团队/gi,
    },
    {
      key: "responsibilities",
      pattern: /\b(?:key\s+)?responsibilit(?:y|ies)|what\s+you(?:'|’)?ll\s+do|accountabilities|duties\b|岗位职责|工作职责|主要职责|你将负责/gi,
    },
    {
      key: "requirements",
      pattern: /\b(?:qualifications?|requirements?|what\s+you(?:'|’)?ll\s+need|skills\s+(?:and\s+)?experience)\b|任职要求|职位要求|资格要求|能力要求/gi,
    },
  ];
  const markers = [];
  for (const config of configs) {
    for (const match of value.matchAll(config.pattern)) {
      markers.push({ key: config.key, index: match.index, end: match.index + match[0].length });
    }
  }
  markers.sort((a, b) => a.index - b.index);

  const sections = { overview: "", responsibilities: "", requirements: "" };
  for (let index = 0; index < markers.length; index += 1) {
    const marker = markers[index];
    const next = markers[index + 1]?.index || value.length;
    const slice = value.slice(marker.end, next).trim();
    if (slice.length >= 24) sections[marker.key] = `${sections[marker.key]} ${slice}`.trim();
  }
  return sections;
}

function sentenceKeywordScore(sentence, keywords) {
  const lower = safeLower(sentence);
  return keywords.reduce((sum, keyword) => sum + (lower.includes(keyword) ? 1 : 0), 0);
}

function pickSummaryBullets(sectionText, allSentences, keywords, limit = 3) {
  const sectionSentences = splitSummarySentences(sectionText);
  const candidates = sectionSentences.length ? sectionSentences : allSentences;
  const scored = candidates
    .map((sentence, index) => ({
      sentence,
      index,
      score: sentenceKeywordScore(sentence, keywords) + (hasTargetKeyword(sentence) ? 1 : 0),
    }))
    .filter((item) => item.sentence && !summaryNoisePattern.test(item.sentence));

  const prioritized = scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((item) => item.sentence);
  const fallback = scored.map((item) => item.sentence);
  return unique([...prioritized, ...fallback], (item) => item.toLowerCase()).slice(0, limit);
}

function simpleZhTranslate(sentence = "") {
  const original = truncateSummaryText(sentence, 140);
  if (!original) return "";
  if (/[\u4e00-\u9fa5]/.test(original)) return original;

  let translated = original;
  for (const [pattern, replacement] of chinesePhraseMap) {
    translated = translated.replace(pattern, replacement);
  }
  translated = translated
    .replace(/\b(?:the|a|an|and|to|of|for|with|in|on|as|by|or)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  if ((translated.match(/[\u4e00-\u9fa5]/g) || []).length >= 4) {
    return truncateSummaryText(translated, 140);
  }

  const clauses = [];
  if (/\b(?:lead|manage|own|drive|develop|responsible|support)\b/i.test(original)) clauses.push("负责推进相关职责");
  if (/\b(?:consumer|insight|research|analytics|data)\b/i.test(original)) clauses.push("关注消费者洞察和数据分析");
  if (/\b(?:brand|marketing|campaign|commerce|category|innovation|product)\b/i.test(original)) clauses.push("覆盖品牌、营销或产品相关工作");
  if (/\b(?:experience|years|degree|english|skill|require)\b/i.test(original)) clauses.push("需要相关经验、学历或语言能力");
  return clauses.length ? unique(clauses, (item) => item).join("；") : `简述：${truncateSummaryText(original, 90)}`;
}

function buildSummaryKeywords(text, source, department, experience) {
  const lower = safeLower(text);
  const functionLabels = [
    ["Marketing", targetKeywordGroups.marketing],
    ["Brand Strategy", targetKeywordGroups.branding],
    ["NPD / Innovation", targetKeywordGroups.npd],
    ["O2O / E-commerce", targetKeywordGroups.o2o],
    ["Category / Trade", targetKeywordGroups.category],
    ["Consumer Insights", targetKeywordGroups.insights],
    ["Ingredients / Application", targetKeywordGroups.ingredients || []],
  ]
    .filter(([, keywords]) => keywords.some((keyword) => lower.includes(keyword.toLowerCase())))
    .map(([label]) => label);
  const profileHits = profileKeywords.filter((keyword) => lower.includes(keyword.toLowerCase()));
  return unique(
    [
      department,
      ...functionLabels,
      ...extractSkills(text),
      ...profileHits.slice(0, 6),
      experience?.minYears !== null ? experience?.label : "",
      ...(source.brands || []).slice(0, 3),
    ].filter(Boolean),
    (item) => item.toLowerCase(),
  ).slice(0, 14);
}

function buildJdSummary(job, source, experience) {
  const title = cleanText(job.title || "");
  const department = cleanText(job.department || "");
  const description = cleanJobText(job.description || "");
  const text = `${title} ${department} ${description}`;
  const allSentences = splitSummarySentences(description);
  const sections = extractSummarySections(description);
  const overviewKeywords = ["role", "team", "business", "brand", "market", "consumer", "category", "commerce", "position", "岗位", "职位", "团队", "业务"];
  const responsibilityKeywords = ["lead", "drive", "develop", "manage", "own", "support", "collaborate", "partner", "analyze", "build", "create", "ensure", "负责", "推动", "制定", "管理", "协作", "分析"];
  const requirementKeywords = ["experience", "years", "degree", "bachelor", "master", "english", "skill", "require", "qualification", "preferred", "能力", "经验", "本科", "英语", "要求", "优先"];

  const overviewFallback = `${title} role at ${source.company}, focused on ${department || inferDepartment(text)}.`;
  const overview = pickSummaryBullets(sections.overview || description, allSentences, overviewKeywords).slice(0, 3);
  const responsibilities = pickSummaryBullets(sections.responsibilities || description, allSentences, responsibilityKeywords).slice(0, 3);
  const requirements = pickSummaryBullets(sections.requirements || description, allSentences, requirementKeywords).slice(0, 3);

  const normalizedOverview = overview.length ? overview : [overviewFallback];
  return {
    overview: {
      en: normalizedOverview,
      zh: normalizedOverview.map((item) => simpleZhTranslate(item)).filter(Boolean),
    },
    responsibilities: {
      en: responsibilities,
      zh: responsibilities.map((item) => simpleZhTranslate(item)).filter(Boolean),
    },
    requirements: {
      en: requirements,
      zh: requirements.map((item) => simpleZhTranslate(item)).filter(Boolean),
    },
    keywords: buildSummaryKeywords(text, source, department || inferDepartment(text), experience),
  };
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

function looksLikeJobRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const title = value.title || value.jobTitle || value.name || value.positionTitle;
  if (!title || cleanText(title).length < 4) return false;
  return Boolean(
    value.jobId ||
      value.reqId ||
      value.req_id ||
      value.jobSeqNo ||
      value.requisitionId ||
      value.url ||
      value.jobUrl ||
      value.applyUrl ||
      value.location ||
      value.city ||
      value.cityStateCountry ||
      value.category,
  );
}

function collectJobRecords(value, result = [], seen = new Set()) {
  if (!value) return result;
  if (Array.isArray(value)) {
    value.forEach((item) => collectJobRecords(item, result, seen));
    return result;
  }
  if (typeof value !== "object") return result;
  if (looksLikeJobRecord(value)) {
    const key = value.jobSeqNo || value.jobId || value.reqId || value.req_id || `${value.title}|${value.location || value.city || ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(value);
    }
  }
  for (const next of Object.values(value)) {
    if (next && typeof next === "object") collectJobRecords(next, result, seen);
  }
  return result;
}

function parseJsonObjectAt(text, startIndex) {
  const start = text.indexOf("{", startIndex);
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) return parseMaybeJson(text.slice(start, index + 1));
    }
  }
  return null;
}

function parseAssignedJson(html, assignmentPattern) {
  const match = html.match(assignmentPattern);
  if (!match) return null;
  return parseJsonObjectAt(html, match.index + match[0].length);
}

function extractApplicationJsonJobs(html, source, pageUrl) {
  const jobs = [];
  const scripts = html.matchAll(/<script[^>]+type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const match of scripts) {
    const json = parseMaybeJson(cleanText(match[1]));
    jobs.push(...extractApiJobs(json, source, pageUrl));
  }
  return jobs;
}

function extractPhenomEmbeddedJobs(html, source, pageUrl) {
  if (!/phApp\.ddo|eagerLoadRefineSearch|widgetApiEndpoint/i.test(html)) return [];
  const ddo = parseAssignedJson(html, /phApp\.ddo\s*=\s*/);
  return extractApiJobs(ddo, source, pageUrl).map((job) => ({ ...job, sourceType: "official-embedded" }));
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
      const url = absoluteUrl(posting.url || pageUrl, pageUrl);
      if (
        isInvalidJobTitle(title) ||
        !isFullTimeJob({ title, description, location: locationText, url, employmentType: posting.employmentType }) ||
        hasConflictingLocation(title, locationText, url) ||
        !hasTargetKeyword(text) ||
        !isShanghaiJob(`${title} ${locationText} ${description}`, url)
      ) {
        continue;
      }
      jobs.push({
        title,
        company: source.company,
        industry: source.industry,
        location: locationText || "Shanghai",
        url,
        department: inferDepartment(text),
        description,
        datePosted: cleanText(posting.datePosted || ""),
        employmentType: posting.employmentType,
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
    if (!isFullTimeJob({ title, description: snippet, url })) continue;
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
    if (!isFullTimeJob({ title, description: snippet, url: jobUrl })) continue;
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
    if (!isFullTimeJob({ title, department, location, description: snippet, url })) continue;
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
  if (data.jobSeqNo) {
    const titleSlug = slugifyTitle(data.title || data.jobTitle || data.name || "job");
    const base = careerLocaleBaseUrl(source.careersUrl);
    return absoluteUrl(`job/${data.jobSeqNo}/${titleSlug}`, base);
  }
  if (data.applyUrl && !/\/login(?:[/?#]|$)/i.test(data.applyUrl)) return data.applyUrl;
  if (data.apply_url && !/\/login(?:[/?#]|$)/i.test(data.apply_url)) return data.apply_url;
  const slug = data.slug || data.req_id || data.jobId || data.id;
  if (!slug) return source.careersUrl;
  const language = data.language || "en-us";
  const context = /pepsicojobs\.com\/china/i.test(source.careersUrl) ? "china" : "";
  const path = context ? `/${context}/jobs/${slug}` : `/jobs/${slug}`;
  return absoluteUrl(`${path}?lang=${encodeURIComponent(language)}`, source.careersUrl);
}

function slugifyTitle(title = "") {
  return cleanText(title)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "job";
}

function careerLocaleBaseUrl(url = "") {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const localePrefix = parts.length >= 2 ? `/${parts[0]}/${parts[1]}/` : "/";
    return `${parsed.origin}${localePrefix}`;
  } catch {
    return url;
  }
}

function extractApiJobs(payload, source, pageUrl) {
  const jobs = [];
  const records = collectJobRecords(payload);
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
      data.multi_category,
      data.multi_category_array,
      data.categoryText,
      data.Segment,
      data.segmentName,
      data.type,
    ]
      .flatMap((item) => (Array.isArray(item) ? item : [item]))
      .map((item) => (item && typeof item === "object" ? item.name || item.label || item.value || item.category || "" : item || ""))
      .join(" ");
    const location = compactCleanText(
      data.full_location ||
        data.short_location ||
        data.cityStateCountry ||
        (Array.isArray(data.multi_location) ? data.multi_location.join(" ") : data.multi_location) ||
        [data.city, data.state, data.country].filter(Boolean).join(", ") ||
        data.location ||
        data.location_name ||
        data.address ||
        data.locationLatlong ||
        "",
    );
    const description = cleanJobText(
      [
        data.description,
        data.jobDescription,
        data.descriptionTeaser,
        data.responsibilities,
        data.qualifications,
        data.summary,
        data.ml_job_parser?.descriptionTeaser_ats,
        data.ml_job_parser?.descriptionTeaser_keyword,
        data.ml_job_parser?.descriptionTeaser,
      ]
        .filter(Boolean)
        .join(" "),
    );
    const url = normalizeApiJobUrl(data, source);
    const text = `${title} ${location} ${categoryText} ${description}`;
    const jobType = data.type || data.employmentType || data.workerType || data.workType || data.schedule;
    if (!isFullTimeJob({ title, department: categoryText, location, description, url, employmentType: jobType })) continue;
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
      datePosted: cleanText(data.posted_date || data.datePosted || data.postedDate || data.create_date || data.dateCreated || data.update_date || ""),
      jobId: cleanText(data.req_id || data.reqId || data.jobId || data.job_id || data.jobSeqNo || data.requisitionId || data.id || data.slug || extractJobId(text, url)),
      employmentType: jobType,
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
    ["Application / Ingredients", targetKeywordGroups.ingredients || []],
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
    /(\d{1,2})\s*\+\s*(?:years|yrs|年)/i,
    /(\d{1,2})\s*(?:-\s*(\d{1,2}))?\s*(?:years|yrs)\s+(?:of\s+)?(?:relevant\s+)?experience/i,
    /(?:at\s+least|minimum\s+of|min\.?)\s*(\d{1,2})\s*(?:years|yrs)/i,
    /minimum\s+of\s+(\d{1,2})\s*(?:years|yrs)/i,
    /(\d{1,2})\s*(?:or\s+more|plus)\s*(?:years|yrs)/i,
    /(\d{1,2})\s*(?:年以上|年及以上)/,
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

function freshnessScore(datePosted) {
  const posted = parseDateValue(datePosted);
  if (!posted) return { score: 0, label: "未明确", reason: "未抓到明确发布时间", ageDays: null };
  const ageDays = Math.max(0, Math.floor((Date.now() - posted.getTime()) / 86400000));
  if (ageDays <= 7) return { score: 8, label: "7天内", reason: "近期发布，优先跟进", ageDays };
  if (ageDays <= 30) return { score: 5, label: "30天内", reason: "发布时间较新", ageDays };
  if (ageDays <= 90) return { score: 2, label: "90天内", reason: "岗位仍可尝试", ageDays };
  return { score: -2, label: "90天以上", reason: "发布时间偏久", ageDays };
}

function scoreJob(job, source) {
  const text = `${job.title} ${job.department} ${job.description} ${job.industry} ${(source.brands || []).join(" ")}`;
  const lower = safeLower(text);
  const reasons = [];
  const warnings = [];
  const breakdown = {};
  let score = 0;
  let maxScore = 100;

  if (/上海|shanghai/i.test(`${job.location} ${job.title} ${job.url}`)) {
    breakdown.location = { score: 18, label: "上海", reason: "地点匹配上海" };
  } else {
    breakdown.location = { score: -20, label: "非上海", reason: "未看到明确上海信号" };
    warnings.push("地点未明确匹配上海");
  }
  score += breakdown.location.score;
  reasons.push(breakdown.location.reason);

  if (/美妆|个护|消费健康|食品饮料|咖啡|零售|奢侈|生活方式|运动|科技|互联网|电商|云服务|SaaS|消费电子|原料|香精|香料|配料|营养|特种化学品/.test(source.industry)) {
    breakdown.industry = {
      score: source.priority === "A" ? 14 : 10,
      label: source.industry,
      reason: `${source.industry}赛道相关`,
    };
  } else {
    breakdown.industry = { score: 4, label: source.industry || "未标注", reason: "行业相关性一般" };
  }
  score += breakdown.industry.score;
  reasons.push(breakdown.industry.reason);

  const functionScores = [
    ["Marketing", targetKeywordGroups.marketing, 15],
    ["Branding", targetKeywordGroups.branding, 16],
    ["NPD", targetKeywordGroups.npd, 17],
    ["O2O/E-commerce", targetKeywordGroups.o2o, 16],
    ["Category/Trade", targetKeywordGroups.category, 12],
    ["Insights", targetKeywordGroups.insights, 10],
    ["Ingredients/Application", targetKeywordGroups.ingredients || [], 10],
  ];
  const matchedFunctions = [];
  let directionScore = 0;
  for (const [label, keywords, points] of functionScores) {
    if (keywords.some((keyword) => lower.includes(keyword.toLowerCase()))) {
      directionScore += points;
      matchedFunctions.push(label);
    }
  }
  breakdown.direction = {
    score: Math.min(28, directionScore),
    label: matchedFunctions.join(" / ") || "未命中",
    reason: matchedFunctions.length ? `方向命中 ${matchedFunctions.slice(0, 3).join(" / ")}` : "岗位方向信号较弱",
  };
  score += breakdown.direction.score;
  if (matchedFunctions.length) reasons.push(breakdown.direction.reason);

  if (isNonTargetRole(job)) {
    score -= 45;
    reasons.push("职能偏离");
    warnings.push("职能可能偏离目标方向");
  }

  const skills = extractSkills(text);
  const profileHits = profileKeywords.filter((keyword) => lower.includes(keyword.toLowerCase()));
  breakdown.skills = {
    score: Math.min(22, skills.length * 3 + profileHits.length),
    label: skills.slice(0, 4).join(" / ") || "未明确",
    reason: skills.length ? `技能匹配 ${skills.slice(0, 3).join(" / ")}` : "技能关键词较少",
  };
  score += breakdown.skills.score;
  if (skills.length) reasons.push(breakdown.skills.reason);

  const experience = extractExperience(text);
  if (experience.minYears === null) {
    breakdown.experience = { score: 6, label: experience.label, reason: "经验要求未明确，暂不重扣" };
  } else if (experience.minYears <= 5) {
    breakdown.experience = { score: 16, label: experience.label, reason: "经验要求适合4-5年背景" };
  } else if (experience.minYears <= 7) {
    breakdown.experience = { score: -4, label: experience.label, reason: "经验要求略高于4-5年" };
    warnings.push(`${experience.label} 经验要求略高`);
  } else {
    breakdown.experience = { score: -22, label: experience.label, reason: "经验要求明显高于4-5年" };
    warnings.push(`${experience.label} 经验要求偏高，分数已封顶`);
    maxScore = Math.min(maxScore, 72);
  }
  score += breakdown.experience.score;
  reasons.push(breakdown.experience.reason);

  breakdown.freshness = freshnessScore(job.datePosted);
  score += breakdown.freshness.score;
  reasons.push(breakdown.freshness.reason);

  if (/manager|senior|lead/i.test(job.title) && !/director|head of/i.test(job.title)) {
    score += 4;
    reasons.push("职级可冲");
  }
  if (/director|head of|vp/i.test(job.title)) {
    score -= 12;
    warnings.push("岗位职级偏高");
  }

  const bounded = Math.max(0, Math.min(maxScore, Math.round(score)));
  return {
    score: bounded,
    label: bounded >= 78 ? "高匹配" : bounded >= 62 ? "可重点看" : bounded >= 45 ? "可尝试" : "低匹配",
    reasons: unique(reasons, (item) => item).slice(0, 6),
    warnings: unique(warnings, (item) => item).slice(0, 4),
    breakdown,
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
  const datePosted = job.datePosted || extractDate(description) || "";
  const normalizedJob = { ...job, title, description, department, location, url, datePosted };
  const match = scoreJob(normalizedJob, source);
  const jdSummary = buildJdSummary(normalizedJob, source, match.experience);
  const id = hashJob([source.id, jobId, title, location, url]);
  return {
    id,
    jobId,
    title,
    company: source.company,
    originCountry: source.originCountry,
    originRegion: source.originRegion,
    logoUrl: source.logoUrl || "",
    logoCandidates: source.logoCandidates || [],
    logoDomain: source.logoDomain || "",
    industry: source.industry,
    brands: source.brands,
    location,
    department,
    url,
    careersUrl: source.careersUrl,
    sourceUrl: job.sourceUrl,
    sourceType: job.sourceType,
    datePosted,
    description,
    jdSummary,
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

async function postJson(url, payload, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        accept: "application/json,text/plain,*/*",
        "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
        "content-type": "application/json",
        "user-agent":
          "Mozilla/5.0 (compatible; CiciJobRadar/1.0; +https://vercel.app; official-careers-monitor)",
      },
      body: JSON.stringify(payload),
    });
    const text = await response.text();
    return { ok: response.ok, status: response.status, finalUrl: response.url || url, json: parseMaybeJson(text), text };
  } finally {
    clearTimeout(timer);
  }
}

function isMarsSource(source) {
  return source?.id === "mars" || /mars|玛氏/i.test(`${source?.company || ""} ${source?.careersUrl || ""}`);
}

function isUnsupportedSocialSourceUrl(url = "") {
  return /(?:mp\.weixin\.qq\.com|weixin|wechat|weibo\.com|xiaohongshu|instagram\.com|facebook\.com|linkedin\.com|twitter\.com|x\.com)/i.test(
    String(url),
  );
}

function marsUrlCandidates(source) {
  if (!isMarsSource(source)) return [];
  return [
    "https://careers.mars.com/cn/zh/search-results?keywords=marketing&location=Shanghai",
    "https://careers.mars.com/cn/zh/search-results?keywords=brand&location=Shanghai",
    "https://careers.mars.com/cn/zh/search-results?keywords=category&location=Shanghai",
    "https://careers.mars.com/cn/zh/search-results?keywords=e-commerce&location=Shanghai",
    "https://careers.mars.com/cn/zh/search-results?keywords=%E5%B8%82%E5%9C%BA&location=%E4%B8%8A%E6%B5%B7",
    "https://careers.mars.com/cn/zh/c/%E5%B8%82%E5%9C%BA%E8%90%A5%E9%94%80%E9%83%A8-jobs",
    "https://careers.mars.com/global/en/search-results?keywords=marketing&location=Shanghai",
    "https://careers.mars.com/global/en/c/marketing-jobs",
  ];
}

function getSourceUrlCandidates(source, options = {}) {
  const configured = source.apiUrls?.length ? source.apiUrls : [...(source.searchUrls || []), source.careersUrl];
  const officialUrls = [...configured, ...marsUrlCandidates(source)].filter((url) => url && !isUnsupportedSocialSourceUrl(url));
  const limit = isMarsSource(source) ? Math.max(options.urlsPerSource || 8, 12) : options.urlsPerSource || 8;
  return unique(officialUrls, (item) => item).slice(0, limit);
}

function sourceMeta(source) {
  const meta = {};
  if (source.wechatOfficialAccount) meta.wechatOfficialAccount = source.wechatOfficialAccount;
  if (source.socialSources) meta.socialSources = source.socialSources;
  return meta;
}

function errorLabel(error, fallback = "Error") {
  if (!error) return fallback;
  return error.message || error.name || String(error);
}

function extractPhenomConfig(html, pageUrl, source) {
  const readString = (key) => {
    const match = html.match(new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`, "i"));
    return match ? cleanText(match[1]) : "";
  };
  const endpoint = readString("widgetApiEndpoint");
  if (!endpoint) return null;
  let urlCountry = "";
  let urlLocale = "";
  try {
    const parts = new URL(pageUrl).pathname.split("/").filter(Boolean);
    urlCountry = parts[0] || "";
    urlLocale = parts[0] === "cn" && parts[1] === "zh" ? "zh_cn" : "";
  } catch {
    // Keep config defaults when URL parsing fails.
  }
  return {
    endpoint,
    country: readString("country") || urlCountry || "global",
    locale: readString("locale") || urlLocale || "en_global",
    deviceType: readString("deviceType") || "desktop",
    pageName: readString("pageName") || "search-results",
    siteType: readString("siteType") || "external",
    pageId: readString("pageId") || "page1",
    refNum: readString("refNum") || (isMarsSource(source) ? "MARSGLOBAL" : ""),
  };
}

function phenomSearchPayload(config, pageUrl) {
  let params = new URLSearchParams();
  try {
    params = new URL(pageUrl).searchParams;
  } catch {
    params = new URLSearchParams();
  }
  const keywords =
    params.get("keywords") ||
    params.get("keyword") ||
    params.get("q") ||
    params.get("search") ||
    (/marketing-jobs|%E5%B8%82%E5%9C%BA/i.test(pageUrl) ? "marketing" : "");
  const location = params.get("location") || params.get("locationsearch") || "Shanghai";
  return {
    country: config.country,
    locale: config.locale,
    lang: config.locale,
    deviceType: config.deviceType,
    pageName: config.pageName,
    siteType: config.siteType,
    ddoKey: "refineSearch",
    sortBy: "",
    subsearch: "",
    from: 0,
    jobs: true,
    counts: true,
    all_fields: ["category", "country", "city", "segmentName", "remote"],
    size: 10,
    clearAll: false,
    jdsource: "facets",
    isSliderEnable: false,
    pageId: config.pageId,
    refNum: config.refNum,
    keywords,
    location,
  };
}

async function fetchPhenomApiJobs(source, pageUrl, html, options = {}, seen = new Set()) {
  if (!isMarsSource(source) && !/widgetApiEndpoint/i.test(html)) return [];
  const config = extractPhenomConfig(html, pageUrl, source);
  if (!config?.endpoint || !config.refNum) return [];
  const payload = phenomSearchPayload(config, pageUrl);
  const key = `${config.endpoint}|${payload.refNum}|${payload.locale}|${payload.keywords}|${payload.location}`;
  if (seen.has(key)) return [];
  seen.add(key);

  const response = await postJson(config.endpoint, payload, options.timeoutMs || DEFAULT_TIMEOUT_MS);
  if (!response.ok) throw new Error(`Phenom API ${response.status}`);
  return extractApiJobs(response.json, source, pageUrl);
}

async function scanSource(source, options = {}) {
  const urls = getSourceUrlCandidates(source, options);
  const jobs = [];
  const errors = [];
  const phenomApiSeen = new Set();

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
        const isPhenomHtml = /phApp\.ddo|widgetApiEndpoint/i.test(html);
        jobs.push(...extractJsonLdJobs(html, source, pageUrl));
        jobs.push(...extractApplicationJsonJobs(html, source, pageUrl));
        jobs.push(...extractPhenomEmbeddedJobs(html, source, pageUrl));
        jobs.push(...extractStructuredListJobs(html, source, pageUrl));
        if (!isPhenomHtml) jobs.push(...extractEmbeddedJsonJobs(html, source, pageUrl));
        jobs.push(...extractAnchorJobs(html, source, pageUrl));
        try {
          jobs.push(...(await fetchPhenomApiJobs(source, pageUrl, html, options, phenomApiSeen)));
        } catch (error) {
          errors.push(`${errorLabel(error, "Phenom API error")} ${pageUrl}`);
        }
      }
    } catch (error) {
      errors.push(`${errorLabel(error)} ${url}`);
    }
  }

  const normalized = unique(
    jobs.filter((job) => isFullTimeJob(job)).map((job) => normalizeJob(job, source)),
    (job) => (job.jobId ? `${job.company}|${job.jobId}` : job.url && job.url !== source.careersUrl ? job.url : `${job.company}|${job.title}|${job.location}`),
  )
    .filter((job) => !isInvalidJobTitle(job.title) && isShanghaiJob(`${job.title} ${job.location}`, job.url))
    .filter((job) => isFullTimeJob(job))
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
    ...sourceMeta(source),
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

function filterSources({ sourceLimit, priority, company, originRegion, industry } = {}) {
  let sources = careerSources.slice();
  if (priority && priority !== "all") {
    sources = sources.filter((source) => source.priority === priority);
  }
  if (industry && industry !== "all") {
    sources = sources.filter((source) => source.industry.includes(industry));
  }
  if (company) {
    const sourceText = (source) => `${source.id} ${source.company} ${source.brands.join(" ")} ${source.originCountry} ${source.originRegion}`;
    const exactMatches = sources.filter((source) => matchesSearchQuery(sourceText(source), company));
    sources = exactMatches.length ? exactMatches : sources.filter((source) => matchesAnySearchToken(sourceText(source), company));
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
  let result = jobs.filter((job) => isFullTimeJob(job));
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
    (job) => (job.jobId ? `${job.company}|${job.jobId}` : job.url && !job.url.endsWith(job.careersUrl) ? job.url : `${job.company}|${job.title}|${job.location}`),
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
      filters: {
        query: options.query || "",
        company: options.company || "",
        industry: options.industry || "all",
        function: options.function || "all",
        originRegion: options.originRegion || "all",
        postedWithin: options.postedWithin || "all",
        minScore: options.minScore || 35,
      },
      companySourceMatches: options.company ? sources.map((source) => source.company) : [],
      totalSourceCount: careerSources.length,
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
        ...sourceMeta(result),
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
