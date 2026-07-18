// Fetches genuinely global, remote-first jobs — not tied to any single
// country's labor/visa law the way EURES listings are. This is the direct
// fix for "I can't apply, citizens only": these boards list roles companies
// are actively willing to hire internationally for, and several explicitly
// tag visa/sponsorship status.
//
// Three free, public, no-key-required sources:
//   - Remotive   (remotive.com/api/remote-jobs)
//   - RemoteOK   (remoteok.com/api)
//   - Arbeitnow  (arbeitnow.com/api/job-board-api)

import fs from "fs";

async function fetchRemotive() {
  try {
    const res = await fetch("https://remotive.com/api/remote-jobs");
    if (!res.ok) return [];
    const data = await res.json();
    return (data.jobs || []).map((j) => ({
      id: `remotive-${j.id}`,
      source: "Remotive",
      country: "REMOTE",
      title: j.title,
      employer: j.company_name,
      url: j.url,
      postedDate: j.publication_date,
      description: j.description || "",
      language: "en",
    }));
  } catch (err) {
    console.warn("Remotive fetch failed:", err.message);
    return [];
  }
}

async function fetchRemoteOK() {
  try {
    const res = await fetch("https://remoteok.com/api", {
      headers: { "User-Agent": "OpportunityFinder-Personal/1.0" },
    });
    if (!res.ok) return [];
    const data = await res.json();
    // First element is usually a legend/metadata object, not a job — skip it.
    return data
      .filter((j) => j && j.id && j.position)
      .map((j) => ({
        id: `remoteok-${j.id}`,
        source: "RemoteOK",
        country: "REMOTE",
        title: j.position,
        employer: j.company,
        url: j.url || `https://remoteok.com/remote-jobs/${j.id}`,
        postedDate: j.date,
        description: j.description || (j.tags || []).join(", "),
        tags: j.tags || [],
        language: "en",
      }));
  } catch (err) {
    console.warn("RemoteOK fetch failed:", err.message);
    return [];
  }
}

async function fetchArbeitnow() {
  try {
    const res = await fetch("https://www.arbeitnow.com/api/job-board-api");
    if (!res.ok) return [];
    const data = await res.json();
    return (data.data || []).map((j) => ({
      id: `arbeitnow-${j.slug}`,
      source: "Arbeitnow",
      country: j.remote ? "REMOTE" : j.location || "unknown",
      title: j.title,
      employer: j.company_name,
      url: j.url,
      postedDate: j.created_at
        ? new Date(j.created_at * 1000).toISOString()
        : null,
      description: j.description || "",
      language: "en",
    }));
  } catch (err) {
    console.warn("Arbeitnow fetch failed:", err.message);
    return [];
  }
}

async function main() {
  const [remotive, remoteok, arbeitnow] = await Promise.all([
    fetchRemotive(),
    fetchRemoteOK(),
    fetchArbeitnow(),
  ]);

  const allJobs = [...remotive, ...remoteok, ...arbeitnow];

  fs.mkdirSync("data/raw", { recursive: true });
  fs.writeFileSync("data/raw/global-remote.json", JSON.stringify(allJobs, null, 2));
  console.log(
    `Global remote boards: ${allJobs.length} postings (Remotive ${remotive.length}, RemoteOK ${remoteok.length}, Arbeitnow ${arbeitnow.length})`
  );
}

main().catch((err) => {
  console.warn("Global remote fetch failed entirely — continuing pipeline:", err.message);
  fs.mkdirSync("data/raw", { recursive: true });
  fs.writeFileSync("data/raw/global-remote.json", "[]");
});
