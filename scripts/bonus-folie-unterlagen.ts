// Folie „Ihr Abschlussbonus“ für die Vertriebsunterlagen (PPTX/PDF zur Angebotsmail, Ole 17.11.2026).
// Erzeugt je Zielgruppe ein Bild aus derselben Folie wie in der Web-Präsentation (Listenpreise), aber mit fester
// Frist-Formulierung („bis zur Frist in Ihrem Angebot“) statt „morgen“, und ohne Seitenzahl.
//
//   npx tsx scripts/bonus-folie-unterlagen.ts <Zielordner>
//
// Danach fügt scripts/bonus-folie-einfuegen.py das Bild als vorletzte Folie in PPTX und PDF ein.
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { bonusFolie, paketDaten, verkaufsCss, VERKAUFS_AUDIENCES } from "../src/lib/vertrieb/verkaufspraesentation";

const FRIST = "bis zur Frist in Ihrem Angebot";

async function main() {
  const out = path.resolve(process.argv[2] ?? "bonus-folien");
  mkdirSync(out, { recursive: true });
  const b = await chromium.launch(process.env.E2E_CHROMIUM ? { executablePath: process.env.E2E_CHROMIUM } : {});
  const page = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
  for (const audience of VERKAUFS_AUDIENCES) {
    const p = paketDaten(null, audience);
    if (!p.bonus) throw new Error(`Kein Bonus für ${audience}`);
    const html = bonusFolie(p, p.bonus, 0, 0, { fristText: FRIST });
    await page.setContent(
      `<!doctype html><html lang="de"><head><meta charset="utf-8">
       <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800&display=swap" rel="stylesheet">
       <style>:root{--font-geist-sans:"Geist"}html,body{margin:0;padding:0}${verkaufsCss()}</style></head><body>${html}</body></html>`,
      { waitUntil: "networkidle" },
    );
    await page.evaluate(() => document.fonts.ready);
    const ziel = path.join(out, `abschlussbonus-${audience}.png`);
    await page.locator("section.vk").screenshot({ path: ziel });
    console.log(ziel);
  }
  await b.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
