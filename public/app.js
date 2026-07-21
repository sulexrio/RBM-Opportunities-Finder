const state = {
  allJobs: [],
  manualSources: [],
  startupSources: [],
  search: "",
  country: "ALL",
  hideCitizensOnly: true,
  recentOnly: false,
  myListOnly: false,
  visibleCount: 50,
  cvKeywords: null, // Map<word, weight> once a CV is loaded, else null
  cvText: "",
  cvFilename: "",
  savedJobs: {}, // { [jobId]: 'saved' | 'applied' }, persisted to localStorage
};

const SAVED_JOBS_KEY = "opportunity-finder-saved-jobs";

function loadSavedJobs() {
  try {
    const raw = localStorage.getItem(SAVED_JOBS_KEY);
    state.savedJobs = raw ? JSON.parse(raw) : {};
  } catch {
    state.savedJobs = {};
  }
}

function persistSavedJobs() {
  try {
    localStorage.setItem(SAVED_JOBS_KEY, JSON.stringify(state.savedJobs));
  } catch (err) {
    console.warn("Could not save to localStorage:", err.message);
  }
}

function setJobStatus(jobId, status) {
  if (status === null) {
    delete state.savedJobs[jobId];
  } else {
    state.savedJobs[jobId] = status;
  }
  persistSavedJobs();
  render();
}

function showSkeleton() {
  const container = document.getElementById("jobs");
  container.innerHTML = Array(4)
    .fill('<div class="skeleton-card"></div>')
    .join('<div style="height:14px;"></div>');
}

async function loadData() {
  showSkeleton();
  const res = await fetch("data/jobs.json", { cache: "no-store" });
  const data = await res.json();
  state.allJobs = data.jobs || [];
  state.manualSources = data.manualSources || [];
  state.startupSources = data.startupSources || [];
  document.getElementById("status").textContent =
    `${data.totalJobs} postings · last updated ${new Date(data.generatedAt).toLocaleString()}`;
  populateCountryFilter();
  render();
}

function populateCountryFilter() {
  const select = document.getElementById("countryFilter");
  const countries = [...new Set(state.allJobs.map((j) => j.country))].sort();
  select.innerHTML =
    `<option value="ALL">All countries</option>` +
    countries.map((c) => `<option value="${c}">${c}</option>`).join("");
}

// ---- CV matching (all client-side, nothing ever leaves your phone) ----

const STOPWORDS = new Set(
  ("a an the and or but if of to in on for with at by from as is are was were be been " +
   "this that these those it its i you we they he she your our their will shall can " +
   "may would could should have has had do does did not no yes about into over under " +
   "than then so such also more most other some any all each every job role work team " +
   "years experience skills including etc using use used via per within across")
    .split(" ")
);

function tokenize(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

function buildCvWeights(text) {
  const tokens = tokenize(text);
  const freq = new Map();
  tokens.forEach((t) => freq.set(t, (freq.get(t) || 0) + 1));
  return freq;
}

function matchScore(job, cvWeights) {
  if (!cvWeights) return 0;
  const jobTokens = new Set(tokenize(`${job.title} ${job.description}`));
  let score = 0;
  jobTokens.forEach((t) => {
    if (cvWeights.has(t)) score += cvWeights.get(t);
  });
  return score / Math.sqrt(jobTokens.size + 10);
}

async function extractTextFromFile(file) {
  const ext = file.name.split(".").pop().toLowerCase();

  if (ext === "txt") {
    return await file.text();
  }

  if (ext === "pdf") {
    if (typeof pdfjsLib === "undefined") {
      throw new Error("PDF reader failed to load — check your connection and try again.");
    }
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    let text = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((it) => it.str).join(" ") + "\n";
    }
    return text;
  }

  if (ext === "docx") {
    if (typeof mammoth === "undefined") {
      throw new Error("Word reader failed to load — check your connection and try again.");
    }
    const buffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    return result.value;
  }

  throw new Error("Unsupported file type — please upload a PDF, .docx, or .txt file.");
}

