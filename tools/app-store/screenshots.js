// App-Store-Screenshots iPhone 6,9" (1320 × 2868 px, hochkant) aus der App-Demo (/app-demo, nur Beispieldaten
// „Max Berger“, keine echten Kundendaten). Die Demo braucht keine Anmeldung.
//
//   node tools/app-store/screenshots.js [BASIS-URL] [ZIELORDNER]
//   Standard: https://app.performancegrowth.de  docs/app-store/screenshots
//   Lokal: BASIS-URL http://localhost:3000 (mit APP_DEMO_DATABASE_URL, siehe docs/app-store.md)
//   Eigener Chromium: PW_CHROME=/pfad/zu/chrome
//
// Ergebnis: 01-heute.png, 02-kontakte.png, 03-chat.png, 04-termin.png, 05-zahlen.png.
// Ausgeblendet werden nur das Demo-Banner, der Rundgang und die Next-Entwickleranzeige; oben kommt eine
// iOS-Statusleiste (9:41) dazu, wie Apple sie in Store-Bildern zeigt.

const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const BASIS = (process.argv[2] || "https://app.performancegrowth.de").replace(/\/+$/, "");
const ZIEL = process.argv[3] || path.join(__dirname, "..", "..", "docs", "app-store", "screenshots");
// 440 × 956 pt × 3 = 1320 × 2868 px (iPhone 16/17 Pro Max)
const VIEWPORT = { width: 440, height: 956 };
const SCALE = 3;
const STATUS_PT = 54;
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 performancegrowthApp/1.0";

const STATUSLEISTE = `
  <div style="display:flex;align-items:center;justify-content:space-between;height:100%;padding:0 30px 0 44px;font:600 17px -apple-system,'SF Pro Text',system-ui,sans-serif;color:#0f172a">
    <span>9:41</span>
    <span style="display:flex;gap:6px;align-items:center">
      <svg width="18" height="12" viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx="1" fill="#0f172a"/><rect x="5" y="5.5" width="3" height="6.5" rx="1" fill="#0f172a"/><rect x="10" y="3" width="3" height="9" rx="1" fill="#0f172a"/><rect x="15" y="0" width="3" height="12" rx="1" fill="#0f172a"/></svg>
      <svg width="16" height="12" viewBox="0 0 16 12"><path d="M8 11.5 5.6 9a3.4 3.4 0 0 1 4.8 0z M3.4 6.8a6.5 6.5 0 0 1 9.2 0l-1.4 1.4a4.5 4.5 0 0 0-6.4 0z M1.2 4.6a9.6 9.6 0 0 1 13.6 0l-1.4 1.4a7.6 7.6 0 0 0-10.8 0z" fill="#0f172a"/></svg>
      <svg width="27" height="13" viewBox="0 0 27 13"><rect x=".5" y=".5" width="23" height="12" rx="3.5" fill="none" stroke="#0f172a" opacity=".4"/><rect x="2" y="2" width="20" height="9" rx="2" fill="#0f172a"/><rect x="25" y="4.5" width="1.5" height="4" rx=".75" fill="#0f172a" opacity=".4"/></svg>
    </span>
  </div>`;

async function vorbereiten(page) {
  await page.addStyleTag({
    content: `
      [data-demo-banner],[data-demo-tour],nextjs-portal{display:none!important}
      html{scroll-padding-top:${STATUS_PT}px}
      body{padding-top:${STATUS_PT}px!important}
      #pg-statusleiste{position:fixed;top:0;left:0;right:0;height:${STATUS_PT}px;z-index:2147483647;background:#fff}
    `,
  });
  // Keine fremden Marken auf den Store-Bildern (Ole, 23.11.2026, Richtlinie 5.2): „Allianz“ aus Tarifnamen entfernen
  await page.evaluate(() => {
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const knoten = [];
    while (w.nextNode()) knoten.push(w.currentNode);
    for (const t of knoten) {
      const v = t.nodeValue || "";
      if (/^\s*AZ\s*$/.test(v)) t.nodeValue = "";
      else if (/Allianz/.test(v)) t.nodeValue = v.replace(/Allianz\s*·\s*/g, "").replace(/Allianz\s+/g, "").replace(/Allianz/g, "");
    }
  });
  await page.evaluate((html) => {
    const d = document.createElement("div");
    d.id = "pg-statusleiste";
    d.innerHTML = html;
    document.body.appendChild(d);
  }, STATUSLEISTE);
  await page.waitForTimeout(400);
}

async function oeffnen(page, pfad) {
  await page.goto(BASIS + pfad, { waitUntil: "networkidle", timeout: 180_000 });
  // Nicht auf die Demo gelandet (z. B. „Demo gerade nicht verfügbar“)? Dann lieber abbrechen als falsche Bilder.
  if (!(await page.locator("[data-demo-banner]").count())) throw new Error(`Keine App-Demo unter ${BASIS + pfad} (Status-Seite oder Fehler).`);
  await page.waitForTimeout(1200);
}

/** /buyer/… aus Links der Demo-Seiten → /app-demo/… */
const demo = (href) => href.replace(/^\/buyer/, "/app-demo");

(async () => {
  fs.mkdirSync(ZIEL, { recursive: true });
  const browser = await chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: SCALE, userAgent: UA, isMobile: true, hasTouch: true, locale: "de-DE", timezoneId: "Europe/Berlin" });
  // Rundgang nicht automatisch starten
  await ctx.addInitScript(() => {
    try {
      sessionStorage.setItem("app-demo-tour", "aus");
    } catch {
      /* egal */
    }
  });
  const page = await ctx.newPage();
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(e.message));

  const bild = async (name) => {
    await vorbereiten(page);
    const datei = path.join(ZIEL, name);
    await page.screenshot({ path: datei });
    console.log("✓", datei);
  };

  // 1. Heute
  await oeffnen(page, "/app-demo");
  const termine = await page.$$eval('a[href*="/vorbereitung"]', (as) => as.map((a) => ({ href: a.getAttribute("href"), text: (a.closest("li,div")?.textContent || "").replace(/\s+/g, " ") })));
  await bild("01-heute.png");

  // 2. Kontakte
  await oeffnen(page, "/app-demo/kontakte");
  await bild("02-kontakte.png");

  // 3. Chat mit Terminbuchung (WhatsApp-Verlauf); bevorzugt Dominik Schmid wie im Rundgang
  await oeffnen(page, "/app-demo/chats");
  const chats = await page.$$eval('a[href*="chats?c="]', (as) => as.map((a) => ({ href: a.getAttribute("href"), text: a.textContent || "" })));
  const chat = chats.find((c) => /Dominik Schmid/.test(c.text)) || chats.find((c) => /gebucht/.test(c.text)) || chats[0];
  if (!chat) throw new Error("Kein Chat in der Demo gefunden.");
  await oeffnen(page, demo(chat.href));
  await bild("03-chat.png");

  // 4. Terminvorbereitung (Termin mit Dominik Schmid, sonst der erste)
  const termin = termine.find((t) => /Dominik Schmid/.test(t.text)) || termine[0];
  if (!termin) throw new Error("Kein Termin auf „Heute“ gefunden.");
  await oeffnen(page, demo(termin.href.split("?")[0]));
  await bild("04-termin.png");

  // 5. Zahlen (Navigation „Wachstum“)
  await oeffnen(page, "/app-demo/zahlen");
  await bild("05-zahlen.png");

  await browser.close();
  if (fehler.length) console.warn("Fehler im Browser:", fehler);
})().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
