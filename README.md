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
| EURES (15 EU/EEA countries) | Real free public API, structured JSON, reliable |
| UK sponsor register | Real free official CSV, refreshed by Home Office |
| Canada Job Bank | Public search pages only — no open self-serve API. The fetcher scrapes respectfully (see note in `fetch-canada.js`); consider applying for their free partner XML feed for reliability |
| Gulf states (Saudi, UAE, Qatar, Kuwait) | No official public registry — `data/manual-sources.json` holds a curated list of agencies/portals you vet yourself. **Read the safety note below.** |
| Singapore, Japan, Hong Kong, Australia, NZ | Mix of official portals — see `data/manual-sources.json`, expand as you vet each one |

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
