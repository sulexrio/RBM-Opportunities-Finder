// Careerjet aggregates local job boards and recruiting/outsourcing agencies
// on a per-country basis — strong coverage in MENA, Asia, and Africa
// specifically, which is the gap this is meant to fill. Free affiliate ID
// at https://www.careerjet.com/partners/affiliation/ — no cost.
//
// Careerjet's API asks for a locale-specific domain (e.g. careerjet.com for
// global/US, careerjet.co.za for South Africa) rather than one global
// endpoint — we loop over the locales that matter most for your goal.

import fs from "fs";

const AFFID = process.env.CAREERJET_AFFID;

// domain, country label
const LOCALES = [
  { domain: "www.careerjet.com", country: "US" },
  { domain: "www.careerjet.co.uk", country: "GB" },
  { domain: "www.careerjet.co.za", country: "ZA" },
  { domain: "www.careerjet.com.eg", country: "EG" },
  { domain: "www.careerjet.ae", country: "AE" },
  { domain: "www.careerjet.sa", country: "SA" },
  { domain: "www.careerjet.com.sg", country: "SG" },
  { domain: "www.careerjet.in", country: "IN" },
];

const KEYWORDS = "remote visa sponsorship relocation";

async function searchCareerjet({ domain, country }) {
  const url = `https://${domain}/api/search?keywords=${encodeURIComponent(KEYWORDS)}&location=&affid=${AFFID}&user_ip=203.0.113.1&user_agent=OpportunityFinder-Personal/1.0&url=https://example.com&pagesize=50`;
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`Careerjet ${country} failed: ${res.status}`);
    return [];
  }
  const data = await res.json();
  return (data.jobs || []).map((j, i) => ({
    id: `careerjet-${country}-${i}-${Buffer.from(j.url || "").toString("base64").slice(0, 16)}`,
    source: "Careerjet",
    country,
    title: j.title,
    employer: j.company || "Unknown employer",
    url: j.url,
    postedDate: j.date || null,
    description: j.description || "",
    language: "en",
  }));
}

async function main() {
  if (!AFFID) {
    console.warn("CAREERJET_AFFID not set — skipping Careerjet, pipeline continues without it.");
    fs.mkdirSync("data/raw", { recursive: true });
    fs.writeFileSync("data/raw/careerjet.json", "[]");
    return;
  }

  const allJobs = [];
  for (const locale of LOCALES) {
    try {
      allJobs.push(...(await searchCareerjet(locale)));
      await new Promise((r) => setTimeout(r, 400));
    } catch (err) {
      console.warn(`Careerjet ${locale.country} error:`, err.message);
    }
  }

  fs.mkdirSync("data/raw", { recursive: true });
  fs.writeFileSync("data/raw/careerjet.json", JSON.stringify(allJobs, null, 2));
  console.log(`Careerjet: wrote ${allJobs.length} postings`);
}

main();