function isWithinDays(dateStr, days) {
  if (!dateStr) return false;
  const posted = new Date(dateStr);
  if (isNaN(posted.getTime())) return false;
  const diffMs = Date.now() - posted.getTime();
  return diffMs >= 0 && diffMs <= days * 24 * 60 * 60 * 1000;
}

function copyCvMatchesForAI() {
  const cvActive = document.getElementById("cvMatchToggle").checked;
  const filtered = state.allJobs
    .filter(matchesFilters)
    .map((job) => ({ ...job, _score: matchScore(job, state.cvKeywords) }))
    .sort((a, b) => b._score - a._score)
    .slice(0, 15);

  const jobsBlock = filtered
    .map(
      (j, i) =>
        `${i + 1}. ${j.title} — ${j.employer} (${j.country}, via ${j.source})\n   URL: ${j.url}\n   Snippet: ${(j.description || "").replace(/<[^>]+>/g, "").slice(0, 300)}`
    )
    .join("\n\n");

  const prompt = `Here is my CV text, followed by ${filtered.length} job postings my app ranked as closest keyword matches (simple keyword overlap, not real judgment). Please:
1. Do a real precision match — which of these genuinely fit my actual experience and skills, not just shared words?
2. Rank the top 5-8 by genuine fit, and say why for each.
3. Flag any that look like they need skills/experience I don't actually have.
4. For the top matches, note anything about visa sponsorship, relocation, or remote status mentioned.

--- MY CV ---
${state.cvText.slice(0, 4000)}

--- CANDIDATE POSTINGS ---
${jobsBlock}`;

  navigator.clipboard.writeText(prompt).then(() => {
    alert("Copied — paste into Claude or ChatGPT for the real precision match.");
  });
}

function matchesFilters(job) {
  const q = state.search.toLowerCase();
  const matchesSearch =
    !q ||
    job.title?.toLowerCase().includes(q) ||
    job.employer?.toLowerCase().includes(q) ||
    job.description?.toLowerCase().includes(q);
  const matchesCountry = state.country === "ALL" || job.country === state.country;
  const matchesCitizenFilter =
    !state.hideCitizensOnly || job.sponsorshipStatus !== "citizens-only";
  const matchesRecency = !state.recentOnly || isWithinDays(job.postedDate, 14);
  const matchesMyList = !state.myListOnly || Boolean(state.savedJobs[job.id]);
  return matchesSearch && matchesCountry && matchesCitizenFilter && matchesRecency && matchesMyList;
}

function copyForAI(job) {
  const prompt = `Here's a job posting I found. Please:
1. Translate it fully to English if it isn't already.
2. Tell me honestly whether this looks like a legitimate opportunity or has scam warning signs.
3. Summarize what's required and how to apply.
4. Draft a short outreach message I could send.

Title: ${job.title}
Employer: ${job.employer}
Country: ${job.country}
Source: ${job.source}
URL: ${job.url}
Description: ${job.description || "(no description text captured)"}`;

  navigator.clipboard.writeText(prompt).then(() => {
    alert("Copied — paste this into Claude or ChatGPT for a deep read.");
  });
}

