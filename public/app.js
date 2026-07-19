const state = {
  allJobs: [],
  manualSources: [],
  search: "",
  country: "ALL",
  hideCitizensOnly: true,
  visibleCount: 50,
};

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
  return matchesSearch && matchesCountry && matchesCitizenFilter;
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
    </div>
  `;

  card.querySelector('[data-action="copy-ai"]').addEventListener("click", () => copyForAI(job));
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
  const filtered = state.allJobs
    .filter(matchesFilters)
    .sort((a, b) => (STATUS_RANK[a.sponsorshipStatus] ?? 2) - (STATUS_RANK[b.sponsorshipStatus] ?? 2));

  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty-state">No postings match yet. Try a broader search, or check the curated portals below.</div>`;
    return;
  }

  const visible = filtered.slice(0, state.visibleCount);

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

loadData().then(renderManualSources);
