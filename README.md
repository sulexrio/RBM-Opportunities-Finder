# Opportunity Finder

A personal, free PWA that aggregates real work opportunities — remote roles and
visa-sponsorship jobs (with visa, ticket, and accommodation) — across your
priority countries: US, Canada, Germany, UK, Luxembourg, Saudi Arabia, UAE,
France, Qatar, Kuwait, Singapore, Japan, Finland, Switzerland, Australia,
Sweden, Iceland, Austria, Netherlands, New Zealand, Portugal, Italy, Poland,
Monaco, Lithuania, Hong Kong, Spain, Norway.

It follows the same pattern as your RBM Software build: no paid API required,
static hosting (Netlify), and an AI copy-paste bridge for the parts that need
real judgment (translation nuance, scam-risk read, tailoring outreach).

## How the pieces fit together

```
 ┌─────────────────────────────┐
 │  GitHub Actions (free cron) │   runs every 4 hours
 │  scripts/fetch-*.js         │──▶ pulls from EURES, UK sponsor register,
 │  scripts/merge.js           │    Canada Job Bank, Gulf/APAC source list
 └──────────────┬───────────────┘
                │ writes
                ▼
        data/jobs.json   (committed to repo — this IS your database,
                           free, versioned, no server needed)
                │
                ▼
 ┌─────────────────────────────┐
 │  Netlify (free static host)  │  same setup as rbm-software-app
 │  public/index.html + app.js  │──▶ reads data/jobs.json at runtime
 └──────────────┬───────────────┘
                │
                ▼
        Your phone (installed as a PWA, works offline on last sync)
                │
                ▼
        "Copy for AI" button on each job → paste into Claude/ChatGPT
        for deep filtering, translation nuance, or a drafted outreach message
```

Nothing here is a single "does everything" black box — it's four small,
honest pieces chained together, which is also why each piece can fail
independently without taking the whole system down.

## Setup (15 minutes)

1. Push this folder to a new GitHub repo.
2. In the repo, go to Settings → Actions → General → enable "Read and write
   permissions" for the workflow (so it can commit `data/jobs.json` back).
3. Connect the repo to Netlify (same as rbm-software-app) — publish directory
   `public`.
4. The GitHub Action in `.github/workflows/fetch-jobs.yml` runs automatically
   every 4 hours and commits fresh data. Netlify redeploys automatically on
   every commit.
5. On your phone, open the Netlify URL in Safari/Chrome → "Add to Home
   Screen." That's your PWA.

## What's real vs. what needs your judgment

| Source | Status |
|---|---|
| EURES (all ~31 EU/EEA countries) | Real free public API, structured JSON, reliable |
| Remotive / RemoteOK / Arbeitnow (global remote jobs) | Real free public APIs, no key needed — these aren't tied to any one country's visa law, which is the real fix for "citizens only" listings |
| UK sponsor register | Real free official CSV, refreshed by Home Office |
| Canada Job Bank | Public search pages only — no open self-serve API. Fetcher scrapes respectfully; consider applying for their free partner XML feed for reliability |
| Gulf states (Saudi, UAE, Qatar, Kuwait, Bahrain, Oman) | No official public registry — `data/manual-sources.json` holds a curated list of agencies/portals you vet yourself. **Read the safety note below.** |
| Singapore, Japan, Hong Kong, Australia, NZ, India, Malaysia, Thailand, South Korea | Mix of official portals — see `data/manual-sources.json` |
| Nigeria, South Africa, Egypt, Kenya, Ghana, Morocco | Government labour portals + major local job boards, curated in `data/manual-sources.json` |

## Sponsorship filtering (new)

Every job now gets a `sponsorshipStatus`:
- **citizens-only** — the listing itself says it needs existing right-to-work, no sponsorship, etc. Hidden by default in the app (toggle it back on with the checkbox at the top).
- **high-confidence** — the listing explicitly mentions visa sponsorship, relocation, accommodation, or flights.
- **remote-unrestricted** — from the global remote boards, not tied to a country's labor law.
- **unclear** — matched a search keyword but doesn't clearly say either way; use your judgment.

This is keyword-based, not perfect — always confirm on the actual listing before applying.

## What changed in this update
- EURES coverage widened from 15 to all ~31 EU/EEA countries
- Added global remote-first sources (Remotive, RemoteOK, Arbeitnow) — the actual fix for location-locked/citizens-only results
- Added Middle East, Asia, and African country portals to the curated list
- Refresh cycle shortened from every 4 hours to hourly (free — public repos get unlimited GitHub Actions minutes)
- Added citizens-only detection so you can filter those out instead of opening each listing to find out

## Safety note on Gulf/Asia "visa + ticket + accommodation" listings

That exact combination is also the standard pitch used by fraudulent
recruiters. Two checks are built into `merge.js`:
- Any listing that asks the *worker* to pay for the visa, ticket, or a
  "processing fee" gets auto-flagged `⚠️ scam-risk`.
- Employers are cross-checked against official sponsor lists where one
  exists (UK, and any government registry you add to
  `data/manual-sources.json`).

Nothing replaces checking a specific offer yourself before sending money or
documents anywhere.
