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
//   CHROMIUM=/opt/pw-browsers/chromium (Standard)
// Exit 1, wenn etwas auffällt.
// Dev-Server im Worktree (node_modules als Symlink): `NODE_OPTIONS=--max-old-space-size=8192 npx next dev --webpack`
// (Turbopack findet next über den Symlink nicht; ohne mehr Speicher startet webpack nach ~60 Seiten neu).

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
];

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
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 180_000 }), page.click('button[type="submit"]')]);

  for (const s of SEITEN) {
    const pfad = adresse(s.pfad);
    if (!pfad) {
      if (b === BREITEN[0]) uebersprungen.push(s.pfad);
      continue;
    }
    aktuell = pfad;
    const res = await page.goto(`${BASE}${pfad}`, { waitUntil: "networkidle" }).catch((e) => {
      probleme.push(`${b.name} ${pfad}: lädt nicht (${String(e).slice(0, 120)})`);
      return null;
    });
    if (!res) continue;
    geprueft++;
    if (res.status() >= 400) probleme.push(`${b.name} ${pfad}: HTTP ${res.status()}`);
    if (new URL(page.url()).pathname !== pfad) probleme.push(`${b.name} ${pfad}: umgeleitet auf ${new URL(page.url()).pathname}`);
    const breit = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (breit > 1) probleme.push(`${b.name} ${pfad}: waagrechtes Scrollen (${breit} px zu breit)`);
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
