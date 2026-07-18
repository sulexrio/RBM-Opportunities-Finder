// Downloads the UK Home Office's official Register of Licensed Sponsors.
// This is the free, government-published CSV listing every organisation
// legally allowed to sponsor a Skilled Worker / Temporary Worker visa.
//
// We don't use this to find jobs — we use it to VERIFY jobs. Any UK listing
// claiming to offer visa sponsorship gets checked against this list.
//
// The exact CSV URL changes periodically (gov.uk re-publishes it). Check
// https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers
// and update SPONSOR_CSV_URL below if the request starts failing.

import fs from "fs";

const SPONSOR_LIST_PAGE =
  "https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers";

async function findCurrentCsvUrl() {
  const res = await fetch(SPONSOR_LIST_PAGE);
  const html = await res.text();
  const match = html.match(/href="([^"]+\.csv)"/i);
  if (!match) {
    throw new Error(
      "Could not locate the sponsor CSV link — gov.uk page structure may have changed."
    );
  }
  return match[1].startsWith("http")
    ? match[1]
    : `https://www.gov.uk${match[1]}`;
}

function parseCsv(csvText) {
  const [headerLine, ...lines] = csvText.trim().split("\n");
  const headers = headerLine.split(",").map((h) => h.trim().replace(/"/g, ""));

  return lines
    .filter(Boolean)
    .map((line) => {
      // Simple CSV split — sponsor names rarely contain commas, but if this
      // ever breaks on a real row, swap in a proper CSV parser (e.g. papaparse).
      const values = line.split(",").map((v) => v.trim().replace(/"/g, ""));
      const row = {};
      headers.forEach((h, i) => (row[h] = values[i]));
      return row;
    });
}

async function main() {
  const csvUrl = await findCurrentCsvUrl();
  console.log(`Fetching UK sponsor register from ${csvUrl}`);

  const res = await fetch(csvUrl);
  const csvText = await res.text();
  const sponsors = parseCsv(csvText);

  // Store as a lookup keyed by lowercased org name for fast verification.
  const lookup = {};
  for (const row of sponsors) {
    const name = (row["Organisation Name"] || row["Organisation"] || "")
      .toLowerCase()
      .trim();
    if (name) lookup[name] = row;
  }

  fs.mkdirSync("data/raw", { recursive: true });
  fs.writeFileSync(
    "data/raw/uk-sponsors.json",
    JSON.stringify(lookup, null, 2)
  );
  console.log(`UK sponsor register: ${Object.keys(lookup).length} organisations`);
}

main().catch((err) => {
  console.error("UK sponsor fetch failed:", err.message);
  // Don't crash the whole pipeline if gov.uk changes their page structure —
  // just skip verification this run and keep the last known good file.
  process.exit(0);
});
