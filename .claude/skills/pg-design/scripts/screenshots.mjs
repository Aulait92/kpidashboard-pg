// Screenshots einer lokalen App: Desktop (1280 px) und iPhone (390 px), ganze Seite.
// node .claude/skills/pg-design/scripts/screenshots.mjs <basis-url> <ausgabeordner> <pfad> [<pfad> …]
// Umgebung: LOGIN (Standard design@test.local), PASSWORT (Standard Test-Passwort-123), SKALA (1 für eigene Prüfung,
// 2 für Bilder an Ole), NUR=desktop|iphone. Ohne Login (öffentliche Seiten): LOGIN=-
import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";

const [basis, aus, ...pfade] = process.argv.slice(2);
if (!basis || !aus || !pfade.length) {
  console.error("Aufruf: screenshots.mjs <basis-url> <ausgabeordner> <pfad> [<pfad> …]");
  process.exit(1);
}
if (!/^http:\/\/(localhost|127\.0\.0\.1)/.test(basis)) {
  console.error("Nur gegen eine lokale App (http://localhost:…).");
  process.exit(1);
}
const login = process.env.LOGIN ?? "design@test.local";
const passwort = process.env.PASSWORT ?? "Test-Passwort-123";
const skala = Number(process.env.SKALA ?? 1);
const geraete = {
  desktop: { viewport: { width: 1280, height: 900 }, userAgent: undefined },
  iphone: {
    viewport: { width: 390, height: 844 },
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
    isMobile: true,
    hasTouch: true,
  },
};
const nur = (process.env.NUR ?? "desktop,iphone").split(",");
fs.mkdirSync(aus, { recursive: true });

(async () => {
  const browser = await chromium.launch({ args: ["--disable-dev-shm-usage"] });
  for (const name of nur) {
    const g = geraete[name];
    if (!g) continue;
    const ctx = await browser.newContext({ ...g, deviceScaleFactor: skala, locale: "de-DE" });
    const p = await ctx.newPage();
    p.setDefaultTimeout(240000);
    p.on("pageerror", (e) => console.log(name, "Seitenfehler:", e.message.slice(0, 200)));
    if (login !== "-") {
      await p.goto(basis + "/login");
      await p.fill("#login-email", login);
      await p.fill("#login-password", passwort);
      await Promise.all([
        p.waitForURL((u) => !u.pathname.startsWith("/login")).catch((e) => console.log("Login:", e.message.slice(0, 80))),
        p.click("div > form button[type=submit]"),
      ]);
    }
    for (const pfad of pfade) {
      await p.goto(basis + pfad);
      await p.waitForLoadState("networkidle").catch(() => {});
      await p.waitForTimeout(1000);
      const breit = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      if (breit) console.log(name, pfad, "WARNUNG: Seite scrollt waagerecht");
      const datei = path.join(aus, `${pfad.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "start"}-${name}.png`);
      // erster Blick (ohne Scrollen) und ganze Seite; bei der ganzen Seite steht die feste Leiste unten mitten im Bild
      const oben = datei.replace(/\.png$/, "-oben.png");
      await p.screenshot({ path: oben });
      await p.screenshot({ path: datei, fullPage: true });
      console.log(oben);
      console.log(datei);
    }
    await ctx.close();
  }
  await browser.close();
})();
