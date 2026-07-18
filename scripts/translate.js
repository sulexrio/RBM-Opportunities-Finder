// Auto-translates non-English job titles/descriptions using a free public
// LibreTranslate instance. Free public instances are rate-limited and
// occasionally down — that's fine, this is a best-effort pass, not a
// dependency. Anything it can't translate is left in the original language
// and flagged `needsTranslation: true` so the PWA shows a "Copy for AI"
// button — you paste it into Claude/ChatGPT for a translation + read on
// nuance, same bridge pattern as the rest of your tools.

import fs from "fs";

const LIBRETRANSLATE_URL = "https://libretranslate.com/translate";

async function translateText(text, sourceLang = "auto") {
  if (!text || text.trim().length === 0) return null;
  try {
    const res = await fetch(LIBRETRANSLATE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        q: text.slice(0, 2000), // keep requests small and free-tier friendly
        source: sourceLang,
        target: "en",
        format: "text",
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.translatedText || null;
  } catch {
    return null;
  }
}

async function main() {
  const raw = fs.readFileSync("data/jobs.json", "utf-8");
  const dataset = JSON.parse(raw);

  for (const job of dataset.jobs) {
    if (!job.language || job.language === "en") continue;

    const translatedTitle = await translateText(job.title, job.language);
    if (translatedTitle) {
      job.titleEn = translatedTitle;
      job.needsTranslation = false;
    } else {
      job.needsTranslation = true; // PWA will offer the "Copy for AI" bridge
    }

    await new Promise((r) => setTimeout(r, 300)); // stay polite to the free instance
  }

  fs.writeFileSync("data/jobs.json", JSON.stringify(dataset, null, 2));
  fs.writeFileSync("public/data/jobs.json", JSON.stringify(dataset, null, 2));

  const translated = dataset.jobs.filter((j) => j.titleEn).length;
  console.log(`Translated ${translated} non-English postings automatically`);
}

main().catch((err) => {
  console.warn("Translation pass failed — leaving originals, PWA bridge covers it:", err.message);
});
