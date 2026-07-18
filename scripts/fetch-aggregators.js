// Fetches from three global job aggregators that each pull from thousands
// of LOCAL job boards, recruiters, and international outsourcing agencies
// per country — this is the direct answer to "local boards + recruiting +
// outsourcing, all countries, don't want anything overlooked."
//
// All three are free but require a free API key/ID (one-time signup, no
// payment). Add them as GitHub repo secrets — Settings → Secrets and
// variables → Actions → New repository secret:
//   JOOBLE_API_KEY     from jooble.org/api/about
//   CAREERJET_AFFID    from careerjet.com/partners (affiliate ID)
//   ADZUNA_APP_ID / ADZUNA_APP_KEY   from developer.adzuna.com
//
// If a key is missing, that source is skipped (logged, not fatal) — the
// rest of the pipeline keeps working either way.

import fs from "fs";

const JOOBLE_KEY = process.env.JOOBLE_API_KEY;
const CAREERJET_AFFID = process.env.CAREERJET_AFFID;
const ADZUNA_APP_ID = process.env.ADZUNA_APP_ID;
const ADZUNA_APP_KEY = process.env.ADZUNA_APP_KEY;

const KEYWORDS = ["remote", "visa sponsorship", "relocation", "sponsorship"];

// Adzuna supports per-country endpoints — these are the ones with
// meaningful English-language coverage from your list.
const ADZUNA_COUNTRIES = ["us", "gb", "ca", "au", "nz", "za", "sg"];

async function fetchJooble() {
  if (!JOOBLE_KEY) {
    console.warn("JOOBLE_API_KEY not set — skipping Jooble (add it as a repo secret)");
    return [];
  }
  const allJobs = [];
  for (const keyword of KEYWORDS) {
    try {
      const res = await fetch(`https://jooble.org/api/${JOOBLE_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywords: keyword }),
      });
      if (!res.ok) continue;
      const data = await res.json();
      (data.jobs || []).forEach((j) =>
        allJobs.push({
          id: `jooble-${j.id || Buffer.from(j.link || j.title).toString("base64").slice(0, 16)}`,
          source: "Jooble",
          country: j.location || "unknown",
          title: j.title,
          employer: j.company || "Unknown employer",
          url: j.link,
          postedDate: j.updated || null,
          description: j.snippet || "",
          language: "auto",
        })
      );
      await new Promise((r) => setTimeout(r, 400));
    } catch (err) {
      console.warn(`Jooble "${keyword}" failed:`, err.message);
    }
  }
  return allJobs;
}

async function fetchCareerjet() {
  if (!CAREERJET_AFFID) {
    console.warn("CAREERJET_AFFID not set — skipping Careerjet (add it as a repo secret)");
    return [];
  }
  const allJobs = [];
  for (const keyword of KEYWORDS) {
    try {
      const url = `http://public-api.careerjet.net/search?keywords=${encodeURIComponent(
        keyword
      )}&affid=${CAREERJET_AFFID}&user_ip=1.1.1.1&user_agent=OpportunityFinder&pagesize=50`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      (data.jobs || []).forEach((j) =>
        allJobs.push({
          id: `careerjet-${Buffer.from(j.url).toString("base64").slice(0, 16)}`,
          source: "Careerjet",
          country: j.locations || "unknown",
          title: j.title,
          employer: j.company || "Unknown employer",
          url: j.url,
          postedDate: j.date || null,
          description: j.description || "",
          language: "auto",
        })
      );
      await new Promise((r) => setTimeout(r, 400));
    } catch (err) {
      console.warn(`Careerjet "${keyword}" failed:`, err.message);
    }
  }
  return allJobs;
}

async function fetchAdzuna() {
  if (!ADZUNA_APP_ID || !ADZUNA_APP_KEY) {
    console.warn("ADZUNA_APP_ID/KEY not set — skipping Adzuna (add them as repo secrets)");
    return [];
  }
  const allJobs = [];
  for (const country of ADZUNA_COUNTRIES) {
    for (const keyword of KEYWORDS) {
      try {
        const url = `https://api.adzuna.com/v1/api/jobs/${country}/search/1?app_id=${ADZUNA_APP_ID}&app_key=${ADZUNA_APP_KEY}&results_per_page=50&what=${encodeURIComponent(
          keyword
        )}`;
        const res = await fetch(url);
        if (!res.ok) continue;
        const data = await res.json();
        (data.results || []).forEach((j) =>
          allJobs.push({
            id: `adzuna-${j.id}`,
            source: "Adzuna",
            country: country.toUpperCase(),
            title: j.title,
            employer: j.company?.display_name || "Unknown employer",
            url: j.redirect_url,
            postedDate: j.created || null,
            description: j.description || "",
            language: "en",
          })
        );
        await new Promise((r) => setTimeout(r, 400));
      } catch (err) {
        console.warn(`Adzuna ${country}/"${keyword}" failed:`, err.message);
      }
    }
  }
  return allJobs;
}

async function main() {
  const [jooble, careerjet, adzuna] = await Promise.all([
    fetchJooble(),
    fetchCareerjet(),
    fetchAdzuna(),
  ]);

  const allJobs = [...jooble, ...careerjet, ...adzuna];

  fs.mkdirSync("data/raw", { recursive: true });
  fs.writeFileSync("data/raw/aggregators.json", JSON.stringify(allJobs, null, 2));
  console.log(
    `Aggregators: ${allJobs.length} postings (Jooble ${jooble.length}, Careerjet ${careerjet.length}, Adzuna ${adzuna.length})`
  );
}

main().catch((err) => {
  console.warn("Aggregator fetch failed entirely — continuing pipeline:", err.message);
  fs.mkdirSync("data/raw", { recursive: true });
  fs.writeFileSync("data/raw/aggregators.json", "[]");
});
