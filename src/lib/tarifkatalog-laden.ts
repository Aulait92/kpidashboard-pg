// Tarifkatalog von der Platte laden (data/tarifkatalog/, per Commit gepflegt; Format: lib/tarifkatalog.ts).
// Zur Laufzeit gelesen, kein DB-Seed. Im Betrieb einmal je Prozess (neuer Stand = neuer Deploy), in der
// Entwicklung bei jedem Aufruf. Anderer Ordner (Tests, lokal): TARIFKATALOG_DIR.

import fs from "node:fs";
import path from "node:path";
import { katalogAus, type Katalog } from "@/lib/tarifkatalog";

const cache = new Map<string, Katalog>();

export function tarifkatalogOrdner(): string {
  return process.env.TARIFKATALOG_DIR ? path.resolve(process.env.TARIFKATALOG_DIR) : path.join(process.cwd(), "data", "tarifkatalog");
}

const lesen = (datei: string): unknown => {
  try {
    return JSON.parse(fs.readFileSync(datei, "utf8"));
  } catch {
    return null;
  }
};

/** Katalog aus einem Ordner (schema.json plus <gesellschaft>/<sparte>.json). Fehlt der Ordner: eingebautes Schema, keine Tarife. */
export function ladeTarifkatalog(ordner = tarifkatalogOrdner()): Katalog {
  const merken = process.env.NODE_ENV === "production";
  const hit = merken ? cache.get(ordner) : undefined;
  if (hit) return hit;
  const dateien: { gesellschaft: string; sparte: string; json: unknown }[] = [];
  let eintraege: fs.Dirent[] = [];
  try {
    eintraege = fs.readdirSync(ordner, { withFileTypes: true });
  } catch {
    eintraege = [];
  }
  for (const g of eintraege) {
    if (!g.isDirectory() || g.name.startsWith(".")) continue;
    for (const f of fs.readdirSync(path.join(ordner, g.name))) {
      if (!f.endsWith(".json")) continue;
      dateien.push({ gesellschaft: g.name, sparte: f.replace(/\.json$/, ""), json: lesen(path.join(ordner, g.name, f)) });
    }
  }
  const k = katalogAus(lesen(path.join(ordner, "schema.json")), dateien);
  if (merken) cache.set(ordner, k);
  return k;
}
