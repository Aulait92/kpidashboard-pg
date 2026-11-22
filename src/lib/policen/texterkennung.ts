// Texterkennung hochgeladener Unterlagen auf unserem Server (Ole, 22.11.2026: „checken, ob Fahrzeugschein und Rechnung
// schon hochgeladen sind, sonst auffordern“). Ohne Drittanbieter: Tesseract als Systempaket (Dockerfile), PDFs über die
// Textebene (unpdf). Datenschutz-Prüfung 22.11.2026: KI-Einordnung ohne ZDR-Nachweis Rot (K2), lokale Texterkennung
// Grün. Nur bei Einwilligung MIT KI (ohne KI heißt „wir lesen nichts automatisch aus“). Der Text wird nie gespeichert
// oder geloggt; gespeichert wird nur die Dokumentart (LeadDocument.dokumentArt) und, wenn noch leer, die Sparte.
// Schalter POLICEN_TEXTERKENNUNG=aus.

import { execFile } from "node:child_process";
import { spartenImText } from "@/lib/policen/auslesen/sparte";
import type { AuslesenSparte } from "@/lib/policen/auslesen/felder";
import type { Sparte } from "@/lib/policen/regeln";

export type DokumentArt = "fahrzeugschein" | "kfz_police" | "police";

const TIMEOUT_MS = 25_000;
const MAX_BYTES = 15 * 1024 * 1024;

export const texterkennungAn = (env: Record<string, string | undefined> = process.env) => (env.POLICEN_TEXTERKENNUNG ?? "an").toLowerCase() !== "aus";

/** Text eines Bildes per Tesseract (Deutsch), "" bei Fehler, fehlendem Programm oder Zeitüberschreitung. */
export function bildText(data: Uint8Array): Promise<string> {
  if (!data.length || data.length > MAX_BYTES) return Promise.resolve("");
  return new Promise((resolve) => {
    try {
      const p = execFile("tesseract", ["stdin", "stdout", "-l", "deu", "--psm", "3"], { timeout: TIMEOUT_MS, maxBuffer: 2 * 1024 * 1024, encoding: "utf8" }, (err, stdout) =>
        resolve(err ? "" : String(stdout ?? "").slice(0, 20_000)),
      );
      p.on("error", () => resolve(""));
      p.stdin?.on("error", () => {});
      p.stdin?.end(Buffer.from(data));
    } catch {
      resolve("");
    }
  });
}

/** Text einer Unterlage: PDF über die Textebene (erste Seite), sonst Tesseract. */
export async function unterlageText(data: Uint8Array, typ: string): Promise<string> {
  if (typ === "application/pdf") {
    const { ersteSeiteText } = await import("@/lib/policen/auslesen/sparte");
    const t = await ersteSeiteText(data);
    // Gescannte PDF ohne Textebene: nicht weiter (Seite in ein Bild umwandeln wäre der nächste Schritt)
    return t;
  }
  return bildText(data);
}

const FAHRZEUGSCHEIN_RE = /zulassungsbescheinigung|fahrzeugschein|registration certificate/i;
const FAHRZEUGSCHEIN_FELDER: RegExp[] = [/fahrzeug-?\s?ident/i, /amtliches\s+kennzeichen/i, /erstzulassung|datum\s+der\s+erstzul/i, /hubraum/i, /\bhalter\b|halterin/i, /typ\s?schl|herst(eller)?\s?schl/i];

/**
 * Dokumentart aus dem erkannten Text, null = nicht erkannt (zu unscharf bzw. etwas anderes). Fahrzeugschein am Titel
 * oder an mindestens drei typischen Feldern; Kfz-Police bzw. -Rechnung an den Kfz-Stichworten (lib/policen/auslesen/sparte.ts).
 */
export function dokumentArt(text: string): { art: DokumentArt; sparte: AuslesenSparte | null } | null {
  const t = text.replace(/\s+/g, " ");
  if (t.length < 20) return null;
  if (FAHRZEUGSCHEIN_RE.test(t) || FAHRZEUGSCHEIN_FELDER.filter((re) => re.test(t)).length >= 3) return { art: "fahrzeugschein", sparte: "kfz" };
  const sparten = spartenImText(t);
  if (sparten.includes("kfz")) return { art: "kfz_police", sparte: "kfz" };
  if (sparten.length === 1) return { art: "police", sparte: sparten[0] };
  if (sparten.length > 1) return { art: "police", sparte: null };
  return null;
}

/** Sparte der Unterlage (lib/policen/regeln.ts SPARTEN) aus der Sparte des Auslesens; nur eindeutige Sach-Sparten. */
export function unterlagenSparte(s: AuslesenSparte | null): Sparte | null {
  if (!s) return null;
  const map: Partial<Record<AuslesenSparte, Sparte>> = { haftpflicht: "haftpflicht", hausrat: "hausrat", wohngebaeude: "wohngebaeude", kfz: "kfz", rechtsschutz: "rechtsschutz", tier: "tier" };
  return map[s] ?? null;
}

export type KfzStand = { schein: boolean; police: boolean };

/** Stand der Kfz-Unterlagen aus den Dokumentarten aller Unterlagen des Leads. */
export const kfzStand = (arten: readonly (string | null)[]): KfzStand => ({ schein: arten.includes("fahrzeugschein"), police: arten.includes("kfz_police") });
