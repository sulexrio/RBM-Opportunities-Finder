// Jooble aggregates postings from thousands of local job boards, recruiters,
// and company career pages across ~70 countries — this is the direct answer
// to "local/individual country job boards, all fit together." Free API key,
// no cost, just a signup at https://jooble.org/api/about.
//
// The key is read from an environment variable so it's never hardcoded or
// committed to the repo — GitHub Actions injects it as a secret at run time.

import fs from "fs";

const API_KEY = process.env.JOOBLE_API_KEY;

// One search per keyword covers the whole world for that keyword — Jooble
// doesn't require a country per request the way EURES does.
const SEARCHES = [
  { keywords: "remote visa sponsorship" },
  { keywords: "relocation package accommodation" },
  { keywords: "international recruitment outsourcing" },
];

async function searchJooble(keywords) {
  const res = await fetch(`https://jooble.org/api/${API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keywords, page: 1 }),
  });
  if (!res.ok) {
    console.warn(`Jooble search "${keywords}" failed: ${res.status}`);
    return [];
  }
  const data = await res.json();
  return (data.jobs || []).map((j, i) => ({
    id: `jooble-${Buffer.from(j.link || `${keywords}-${i}`).toString("base64").slice(0, 24)}`,
    source: "Jooble",
    country: j.location || "unknown",
    title: j.title,
    employer: j.company || "Unknown employer",
    url: j.link,
    postedDate: j.updated || null,
    description: j.snippet || "",
    language: "en",
  }));
}

async function main() {
  if (!API_KEY) {
    console.warn("JOOBLE_API_KEY not set — skipping Jooble, pipeline continues without it.");
    fs.mkdirSync("data/raw", { recursive: true });
    fs.writeFileSync("data/raw/jooble.json", "[]");
    return;
  }

  const allJobs = [];
  for (const { keywords } of SEARCHES) {
    try {
      allJobs.push(...(await searchJooble(keywords)));
      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      console.warn(`Jooble "${keywords}" error:`, err.message);
    }
  }

  fs.mkdirSync("data/raw", { recursive: true });
  fs.writeFileSync("data/raw/jooble.json", JSON.stringify(allJobs, null, 2));
  console.log(`Jooble: wrote ${allJobs.length} postings`);
}

main();
