// Merges every raw source into one data/jobs.json — the single file the
// PWA reads. This is the "alignment" step: everything upstream feeds in
// here, everything downstream (the app) reads only from here.

import fs from "fs";

const SCAM_SIGNAL_PATTERNS = [
  /pay.{0,20}(visa|processing) fee/i,
  /send.{0,20}(money|payment).{0,20}(visa|ticket|processing)/i,
  /western union/i,
  /registration fee required/i,
];

function loadJson(path, fallback = []) {
  try {
    return JSON.parse(fs.readFileSync(path, "utf-8"));
  } catch {
    return fallback;
  }
}

function flagScamRisk(job) {
  const text = `${job.title} ${job.description}`.toLowerCase();
  return SCAM_SIGNAL_PATTERNS.some((pattern) => pattern.test(text));
}

function verifyUkSponsor(job, ukSponsors) {
  if (job.country !== "GB" && job.country !== "UK") return null;
  const name = job.employer?.toLowerCase().trim();
  if (!name) return null;
  return Boolean(ukSponsors[name]);
}

function dedupe(jobs) {
  const seen = new Set();
  return jobs.filter((job) => {
    const key = `${job.employer}::${job.title}::${job.country}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function main() {
  const eures = loadJson("data/raw/eures.json");
  const canada = loadJson("data/raw/canada.json");
  const ukSponsors = loadJson("data/raw/uk-sponsors.json", {});

  let allJobs = [...eures, ...canada];

  allJobs = allJobs.map((job) => ({
    ...job,
    scamRisk: flagScamRisk(job),
    sponsorVerified: verifyUkSponsor(job, ukSponsors),
    fetchedAt: new Date().toISOString(),
  }));

  allJobs = dedupe(allJobs);

  // Sort newest first where we have a date.
  allJobs.sort((a, b) => {
    if (!a.postedDate) return 1;
    if (!b.postedDate) return -1;
    return new Date(b.postedDate) - new Date(a.postedDate);
  });

  const manualSources = loadJson("data/manual-sources.json", { sources: [] });

  const output = {
    generatedAt: new Date().toISOString(),
    totalJobs: allJobs.length,
    jobs: allJobs,
    manualSources: manualSources.sources || [],
  };

  fs.writeFileSync("data/jobs.json", JSON.stringify(output, null, 2));
  // Also drop a copy where the PWA can fetch it directly.
  fs.mkdirSync("public/data", { recursive: true });
  fs.writeFileSync("public/data/jobs.json", JSON.stringify(output, null, 2));

  console.log(
    `Merged ${allJobs.length} jobs (${allJobs.filter((j) => j.scamRisk).length} flagged scam-risk)`
  );
}

main();
