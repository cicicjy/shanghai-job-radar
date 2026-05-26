const { careerSources } = require("../lib/sources");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "public, max-age=300");
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  const sources = careerSources.map((source) => ({
    id: source.id,
    company: source.company,
    label: source.company,
    industry: source.industry,
    originCountry: source.originCountry,
    originRegion: source.originRegion,
    priority: source.priority,
    brands: source.brands || [],
    careersUrl: source.careersUrl,
  }));

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify({ sources }));
};
