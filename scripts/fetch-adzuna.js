// Adzuna aggregates postings across many countries, with strong coverage of
// recruiter and outsourcing-agency listings (not just direct employers).
// Free API key at https://developer.adzuna.com/ — sign up, get an app_id
// and app_key, no cost.
//
// Adzuna requires a country code per request (their API is organized that
// way), so we loop over a broad set — including several of your original
// priority countries plus South Africa, which Adzuna covers well.

import fs from "fs";

const APP_ID = process.env.ADZUNA_APP_ID;
const APP_KEY = process.env.ADZUNA_APP_KEY;

// Adzuna country codes they support (subset relevant to your list).
const COUNTRIES = ["us", "gb", "ca", "de", "fr", "au", "nz", "sg", "za", "at", "nl", "pl", "it"];
const KEYWORDS = "remote OR visa sponsorship OR relocation";

async function searchAdzuna(country) {
  const url = `https://api.adzuna.com/v1/api/jobs/${country}/search/1?app_id=${APP_ID}&app_key=${APP_KEY}&results_per_page=50&what=${encodeURIComponent(KEYWORDS)}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`Adzuna ${country} failed: ${res.status}`);
    return [];
  }
  const data = await res.json();
  return (data.results || []).map((j) => ({
    id: `adzuna-${j.id}`,
    source: "Adzuna",
    country: country.toUpperCase(),
    title: j.title,
    employer: j.company?.display_name || "Unknown employer",
    url: j.redirect_url,
    postedDate: j.created || null,
    description: j.description || "",
    language: "en",
  }));
}

async function main() {
  if (!APP_ID || !APP_KEY) {
    console.warn("ADZUNA_APP_ID/ADZUNA_APP_KEY not set — skipping Adzuna, pipeline continues without it.");
    fs.mkdirSync("data/raw", { recursive: true });
    fs.writeFileSync("data/raw/adzuna.json", "[]");
    return;
  }

  const allJobs = [];
  for (const country of COUNTRIES) {
    try {
      allJobs.push(...(await searchAdzuna(country)));
      await new Promise((r) => setTimeout(r, 400));
    } catch (err) {
      console.warn(`Adzuna ${country} error:`, err.message);
    }
  }

  fs.mkdirSync("data/raw", { recursive: true });
  fs.writeFileSync("data/raw/adzuna.json", JSON.stringify(allJobs, null, 2));
  console.log(`Adzuna: wrote ${allJobs.length} postings`);
}

main();