function jobCard(job) {
  const card = document.createElement("div");
  card.className = "job-card" + (job.scamRisk ? " scam-risk" : "");

  const badges = [];
  badges.push(`<span class="badge country">${job.country}</span>`);
  if (typeof job._score === "number" && job._score > 0) {
    badges.push(`<span class="badge match-score">🎯 CV fit: ${job._score.toFixed(1)}</span>`);
  }
  if (job.sponsorshipStatus === "citizens-only") {
    badges.push(`<span class="badge risk">🚫 citizens/right-to-work only</span>`);
  } else if (job.sponsorshipStatus === "high-confidence") {
    badges.push(`<span class="badge verified">✓ sponsorship/relocation mentioned</span>`);
  } else if (job.sponsorshipStatus === "remote-unrestricted") {
    badges.push(`<span class="badge verified">🌐 remote, not location-locked</span>`);
  }
  if (job.sponsorVerified === true) {
    badges.push(`<span class="badge verified">✓ verified sponsor</span>`);
  } else if (job.sponsorVerified === false) {
    badges.push(`<span class="badge risk">not on sponsor register</span>`);
  }
  if (job.scamRisk) {
    badges.push(`<span class="badge risk">⚠ scam-risk language</span>`);
  }
  if (job.needsTranslation) {
    badges.push(`<span class="badge country">needs translation</span>`);
  }
  const myStatus = state.savedJobs[job.id];
  if (myStatus === "saved") {
    badges.push(`<span class="badge match-score">☆ saved</span>`);
  } else if (myStatus === "applied") {
    badges.push(`<span class="badge verified">✓ applied</span>`);
  }

  card.innerHTML = `
    <div class="job-top">
      <div>
        <p class="job-title">${job.titleEn || job.title}</p>
        <p class="job-employer">${job.employer}</p>
      </div>
    </div>
    <div class="job-meta">
      <span>${job.source}</span>
      <span>${job.postedDate ? new Date(job.postedDate).toLocaleDateString() : "date unknown"}</span>
      ${badges.join("")}
    </div>
    <div class="job-actions">
      <a class="primary" href="${job.url}" target="_blank" rel="noopener">Open listing</a>
      <button data-action="copy-ai">Copy for AI review</button>
      <button data-action="save">${myStatus === "saved" ? "Unsave" : "☆ Save"}</button>
      <button data-action="applied">${myStatus === "applied" ? "Unmark applied" : "✓ Mark applied"}</button>
    </div>
  `;

  card.querySelector('[data-action="copy-ai"]').addEventListener("click", () => copyForAI(job));
  card.querySelector('[data-action="save"]').addEventListener("click", () =>
    setJobStatus(job.id, myStatus === "saved" ? null : "saved")
  );
  card.querySelector('[data-action="applied"]').addEventListener("click", () =>
    setJobStatus(job.id, myStatus === "applied" ? null : "applied")
  );
  return card;
}

const STATUS_RANK = {
  "high-confidence": 0,
  "remote-unrestricted": 1,
  unclear: 2,
  "citizens-only": 3,
};

const SECTION_LABELS = {
  "high-confidence": "✓ Sponsorship / relocation mentioned",
  "remote-unrestricted": "🌐 Remote — not location-locked",
  unclear: "Other matches",
  "citizens-only": "🚫 Citizens / right-to-work only",
};

function render() {
  const container = document.getElementById("jobs");
  container.innerHTML = "";

  const matchToggle = document.getElementById("cvMatchToggle");
  const useCvSort = state.cvKeywords && matchToggle && matchToggle.checked;

  let filtered = state.allJobs.filter(matchesFilters);

  if (useCvSort) {
    filtered = filtered
      .map((job) => ({ ...job, _score: matchScore(job, state.cvKeywords) }))
      .sort((a, b) => b._score - a._score);
  } else {
    filtered = filtered.sort(
      (a, b) => (STATUS_RANK[a.sponsorshipStatus] ?? 2) - (STATUS_RANK[b.sponsorshipStatus] ?? 2)
    );
  }

  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty-state">No postings match yet. Try a broader search, or check the curated portals below.</div>`;
    return;
  }

  const visible = filtered.slice(0, state.visibleCount);

  if (useCvSort) {
    const header = document.createElement("div");
    header.className = "section-header";
    header.innerHTML = `🎯 Sorted by fit to your CV <span class="count">(${filtered.length} matches)</span>`;
    container.appendChild(header);
    visible.forEach((job) => container.appendChild(jobCard(job)));
  } else {
    let currentStatus = null;
    visible.forEach((job) => {
      const status = job.sponsorshipStatus || "unclear";
      if (status !== currentStatus) {
        currentStatus = status;
        const countInSection = filtered.filter((j) => (j.sponsorshipStatus || "unclear") === status).length;
        const header = document.createElement("div");
        header.className = "section-header";
        header.innerHTML = `${SECTION_LABELS[status] || "Other"} <span class="count">(${countInSection})</span>`;
        container.appendChild(header);
      }
      container.appendChild(jobCard(job));
    });
  }

  const countLabel = document.createElement("div");
  countLabel.className = "empty-state";
  countLabel.style.padding = "16px 0";
  countLabel.textContent = `Showing ${visible.length} of ${filtered.length} matching postings`;
  container.appendChild(countLabel);

  if (filtered.length > state.visibleCount) {
    const loadMoreBtn = document.createElement("button");
    loadMoreBtn.textContent = `Load 50 more`;
    loadMoreBtn.className = "job-actions";
    loadMoreBtn.style.cssText =
      "display:block;width:100%;padding:12px;border-radius:8px;border:1px solid #263349;background:#131C2E;color:#E7E9EE;font-weight:600;cursor:pointer;";
    loadMoreBtn.addEventListener("click", () => {
      state.visibleCount += 50;
      render();
    });
    container.appendChild(loadMoreBtn);
  }
}

