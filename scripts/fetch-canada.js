// Job Bank Canada (jobbank.gc.ca) does NOT offer a fully open self-serve
// API — they offer a free XML feed to job boards, but only after you apply
// through https://www.jobbank.gc.ca/network and get approved. That's the
// reliable path; consider applying, it's free.
//
// Until then, this script does a light, respectful read of Job Bank's
// public search results pages (their robots.txt allows crawling
// /jobsearch/ paths). It's fragile by nature — Job Bank can change their
// HTML at any time — so it's wrapped defensively and never breaks the rest
// of the pipeline if it fails.

import fs from "fs";

const SEARCH_KEYWORDS = ["remote", "sponsorship", "relocation"];
const BASE_URL = "https://www.jobbank.gc.ca/jobsearch/jobsearch";

function extractJobsFromHtml(html) {
  // Job Bank renders each result as an <article> with a data-jobid attribute.
  // This regex-based extraction is intentionally minimal — swap in a real
  // HTML parser (e.g. cheerio) once you've applied for the XML feed and
  // want to keep this as a backup source.
  const jobs = [];
  const articleRegex = /<article[^>]*data-jobid="([^"]+)"[^>]*>([\s\S]*?)<\/article>/g;
  let match;
  while ((match = articleRegex.exec(html)) !== null) {
    const [, jobId, block] = match;
    const titleMatch = block.match(/<span class="noctitle">([^<]+)</);
    const employerMatch = block.match(/<li class="business">([^<]+)</);
    const locationMatch = block.match(/<li class="location">([^<]+)</);

    jobs.push({
      id: `jobbank-${jobId}`,
      source: "Job Bank Canada",
      country: "CA",
      title: titleMatch?.[1]?.trim() || "Untitled role",
      employer: employerMatch?.[1]?.trim() || "Unknown employer",
      location: locationMatch?.[1]?.trim() || "",
      url: `https://www.jobbank.gc.ca/jobsearch/jobposting/${jobId}`,
      postedDate: null,
      description: "",
    });
  }
  return jobs;
}

async function main() {
  const allJobs = [];

  for (const keyword of SEARCH_KEYWORDS) {
    try {
      const url = `${BASE_URL}?searchstring=${encodeURIComponent(keyword)}&sort=D`;
      const res = await fetch(url, {
        headers: { "User-Agent": "OpportunityFinder-Personal/1.0" },
      });
      if (!res.ok) {
        console.warn(`Job Bank search "${keyword}" returned ${res.status}`);
        continue;
      }
      const html = await res.text();
      allJobs.push(...extractJobsFromHtml(html));
      await new Promise((r) => setTimeout(r, 1000)); // be polite
    } catch (err) {
      console.warn(`Job Bank search "${keyword}" failed:`, err.message);
    }
  }

  fs.mkdirSync("data/raw", { recursive: true });
  fs.writeFileSync("data/raw/canada.json", JSON.stringify(allJobs, null, 2));
  console.log(`Job Bank Canada: wrote ${allJobs.length} postings (best-effort)`);
}

main().catch((err) => {
  console.warn("Canada fetch failed entirely — continuing pipeline:", err.message);
  fs.mkdirSync("data/raw", { recursive: true });
  fs.writeFileSync("data/raw/canada.json", "[]");
});
