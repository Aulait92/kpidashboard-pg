// Vergleichsfolie mit den Grenzen der Terminvorbereitung (3 bzw. 4 Tarife, 5 Merkmale, 2 Bausteine) ragt nicht in die
// Fußzeile (UX-Analyse 15.11.2026, Teil 2): gemessen in Chromium bei 1280 × 720, ohne Verkleinern durch folienEinpassen.
// Ohne installierten Chromium (z. B. schlanke CI) wird der Test übersprungen.
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser } from "playwright";
import { ladeTarifkatalog } from "@/lib/tarifkatalog-laden";
import { startAuswahl, zuAngebote, type Tarifauswahl } from "@/lib/tarifauswahl";
import { folien, markeFuer, praesentationHtml } from "@/lib/praesentation";
import type { VorbereitungDaten } from "@/lib/termin-vorbereitung";

const k = ladeTarifkatalog(path.join(__dirname, "..", "fixtures", "tarifkatalog"));
const termin: VorbereitungDaten = {
  lead: { name: "Verena Martin", telefon: null, email: null, adresse: null, produkt: "Privatschutz" },
  termin: { startsAt: new Date("2026-11-16T09:00:00Z"), mode: "phone", berater: "Max Berger", meetUrl: null },
  zusammenfassung: null,
  formular: [],
  angaben: {},
  vorbereitetAm: null,
};

let browser: Browser | null = null;
beforeAll(async () => {
  try {
    const { chromium } = await import("playwright");
    // Eigener Pfad (CHROMIUM_PATH) bzw. der vorinstallierte Chromium der Entwicklungsumgebung, sonst der von Playwright
    const pfade = [process.env.CHROMIUM_PATH, "/opt/pw-browsers/chromium", undefined];
    for (const executablePath of pfade) {
      if (executablePath !== undefined && !executablePath) continue;
      browser = await chromium.launch({ args: ["--no-sandbox"], ...(executablePath ? { executablePath } : {}) }).catch(() => null);
      if (browser) break;
    }
  } catch {
    browser = null;
  }
}, 60_000);
afterAll(async () => {
  await browser?.close();
});

/** Höchstwerte: lange Merkmal-Kurznamen und Werte, alle Bausteine mit Preis, Kurznamen bis 18 Zeichen. */
function maximal(anzahl: 3 | 4): Tarifauswahl {
  const a = startAuswahl(k, ["hausrat"], { rolle: "vertreter", gesellschaften: ["allianz"] });
  const sp = a.sparten[0];
  if (anzahl === 4) sp.tarife.unshift({ ...sp.tarife[0], id: "allianz/hausrat/basis", kurz: "Basis" });
  sp.merkmale = ["kfz-diebstahl", "grobe-fahrlaessigkeit", "fahrraddiebstahl", "online-betrug", "aussenversicherung"];
  sp.schema.merkmale = sp.schema.merkmale.map((m) => (m.key === "kfz-diebstahl" ? { ...m, kurz: "Diebstahl aus dem Kfz (Auto)" } : m));
  sp.bausteine = ["fahrrad", "glas"];
  sp.tarife.forEach((t, i) => {
    t.kurz = ["Komfort Plus Extra", "Premium Best Plus", "Smart Select Max", "Basis Start Plus"][i];
    t.beitrag = 1234.56;
    // je Tarif andere Werte, sonst stünden sie gemeinsam unter „In allen Tarifen“
    t.werte = { "kfz-diebstahl": `bis ${i + 1}0.000 € je`, "grobe-fahrlaessigkeit": `bis ${i + 1}00.000 €`, fahrraddiebstahl: `bis ${i + 1}0.000 €`, "online-betrug": `bis ${i + 1}0.000 €`, aussenversicherung: `1${i} Monate weltw.` };
    t.bausteinStatus = { fahrrad: "optional", glas: "optional" };
    t.bausteine = { fahrrad: { an: i % 2 === 0, beitrag: 12.34 }, glas: { an: true, beitrag: 10.99 } };
  });
  return a;
}

async function messen(a: Tarifauswahl) {
  const fs = folien(termin, zuAngebote(a), markeFuer({ name: "Allianz Agentur Max Berger" }));
  const vgl = fs.filter((f) => f.id.startsWith("vergleich-"));
  const page = await browser!.newPage({ viewport: { width: 1280, height: 720 } });
  await page.setContent(praesentationHtml(vgl, markeFuer({ name: "Allianz Agentur Max Berger" }), "Test"));
  const r = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(".slide")].map((s) => {
      const inhalt = s.querySelector<HTMLElement>(":scope > .inhalt")!;
      const zoom = inhalt.style.zoom;
      inhalt.style.removeProperty("zoom");
      const sr = s.getBoundingClientRect();
      return {
        zoom,
        unten: inhalt.getBoundingClientRect().bottom - sr.top,
        fuss: s.querySelector<HTMLElement>(":scope > .foot")!.getBoundingClientRect().top - sr.top,
        spalten: s.querySelectorAll(".vgl thead th").length - 1,
        zeilen: s.querySelectorAll(".vgl tbody tr").length,
        bausteine: Math.max(...[...s.querySelectorAll(".vgl tbody td")].map((td) => td.querySelectorAll(".bs").length)),
        breiter: inhalt.scrollWidth > inhalt.clientWidth + 1,
      };
    }),
  );
  await page.close();
  return r;
}

describe("Vergleichsfolie passt (Chromium)", () => {
  it("3 Tarife, 5 Merkmale, 2 Bausteine: nichts unter der Fußzeile, kein Verkleinern", async (ctx) => {
    if (!browser) return ctx.skip();
    const [f] = await messen(maximal(3));
    expect(f.spalten).toBe(3);
    expect(f.zeilen).toBe(6); // 5 Merkmale + Bausteine
    expect(f.bausteine).toBe(2);
    expect(f.unten).toBeLessThanOrEqual(f.fuss);
    expect(f.breiter).toBe(false);
    expect(f.zoom).toBe("");
  });

  it("4 Stufen: eine Merkmalzeile weniger, nichts unter der Fußzeile", async (ctx) => {
    if (!browser) return ctx.skip();
    const [f] = await messen(maximal(4));
    expect(f.spalten).toBe(4);
    expect(f.zeilen).toBe(5); // 4 Merkmale + Bausteine
    expect(f.unten).toBeLessThanOrEqual(f.fuss);
    expect(f.breiter).toBe(false);
    expect(f.zoom).toBe("");
  });
});
