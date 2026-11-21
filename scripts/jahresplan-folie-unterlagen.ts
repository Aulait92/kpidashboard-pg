// Folie „Jahresplan: 3 Monate sparen“ für die Vertriebsunterlagen (PPTX/PDF, Ole 21.11.2026; ersetzt die Bonusfolie).
// Erzeugt je Zielgruppe (Vertreter, Makler) ein Bild aus derselben Folie wie in der Web-Präsentation (Listenpreise),
// ohne Seitenzahl. Dazu die Folie „Ihr Paket“ mit den aktuellen Listenpreisen (paket-<zielgruppe>.png, Seitenzahl wie in
// der PPTX), die scripts/paket-folie-ersetzen.py in docs/unterlagen einsetzt (die alte nannte noch 1.000 € und
// „2 Monate geschenkt“).
//
//   npx tsx scripts/jahresplan-folie-unterlagen.ts <Zielordner>
//
// Danach fügt scripts/jahresplan-folie-einfuegen.py das Bild als vorletzte Folie in PPTX und PDF ein.
// Ohne Playwright-Chromium: E2E_CHROMIUM=<Pfad zu Chrome bzw. chrome-headless-shell>.
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { folienListe, jahresplanFolie, paketDaten, paketFolie, verkaufsCss } from "../src/lib/vertrieb/verkaufspraesentation";

async function main() {
  const out = path.resolve(process.argv[2] ?? "jahresplan-folien");
  mkdirSync(out, { recursive: true });
  const b = await chromium.launch(process.env.E2E_CHROMIUM ? { executablePath: process.env.E2E_CHROMIUM } : {});
  const page = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
  for (const audience of ["vertreter", "makler"] as const) {
    const p = paketDaten(null, audience);
    if (!p.jahresplan) throw new Error(`Kein Jahresplan für ${audience}`);
    // Paket-Folie mit Seitenzahl wie in der PPTX ohne Jahresplan (Vertreter 22 / 24, Makler 23 / 25)
    const basis = folienListe(audience, { jahresplan: false });
    const paketNr = basis.find((f) => f.art === "paket")!.nr;
    for (const [name, html] of [
      [`jahresplan-${audience}.png`, jahresplanFolie(p, p.jahresplan, 0, 0)],
      [`paket-${audience}.png`, paketFolie(p, audience, paketNr, basis.length)],
    ] as const) {
      await page.setContent(
        `<!doctype html><html lang="de"><head><meta charset="utf-8">
         <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800&display=swap" rel="stylesheet">
         <style>:root{--font-geist-sans:"Geist"}html,body{margin:0;padding:0}${verkaufsCss()}</style></head><body>${html}</body></html>`,
        { waitUntil: "networkidle" },
      );
      await page.evaluate(() => document.fonts.ready);
      const ziel = path.join(out, name);
      await page.locator("section.vk").screenshot({ path: ziel });
      console.log(ziel);
    }
  }
  await b.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
