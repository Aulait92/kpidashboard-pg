#!/usr/bin/env node
// Durchklick des neuen Admins: öffnet jede Ansicht aus src/lib/admin-neu/navigation.ts auf 390 px (Handy) und
// 1280 px (Rechner) und meldet Konsolenfehler, Seitenfehler, HTTP-Fehler und waagrechtes Scrollen.
//
//   BASE_URL=http://localhost:3000 ADMIN_EMAIL=… ADMIN_PASSWORD=… node tools/admin-neu/durchklick.mjs
//
// Optional:
//   DURCHKLICK_PARAMS='{"/admin/neu/kunden/[id]":"<kundeId>","/admin/neu/vertrieb/kontakte/[id]":"<kontaktId>"}'
//     setzt ids für Detailseiten (Schlüssel = Anfang des Pfads; ohne passenden Schlüssel wird die Seite übersprungen)
//   SCREENSHOTS=<ordner>   legt je Ansicht und Breite ein PNG ab
//   DURCHKLICK_BREITEN=390 nur diese Breite(n), z. B. „390“ oder „1280“ (Standard: beide)
//   CHROMIUM=/opt/pw-browsers/chromium (Standard)
// Exit 1, wenn etwas auffällt.
// Dev-Server im Worktree (node_modules als Symlink): `NODE_OPTIONS=--max-old-space-size=6144 npx next dev --webpack`
// (Turbopack findet next über den Symlink nicht). webpack startet bei Speicherdruck von selbst neu, der Durchklick lädt
// die Seite dann noch einmal; mit 8192 MB wuchs der Prozess über das Speicherlimit des Containers (14 GB) und wurde beendet.

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { SEITEN } from "../../src/lib/admin-neu/navigation.ts";

const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const EMAIL = process.env.ADMIN_EMAIL;
const PASSWORD = process.env.ADMIN_PASSWORD;
const PARAMS = JSON.parse(process.env.DURCHKLICK_PARAMS ?? "{}");
const SHOTS = process.env.SCREENSHOTS;
const BREITEN = [
  { name: "handy", width: 390, height: 844 },
  { name: "rechner", width: 1280, height: 900 },
].filter((b) => !process.env.DURCHKLICK_BREITEN || process.env.DURCHKLICK_BREITEN.split(",").includes(String(b.width)));

if (!EMAIL || !PASSWORD) {
  console.error("ADMIN_EMAIL und ADMIN_PASSWORD setzen (Admin-Login der Test-Datenbank).");
  process.exit(2);
}
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

/** Pfad mit eingesetzten ids oder null (keine passende id). */
function adresse(pfad) {
  if (!pfad.includes("[")) return pfad;
  const key = Object.keys(PARAMS)
    .filter((k) => pfad.startsWith(k))
    .sort((a, b) => b.length - a.length)[0];
  if (!key) return null;
  return pfad.replace(/\[[a-z]+\]/gi, encodeURIComponent(PARAMS[key]));
}

// Seiten, die bewusst weiterleiten (alte Links): /kunden/berichte/[id] öffnet den Bericht in der Kundenakte,
// /kunden/[id]/optimierung ist seit dem Umbau 20.11.2026 ein Abschnitt unter Kundenakte › Leads.
const WEITERLEITUNG_ERWARTET = {
  "/admin/neu/kunden/berichte/[id]": /^\/admin\/neu\/kunden\/[^/]+\/berichte$/,
  "/admin/neu/kunden/[id]/optimierung": /^\/admin\/neu\/kunden\/[^/]+\/leads$/,
};

/** Lädt eine Seite und prüft HTTP-Status, Umleitung und Breite. Wirft, wenn die Seite nicht (vollständig) lädt. */
async function pruefen(page, pfad, b, muster) {
  const res = await page.goto(`${BASE}${pfad}`, { waitUntil: "networkidle" });
  if (!res) throw new Error("keine Antwort");
  const breit = await page.evaluate(() => {
    const d = document.documentElement;
    if (!d || !document.body) throw new Error("Seite leer");
    return d.scrollWidth - d.clientWidth;
  });
  if (res.status() >= 400) probleme.push(`${b.name} ${pfad}: HTTP ${res.status()}`);
  const ziel = new URL(page.url()).pathname;
  if (ziel !== pfad && !WEITERLEITUNG_ERWARTET[muster]?.test(ziel)) probleme.push(`${b.name} ${pfad}: umgeleitet auf ${ziel}`);
  if (breit > 1) probleme.push(`${b.name} ${pfad}: waagrechtes Scrollen (${breit} px zu breit)`);
  return true;
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium" });
const probleme = [];
const uebersprungen = [];
let geprueft = 0;

for (const b of BREITEN) {
  const ctx = await browser.newContext({ viewport: { width: b.width, height: b.height } });
  const page = await ctx.newPage();
  // Dev-Server übersetzt jede Seite beim ersten Aufruf: großzügige Wartezeit
  page.setDefaultTimeout(180_000);
  page.setDefaultNavigationTimeout(180_000);
  let aktuell = "";
  page.on("console", (m) => {
    if (m.type() === "error") probleme.push(`${b.name} ${aktuell}: Konsole: ${m.text().slice(0, 200)}`);
  });
  page.on("pageerror", (e) => probleme.push(`${b.name} ${aktuell}: Seitenfehler: ${String(e).slice(0, 200)}`));

  // Anmelden
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  // „commit“ statt „load“: startet der Dev-Server gerade neu, feuert „load“ der Startseite unter Umständen nie
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 180_000, waitUntil: "commit" }), page.click('button[type="submit"]')]);

  for (const s of SEITEN) {
    const pfad = adresse(s.pfad);
    if (!pfad) {
      if (b === BREITEN[0]) uebersprungen.push(s.pfad);
      continue;
    }
    aktuell = pfad;
    // Der Dev-Server startet bei Speicherdruck neu („approaching the used memory threshold“): dann ist die Seite
    // kurz leer. Einmal warten und neu laden, bevor etwas als Fehler zählt.
    let ergebnis = null;
    for (let versuch = 1; versuch <= 2 && !ergebnis; versuch++) {
      const vorher = probleme.length;
      ergebnis = await pruefen(page, pfad, b, s.pfad).catch((e) => {
        if (versuch === 2) probleme.push(`${b.name} ${pfad}: lädt nicht (${String(e).slice(0, 120)})`);
        return null;
      });
      if (!ergebnis && versuch === 1) {
        probleme.length = vorher; // Meldungen des abgebrochenen Versuchs verwerfen
        await page.waitForTimeout(20_000);
      }
    }
    if (!ergebnis) continue;
    geprueft++;
    if (SHOTS) await page.screenshot({ path: join(SHOTS, `${s.view}-${pfad.split("/").filter(Boolean).slice(2).join("_") || "heute"}-${b.width}.png`), fullPage: true });
  }
  await ctx.close();
}
await browser.close();

console.log(`${geprueft} Aufrufe geprüft (${BREITEN.map((b) => b.width).join(" und ")} px).`);
if (uebersprungen.length) console.log(`Übersprungen (keine id in DURCHKLICK_PARAMS): ${uebersprungen.join(", ")}`);
if (probleme.length) {
  console.log(`\n${probleme.length} Auffälligkeiten:`);
  for (const p of probleme) console.log(`- ${p}`);
  process.exit(1);
}
console.log("Keine Konsolenfehler, kein waagrechtes Scrollen.");
