// Fetches directly from company applicant-tracking-system job boards —
// Greenhouse, Lever, and Ashby all expose free, public, no-key-required
// JSON feeds of a company's open roles. This is a different (and often
// higher-quality) source than the aggregators: it's the company's own
// listing, not a re-indexed copy, and many of these companies are
// remote-first / actively sponsor visas.
//
// The company list lives in data/company-boards.json so you can add more
// companies over time without touching this script. If a company slug is
// wrong or a board is empty, it's skipped and logged — never fatal.

import fs from "fs";

async function fetchGreenhouse(slug) {
  try {
    const res = await fetch(
      `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.jobs || []).map((j) => ({
      id: `greenhouse-${slug}-${j.id}`,
      source: `${slug} (Greenhouse)`,
      country: j.location?.name || "unknown",
      title: j.title,
      employer: slug,
      url: j.absolute_url,
      postedDate: j.updated_at || null,
      description: (j.content || "").replace(/<[^>]+>/g, " "),
      language: "en",
    }));
  } catch (err) {
    console.warn(`Greenhouse "${slug}" failed:`, err.message);
    return [];
  }
}

async function fetchLever(slug) {
  try {
    const res = await fetch(`https://api.lever.co/v0/postings/${slug}?mode=json`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data || []).map((j) => ({
      id: `lever-${slug}-${j.id}`,
      source: `${slug} (Lever)`,
      country: j.categories?.location || "unknown",
      title: j.text,
      employer: slug,
      url: j.hostedUrl,
      postedDate: j.createdAt ? new Date(j.createdAt).toISOString() : null,
      description: (j.descriptionPlain || j.description || "").replace(/<[^>]+>/g, " "),
      language: "en",
    }));
  } catch (err) {
    console.warn(`Lever "${slug}" failed:`, err.message);
    return [];
  }
}

async function fetchAshby(slug) {
  try {
    const res = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${slug}`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.jobs || []).map((j) => ({
      id: `ashby-${slug}-${j.id}`,
      source: `${slug} (Ashby)`,
      country: j.location || "unknown",
      title: j.title,
      employer: slug,
      url: j.jobUrl || j.applyUrl,
      postedDate: j.publishedAt || null,
      description: (j.descriptionPlain || "").replace(/<[^>]+>/g, " "),
      language: "en",
    }));
  } catch (err) {
    console.warn(`Ashby "${slug}" failed:`, err.message);
    return [];
  }
}

async function main() {
  let companies = [];
  try {
    companies = JSON.parse(fs.readFileSync("data/company-boards.json", "utf-8")).companies || [];
  } catch (err) {
    console.warn("Could not read data/company-boards.json:", err.message);
  }

  const allJobs = [];
  for (const company of companies) {
    let jobs = [];
    if (company.platform === "greenhouse") jobs = await fetchGreenhouse(company.slug);
    else if (company.platform === "lever") jobs = await fetchLever(company.slug);
    else if (company.platform === "ashby") jobs = await fetchAshby(company.slug);
    allJobs.push(...jobs);
    await new Promise((r) => setTimeout(r, 300));
  }

  fs.mkdirSync("data/raw", { recursive: true });
  fs.writeFileSync("data/raw/company-boards.json", JSON.stringify(allJobs, null, 2));
  console.log(`Company boards: ${allJobs.length} postings across ${companies.length} companies`);
}

main().catch((err) => {
  console.warn("Company boards fetch failed entirely — continuing pipeline:", err.message);
  fs.mkdirSync("data/raw", { recursive: true });
  fs.writeFileSync("data/raw/company-boards.json", "[]");
});
