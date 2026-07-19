// Handles CV upload/parsing/keyword extraction and exposes a scoring
// function the main app.js uses to sort jobs by fit. Everything runs in
// the browser — nothing is uploaded anywhere, no server, no paid API.
// CV text/keywords persist in localStorage so you don't re-upload each visit.

const CV_STORAGE_KEY = "opportunityFinderCv";

const STOPWORDS = new Set(
  ("the a an and or but if then else for of to in on at by with from up about " +
   "into through during before after above below between out under again further " +
   "once here there when where why how all any both each few more most other some " +
   "such no nor not only own same so than too very s t can will just don should now " +
   "i me my myself we our ours you your yours he him his she her it its they them " +
   "their this that these those am is are was were be been being have has had having " +
   "do does did doing would could may might must shall as email phone address name " +
   "cv resume curriculum vitae page references available request").split(" ")
);

function extractKeywords(text, maxKeywords = 25) {
  const words = (text.toLowerCase().match(/[a-z][a-z0-9+.#/-]{2,}/g) || []);
  const freq = {};
  for (const w of words) {
    if (STOPWORDS.has(w)) continue;
    if (/^\d+$/.test(w)) continue;
    freq[w] = (freq[w] || 0) + 1;
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxKeywords)
    .map(([word]) => word);
}

async function parseFileToText(file) {
  const ext = file.name.split(".").pop().toLowerCase();

  if (ext === "txt") {
    return await file.text();
  }

  if (ext === "pdf") {
    const arrayBuffer = await file.arrayBuffer();
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let text = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((it) => it.str).join(" ") + " ";
    }
    return text;
  }

  if (ext === "docx") {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  }

  throw new Error("Unsupported file type — please upload PDF, DOCX, or TXT.");
}

function saveCv(filename, keywords) {
  localStorage.setItem(CV_STORAGE_KEY, JSON.stringify({ filename, keywords }));
}

function loadCv() {
  try {
    const raw = localStorage.getItem(CV_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearCv() {
  localStorage.removeItem(CV_STORAGE_KEY);
}

// Score a job against a set of CV keywords. Title matches count for more
// than description matches — a keyword in the job title is a stronger
// signal of genuine fit than one buried in a long description.
function scoreJobAgainstKeywords(job, keywords) {
  if (!keywords || keywords.length === 0) return 0;
  const title = (job.title || "").toLowerCase();
  const desc = (job.description || "").toLowerCase();
  let score = 0;
  for (const kw of keywords) {
    if (title.includes(kw)) score += 3;
    if (desc.includes(kw)) score += 1;
  }
  return score;
}

// --- UI wiring ---

function renderKeywordChips(keywords) {
  const container = document.getElementById("cvKeywords");
  container.innerHTML = keywords
    .map(
      (kw, i) =>
        `<span class="kw-chip">${kw} <button data-idx="${i}" class="kw-remove">×</button></span>`
    )
    .join("");
  container.querySelectorAll(".kw-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cv = loadCv();
      if (!cv) return;
      cv.keywords.splice(Number(btn.dataset.idx), 1);
      saveCv(cv.filename, cv.keywords);
      renderKeywordChips(cv.keywords);
      if (window.onCvChanged) window.onCvChanged();
    });
  });
}

function showActiveCv(cv) {
  document.getElementById("cvUploadArea").style.display = "none";
  document.getElementById("cvActiveArea").style.display = "block";
  document.getElementById("cvFilename").textContent = `📄 ${cv.filename}`;
  renderKeywordChips(cv.keywords);
}

function showUploadPrompt() {
  document.getElementById("cvUploadArea").style.display = "block";
  document.getElementById("cvActiveArea").style.display = "none";
}

document.addEventListener("DOMContentLoaded", () => {
  const existing = loadCv();
  if (existing) showActiveCv(existing);
  else showUploadPrompt();

  document.getElementById("cvUploadBtn").addEventListener("click", () => {
    document.getElementById("cvFile").click();
  });

  document.getElementById("cvFile").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const btn = document.getElementById("cvUploadBtn");
    const originalText = btn.textContent;
    btn.textContent = "Reading your CV…";
    btn.disabled = true;
    try {
      const text = await parseFileToText(file);
      const keywords = extractKeywords(text);
      saveCv(file.name, keywords);
      showActiveCv({ filename: file.name, keywords });
    } catch (err) {
      alert("Couldn't read that file: " + err.message);
    } finally {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  });

  document.getElementById("cvAddKeywordBtn").addEventListener("click", () => {
    const input = document.getElementById("cvAddKeyword");
    const value = input.value.trim().toLowerCase();
    if (!value) return;
    const cv = loadCv() || { filename: "manual keywords", keywords: [] };
    if (!cv.keywords.includes(value)) cv.keywords.push(value);
    saveCv(cv.filename, cv.keywords);
    showActiveCv(cv);
    input.value = "";
    if (window.onCvChanged) window.onCvChanged();
  });

  document.getElementById("cvClearBtn").addEventListener("click", () => {
    clearCv();
    showUploadPrompt();
    document.getElementById("cvMatchToggle").checked = false;
    if (window.onCvChanged) window.onCvChanged();
  });

  document.getElementById("cvMatchToggle").addEventListener("change", () => {
    if (window.onCvChanged) window.onCvChanged();
  });
});
