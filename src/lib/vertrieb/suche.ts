// Suche im Vertrieb (Ole, 16.11.2026: „Dröge“ fand den Kontakt „Christina Droege“ nicht).
// Umlaute in beide Richtungen: ö = oe, ü = ue, ä = ae, ß = ss. Gesucht wird in Agentur/Firma,
// Vor- und Nachname, Inhabern, E-Mail (auch weiteren Adressen), Ort und Telefon.
import type { Prisma } from "@/generated/prisma/client";

const TO_DIGRAPH: Record<string, string> = { ä: "ae", ö: "oe", ü: "ue", ß: "ss" };
const TO_UMLAUT: Record<string, string> = { ae: "ä", oe: "ö", ue: "ü", ss: "ß" };
/** Ab so vielen Umlaut-Stellen nur noch „alles Umlaut“ und „alles Umschreibung“ (sonst 2^n Varianten). */
const MAX_SITES = 4;

/** Kleinschreibung, Umlaute als Umschreibung: „Dröge“ → „droege“, „Straße“ → „strasse“. */
export function normalisiereUmlaute(s: string): string {
  return s.toLowerCase().replace(/[äöüß]/g, (c) => TO_DIGRAPH[c]);
}

/** Text in feste Teile und Umlaut-Stellen (je zwei Schreibweisen) zerlegen. */
function sites(term: string): (string | [string, string])[] {
  const s = term.toLowerCase();
  const out: (string | [string, string])[] = [];
  let plain = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const pair = s.slice(i, i + 2);
    let site: [string, string] | null = null;
    if (TO_DIGRAPH[c]) site = [c, TO_DIGRAPH[c]];
    else if (TO_UMLAUT[pair]) {
      site = [pair, TO_UMLAUT[pair]];
      i++;
    }
    if (!site) {
      plain += c;
      continue;
    }
    if (plain) out.push(plain);
    plain = "";
    out.push(site);
  }
  if (plain) out.push(plain);
  return out;
}

/**
 * Schreibweisen eines Suchbegriffs (klein geschrieben, ohne Doppelte): „Dröge“ → dröge, droege;
 * „Droege“ → droege, dröge. Ein Datensatz passt, wenn er eine der Varianten enthält.
 */
export function umlautVarianten(term: string): string[] {
  const parts = sites(term.trim());
  const n = parts.filter((p) => typeof p !== "string").length;
  if (!n) return [term.trim().toLowerCase()].filter(Boolean);
  const pick = (choose: (k: number) => 0 | 1) => {
    let k = 0;
    return parts.map((p) => (typeof p === "string" ? p : p[choose(k++)])).join("");
  };
  const out = new Set<string>([pick(() => 0), pick(() => 1)]);
  out.add(normalisiereUmlaute(term.trim()));
  if (n <= MAX_SITES) {
    for (let mask = 0; mask < 1 << n; mask++) out.add(pick((k) => ((mask >> k) & 1) as 0 | 1));
  }
  // alle Umlaute (aus beiden Richtungen) als Umlaut geschrieben
  out.add(parts.map((p) => (typeof p === "string" ? p : TO_DIGRAPH[p[0]] ? p[0] : p[1])).join(""));
  return [...out].filter(Boolean);
}

/** Passt der Text zum Suchbegriff? (gleiche Regel wie die Datenbank-Suche, für Listen im Speicher und Tests) */
export function passtZurSuche(text: string | null | undefined, term: string): boolean {
  if (!text) return false;
  return normalisiereUmlaute(text).includes(normalisiereUmlaute(term.trim()));
}

const TEXT_FIELDS = ["name", "firstName", "lastName", "leaderNames", "email", "city"] as const;

/** Ein Wort in einem der Textfelder, in jeder Umlaut-Schreibweise. */
function textMatch(term: string): Prisma.SalesContactWhereInput[] {
  return umlautVarianten(term).flatMap((v) => TEXT_FIELDS.map((f) => ({ [f]: { contains: v, mode: "insensitive" as const } }) as Prisma.SalesContactWhereInput));
}

/**
 * Filter für die Kontaktsuche (Kontaktliste und globale Suche): ganzer Begriff in einem Feld,
 * bei mehreren Wörtern jedes Wort in irgendeinem Feld („Christina Dröge“, „Dröge Detmold“),
 * E-Mail auch unter den weiteren Adressen, Telefon ab 4 Ziffern.
 */
export function kontaktSucheWhere(q: string): Prisma.SalesContactWhereInput {
  const term = q.trim().slice(0, 120);
  if (!term) return {};
  const words = term.split(/\s+/).filter(Boolean);
  const or: Prisma.SalesContactWhereInput[] = [...textMatch(term)];
  if (words.length > 1) or.push({ AND: words.map((w) => ({ OR: textMatch(w) })) });
  const lower = term.toLowerCase();
  if (lower.includes("@") && !/\s/.test(lower)) or.push({ altEmails: { has: lower } });
  const digits = term.replace(/\D/g, "");
  if (digits.length >= 4 && /^[\d\s+()/.-]+$/.test(term)) or.push({ phone: { contains: term } }, { phone: { contains: digits.slice(-6) } });
  return { OR: or };
}

/** Name in jeder Umlaut-Schreibweise (für Kunden und Leads in der globalen Suche). */
export function nameVarianten<F extends string>(field: F, q: string): Record<F, { contains: string; mode: "insensitive" }>[] {
  return umlautVarianten(q).map((v) => ({ [field]: { contains: v, mode: "insensitive" as const } }) as Record<F, { contains: string; mode: "insensitive" }>);
}
