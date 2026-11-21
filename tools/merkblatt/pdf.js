// Merkblatt „Einwände im Termin“ als PDF (A4, eine Seite): node tools/merkblatt/pdf.js
const path = require("path");
const { chromium } = require("playwright");

(async () => {
  const quelle = path.join(__dirname, "einwand-merkblatt.html");
  const ziel = path.join(__dirname, "..", "..", "public", "anleitung", "einwand-merkblatt.pdf");
  // Eigener Chromium-Pfad, falls die Playwright-Version des Projekts keinen Browser mitbringt (PW_CHROMIUM=…)
  const b = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  const p = await b.newPage();
  await p.goto("file://" + quelle);
  await p.pdf({ path: ziel, format: "A4", printBackground: true, preferCSSPageSize: true });
  if (process.argv[2]) await p.screenshot({ path: process.argv[2], fullPage: true });
  await b.close();
  console.log(ziel);
})();
