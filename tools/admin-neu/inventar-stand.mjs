#!/usr/bin/env node
// Inventar-Stand des neuen Admins fortschreiben (docs/ux/admin-neu/README.md, Abschnitt „Abnahme“).
//
//   node tools/admin-neu/inventar-stand.mjs          schreibt id, bereich, status_neu, ort_neu ins Inventar
//   node tools/admin-neu/inventar-stand.mjs --check  ändert nichts, Exit 1 wenn das Inventar nicht aktuell ist
//
// - id: stabil, einmal vergeben bleibt sie (auch wenn sich der Text ändert). Neu: Slug aus quelle + funktion.
// - status_neu: „vorhanden“, wenn die id als data-funktion (bzw. als String) im Quelltext unter
//   src/app/admin/neu oder src/components/admin-neu steht; „bleibt“ für Funktionen ohne Oberfläche
//   (BLEIBT in src/lib/admin-neu/offen/index.ts); „entfernt“ für die Liste ENTFERNT (Admin v2 A4); sonst „offen“.
// - ort_neu: Dateien, in denen die id steht.
// Bei Merge-Konflikten im Inventar: eine Seite nehmen und das Skript neu laufen lassen.

import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "../../..");
const INVENTAR = join(ROOT, "docs/ux/admin-neu/funktionsinventar.json");
const QUELLEN = ["src/app/admin/neu", "src/components/admin-neu"];

export function slug(s) {
  return s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Kurzname der Quelle: Symbol hinter „:“ (erster Teil), sonst Dateiname ohne Endung. */
function quelleKurz(quelle) {
  const erste = quelle.split(",")[0].trim();
  const [datei, symbol] = erste.split(":");
  if (symbol) return slug(`${datei.split("/").pop().replace(/\.[a-z]+$/, "")}-${symbol.split("/")[0]}`);
  return slug(datei.split("/").pop().replace(/\.[a-z]+$/, ""));
}

/** Funktion auf höchstens 48 Zeichen an Wortgrenzen. */
function funktionKurz(funktion) {
  const teile = slug(funktion).split("-");
  let out = "";
  for (const t of teile) {
    if ((out ? out.length + 1 : 0) + t.length > 48) break;
    out = out ? `${out}-${t}` : t;
  }
  return out || teile[0];
}

export function neueId(e) {
  return `${quelleKurz(e.quelle)}--${funktionKurz(e.funktion)}`;
}

/**
 * Rolle (Bereich in navigation.ts, Admin v2) aus der Demo-Ansicht. Muss zu navigation.ts passen
 * (Test „Bereich im Inventar = Bereich der Seite“ in tests/unit/admin-neu-inventar.test.ts).
 */
export function bereichFuer(view) {
  if (view === "landkarte") return "was-wo-ist";
  if (["heute", "mehr", "vertrieb-aufgaben"].includes(view)) return "mein-tag";
  // Werkzeuge und Einstellungen zusammengelegt (20.11.2026): Technik ist eine Gruppe der Einstellungen
  if (view.startsWith("e-") || view.startsWith("w-") || view === "einstellungen" || view === "werkzeuge") return "einstellungen";
  if (view.startsWith("vertrieb") || view.startsWith("kontakt") || view === "angebot-neu" || view === "praesentation" || view.startsWith("marketing")) return "verkaufen";
  if (view === "leads-chats" || view === "leads-chat" || view === "leads-ki" || view === "zahlen-qualitaet" || view.startsWith("kunde")) return "betreuen";
  if (view.startsWith("leads")) return "liefern";
  if (view.startsWith("zahlen")) return "geld";
  return "mein-tag";
}

function dateien(dir) {
  let out = [];
  let eintraege = [];
  try {
    eintraege = readdirSync(dir);
  } catch {
    return out;
  }
  for (const n of eintraege) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out = out.concat(dateien(p));
    else if (/\.(tsx?|mjs)$/.test(n)) out.push(p);
  }
  return out;
}

/** Alle Wörter aus String-Literalen der neuen Oberfläche → Dateien (Schreibweise: data-funktion="id"). */
export function fundstellen(root = ROOT) {
  const map = new Map();
  for (const q of QUELLEN) {
    for (const f of dateien(join(root, q))) {
      const text = readFileSync(f, "utf8");
      for (const m of text.matchAll(/["'`]([^"'`\n]*)["'`]/g)) {
        for (const w of m[1].split(/\s+/)) {
          if (!w.includes("--")) continue;
          const rel = relative(root, f);
          if (!map.has(w)) map.set(w, new Set());
          map.get(w).add(rel);
        }
      }
    }
  }
  return map;
}

/** Liste („BLEIBT“, „ENTFERNT“) aus src/lib/admin-neu/offen/index.ts lesen (ohne TS-Import). */
function liste(name, root = ROOT) {
  const text = readFileSync(join(root, "src/lib/admin-neu/offen/index.ts"), "utf8");
  const block = new RegExp(`export const ${name}[^=]*=\\s*\\[([\\s\\S]*?)\\];`).exec(text)?.[1] ?? "";
  return new Set([...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]));
}
const bleibt = (root = ROOT) => liste("BLEIBT", root);

export function stand(inventar, root = ROOT) {
  const fund = fundstellen(root);
  const bl = bleibt(root);
  const weg = liste("ENTFERNT", root);
  const vergeben = new Set(inventar.filter((e) => e.id).map((e) => e.id));
  return inventar.map((e) => {
    let id = e.id;
    if (!id) {
      const basis = neueId(e);
      id = basis;
      for (let i = 2; vergeben.has(id); i++) id = `${basis}-${i}`;
      vergeben.add(id);
    }
    const orte = [...(fund.get(id) ?? [])].sort();
    const status_neu = orte.length ? "vorhanden" : weg.has(id) ? "entfernt" : bl.has(id) ? "bleibt" : "offen";
    const { id: _a, bereich: _b, status_neu: _c, ort_neu: _d, ...rest } = e;
    return { ...rest, id, bereich: bereichFuer(e.demo_view), status_neu, ort_neu: orte.join(", ") };
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const alt = readFileSync(INVENTAR, "utf8");
  const neu = `${JSON.stringify(stand(JSON.parse(alt)), null, 1)}\n`;
  if (process.argv.includes("--check")) {
    if (alt !== neu) {
      console.error("Inventar nicht aktuell: node tools/admin-neu/inventar-stand.mjs ausführen und mit committen.");
      process.exit(1);
    }
    console.log("Inventar aktuell.");
  } else {
    writeFileSync(INVENTAR, neu);
    const s = JSON.parse(neu);
    const z = (st) => s.filter((e) => e.status_neu === st).length;
    console.log(`Inventar geschrieben: ${s.length} Funktionen, vorhanden ${z("vorhanden")}, offen ${z("offen")}, bleibt ${z("bleibt")}, entfernt ${z("entfernt")}.`);
  }
}
