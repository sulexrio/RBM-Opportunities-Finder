// Fetches live job postings from EURES — the official EU/EEA job mobility
// portal. This is a real, free, public API (no key needed) that covers:
// Germany, France, Luxembourg, Finland, Switzerland, Sweden, Iceland,
// Austria, Netherlands, Portugal, Italy, Poland, Lithuania, Spain, Norway.
//
// Endpoint confirmed from EURES' own public search-engine API.

import fs from "fs";

const EURES_ENDPOINT =
  "https://europa.eu/eures/api/jv-searchengine/public/jv-search/search";

// All EURES-participating countries (EU27 + EEA/associated states).
// This replaces the original 15-country priority list with full coverage.
const COUNTRIES = [
  "at", "be", "bg", "hr", "cy", "cz", "dk", "ee", "fi", "fr",
  "de", "gr", "hu", "is", "ie", "it", "lv", "li", "lt", "lu",
  "mt", "nl", "no", "pl", "pt", "ro", "sk", "si", "es", "se", "ch",
];

// Keywords capturing your criteria: remote work, sponsorship, relocation.
const KEYWORDS = [
  "remote",
  "relocation",
  "visa sponsorship",
  "accommodation provided",
];

async function searchEures(locationCode, keyword, page = 1) {
  const body = {
    resultsPerPage: 50,
    page,
    sortSearch: "MOST_RECENT",
    keywords: [{ keyword, specificSearchCode: "EVERYWHERE" }],
    occupationUris: [],
    skillUris: [],
    requiredExperienceCodes: [],
    positionScheduleCodes: [],
    sectorCodes: [],
    educationAndQualificationLevelCodes: [],
    positionOfferingCodes: [],
    locationCodes: [locationCode],
    euresFlagCodes: [],
    otherBenefitsCodes: [],
    requiredLanguages: [],
    minNumberPost: null,
    publicationPeriod: null,
    sessionId: `opportunity-finder-${Date.now()}`,
    requestLanguage: "en",
  };

  const res = await fetch(EURES_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    console.error(`EURES ${locationCode}/${keyword} failed: ${res.status}`);
    return [];
  }

  const data = await res.json();
  const jobs = data?.jvs || data?.content || [];

  return jobs.map((jv) => ({
    id: `eures-${jv.id || jv.jvId}`,
    source: "EURES",
    country: locationCode.toUpperCase(),
    title: jv.title || jv.positionTitle || "Untitled role",
    employer: jv.employerName || jv.employer?.name || "Unknown employer",
    url: jv.url || `https://europa.eu/eures/portal/jv-se/jv-details/${jv.id}`,
    postedDate: jv.publicationDate || jv.lastModificationDate || null,
    description: jv.description || "",
    matchedKeyword: keyword,
    language: jv.requestLanguage || "en",
  }));
}

async function main() {
  const allJobs = [];

  for (const country of COUNTRIES) {
    for (const keyword of KEYWORDS) {
      try {
        const jobs = await searchEures(country, keyword);
        allJobs.push(...jobs);
        // Be a polite citizen of a free public service.
        await new Promise((r) => setTimeout(r, 500));
      } catch (err) {
        console.error(`Error fetching ${country}/${keyword}:`, err.message);
      }
    }
  }

  fs.mkdirSync("data/raw", { recursive: true });
  fs.writeFileSync(
    "data/raw/eures.json",
    JSON.stringify(allJobs, null, 2)
  );
  console.log(`EURES: wrote ${allJobs.length} postings`);
}

main();
