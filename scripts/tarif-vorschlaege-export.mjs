#!/usr/bin/env node
// Übernommene Vorschläge der Vermittler in die Katalogdateien schreiben (Ole, 18.11.2026, lib/tarif-vorschlaege*.ts).
//
//   1. Admin › Einstellungen › Tarifkatalog › „Export“ lädt tarif-vorschlaege-<datum>.json herunter.
//   2. node scripts/tarif-vorschlaege-export.mjs tarif-vorschlaege-<datum>.json            zeigt, was sich ändert
//      node scripts/tarif-vorschlaege-export.mjs tarif-vorschlaege-<datum>.json --schreiben schreibt die Dateien
//   3. Tests (tarifkatalog-daten, vergleichsfolie-passt) laufen lassen, committen. Die Überlagerung in der Datenbank
//      darf danach bleiben (gleicher Wert), oder der Eintrag wird im Admin zurückgenommen.
//
// Je Wert: werte[merkmal] setzen und einen Vermerk in „offen“ ergänzen („von N Vermittlern bestätigt“). ungeprueft
// bleibt (gilt je Tarif; für VHV, LVM, Haftpflichtkasse und Provinzial verlangt der Datentest es). Neue Tarifnamen
// werden nicht geschrieben, sondern als Entwurf ausgegeben (Ole, 18.11.2026): Name und die Werte, die Vermittler dazu
// eingetragen haben (werteEntwurf, je Merkmal der häufigste), ungeprüft. Stufe und Quelle gehören in eine Recherche.
// Anderer Ordner: TARIFKATALOG_DIR.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "../..");
const MAX_WERT = 24;

export const slug = (s) =>
  s
    .toLocaleLowerCase("de")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Gedankenstriche (zwischen Wörtern) durch Komma ersetzen, Bis-Striche zwischen Zahlen bleiben. */
const ohneStriche = (t) => t.replace(/(\d)\s*[–—]\s*(\d)/g, "$1\u0000$2").replace(/\s*[–—]\s*/g, ", ").replace(/\u0000/g, "–").trim();

/** Tarif in der Datei zur Katalog-ID (wie lib/tarifkatalog.ts parseTarifDatei: Kurzname, sonst Name). */
const tarifZurId = (datei, id) => datei.tarife.find((t) => `${id.split("/").slice(0, 2).join("/")}/${slug(t.kurz ?? "") || slug(t.name ?? "")}` === id);

/**
 * Entwurf eines neuen Tarifs aus dem Export (nur Ausgabe, wird nie in die Katalogdatei geschrieben): Name, Werte der
 * Vermittler (ohne Gedankenstriche, höchstens MAX_WERT Zeichen), ungeprüft, Vermerk in „offen“. null ohne Werte.
 */
export function entwurf(n) {
  const werte = {};
  for (const [merkmal, w] of Object.entries(n.werteEntwurf ?? {})) {
    const wert = ohneStriche(String(w?.wert ?? ""));
    if (wert && wert.length <= MAX_WERT) werte[merkmal] = wert;
  }
  if (!Object.keys(werte).length) return null;
  return { name: n.name, werte, ungeprueft: true, entwurf: true, offen: [`Werte von ${n.vermittler} ${n.vermittler === 1 ? "Vermittler" : "Vermittlern"} eingetragen, bitte prüfen (Stufe, Quelle).`] };
}

/** Änderungen berechnen (ohne zu schreiben): je Datei der neue Inhalt und eine Liste für die Ausgabe. */
export function anwenden(exportDaten, ordner) {
  const dateien = new Map();
  const meldungen = [];
  for (const w of exportDaten.werte ?? []) {
    const pfad = join(ordner, w.datei);
    if (!existsSync(pfad)) {
      meldungen.push(`fehlt: ${w.datei}`);
      continue;
    }
    const j = dateien.get(pfad) ?? JSON.parse(readFileSync(pfad, "utf8"));
    const t = tarifZurId(j, w.tarifId);
    if (!t) {
      meldungen.push(`Tarif nicht gefunden: ${w.tarifId}`);
      continue;
    }
    const wert = ohneStriche(String(w.wert ?? ""));
    if (!wert || wert.length > MAX_WERT) {
      meldungen.push(`übersprungen (leer oder länger als ${MAX_WERT} Zeichen): ${w.tarifId} ${w.merkmal}`);
      continue;
    }
    const alt = t.werte?.[w.merkmal] ?? null;
    t.werte = { ...(t.werte ?? {}), [w.merkmal]: wert };
    const datum = String(w.uebernommenAm ?? "").slice(0, 10);
    const vermerk = `${t.kurz}: ${w.merkmal} „${wert}“ von ${w.vermittler} ${w.vermittler === 1 ? "Vermittler" : "Vermittlern"} eingetragen, im Admin übernommen am ${datum}.`;
    j.offen = [...(Array.isArray(j.offen) ? j.offen : []).filter((o) => o !== vermerk), vermerk];
    dateien.set(pfad, j);
    meldungen.push(`${w.datei} ${t.kurz} ${w.merkmal}: ${alt ?? "(leer)"} → ${wert}`);
  }
  const entwuerfe = [];
  for (const n of exportDaten.neueTarife ?? []) {
    meldungen.push(`neuer Tarifname (bitte recherchieren): ${n.datei} „${n.name}“ (${n.vermittler} Vermittler)`);
    const e = entwurf(n);
    if (e) {
      entwuerfe.push({ datei: n.datei, tarif: e });
      meldungen.push(`  Entwurf: ${JSON.stringify(e)}`);
    }
  }
  return { dateien, meldungen, entwuerfe };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const datei = process.argv[2];
  if (!datei) {
    console.error("Aufruf: node scripts/tarif-vorschlaege-export.mjs <export.json> [--schreiben]");
    process.exit(1);
  }
  const ordner = process.env.TARIFKATALOG_DIR ? resolve(process.env.TARIFKATALOG_DIR) : join(ROOT, "data", "tarifkatalog");
  const { dateien, meldungen } = anwenden(JSON.parse(readFileSync(datei, "utf8")), ordner);
  for (const m of meldungen) console.log(m);
  if (process.argv.includes("--schreiben")) {
    for (const [pfad, j] of dateien) writeFileSync(pfad, `${JSON.stringify(j, null, 2)}\n`);
    console.log(`${dateien.size} Datei(en) geschrieben.`);
  } else console.log(`Probelauf: ${dateien.size} Datei(en) würden geändert. Mit --schreiben schreiben.`);
}