function renderManualSources() {
  const list = document.getElementById("manualSourcesList");
  list.innerHTML = state.manualSources
    .map(
      (s) =>
        `<li><strong>${s.country}</strong> — ${s.name}: <a href="${s.url}" target="_blank" rel="noopener">${s.url}</a></li>`
    )
    .join("");
}

function renderStartupSources() {
  const list = document.getElementById("startupSourcesList");
  const categoryLabels = {
    "startup-jobs": "Startup jobs",
    "cofounder-matching": "Co-founder matching",
    community: "Community",
  };
  list.innerHTML = state.startupSources
    .map(
      (s) =>
        `<li><strong>${categoryLabels[s.category] || s.category}</strong> — ${s.name}: <a href="${s.url}" target="_blank" rel="noopener">${s.url}</a></li>`
    )
    .join("");
}

document.getElementById("search").addEventListener("input", (e) => {
  state.search = e.target.value;
  state.visibleCount = 50;
  render();
});

document.getElementById("countryFilter").addEventListener("change", (e) => {
  state.country = e.target.value;
  state.visibleCount = 50;
  render();
});

document.getElementById("hideCitizensOnly").addEventListener("change", (e) => {
  state.hideCitizensOnly = e.target.checked;
  state.visibleCount = 50;
  render();
});

document.getElementById("recentOnly").addEventListener("change", (e) => {
  state.recentOnly = e.target.checked;
  state.visibleCount = 50;
  render();
});

document.getElementById("myListOnly").addEventListener("change", (e) => {
  state.myListOnly = e.target.checked;
  state.visibleCount = 50;
  render();
});

document.getElementById("cvFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const statusEl = document.getElementById("cvStatus");
  statusEl.className = "cv-status";
  statusEl.textContent = "Reading your CV…";

  try {
    const text = await extractTextFromFile(file);
    if (!text || text.trim().length < 20) {
      throw new Error("Couldn't find readable text in that file — try a different export of your CV.");
    }
    state.cvText = text;
    state.cvKeywords = buildCvWeights(text);
    state.cvFilename = file.name;
    statusEl.textContent = `✓ Loaded "${file.name}" — ${state.cvKeywords.size} unique keywords found`;
    document.getElementById("cvActiveRow").style.display = "block";
    state.visibleCount = 50;
    render();
  } catch (err) {
    statusEl.className = "cv-status error";
    statusEl.textContent = `⚠ ${err.message}`;
  }
});

document.getElementById("clearCvBtn").addEventListener("click", () => {
  state.cvKeywords = null;
  state.cvText = "";
  state.cvFilename = "";
  document.getElementById("cvFile").value = "";
  document.getElementById("cvStatus").textContent = "";
  document.getElementById("cvActiveRow").style.display = "none";
  render();
});

document.getElementById("cvMatchToggle").addEventListener("change", () => {
  state.visibleCount = 50;
  render();
});

document.getElementById("copyCvMatchesBtn").addEventListener("click", copyCvMatchesForAI);

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js");
}

const backToTopBtn = document.getElementById("backToTop");
window.addEventListener("scroll", () => {
  backToTopBtn.classList.toggle("visible", window.scrollY > 600);
});
backToTopBtn.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});

loadSavedJobs();
loadData().then(() => {
  renderManualSources();
  renderStartupSources();
});
