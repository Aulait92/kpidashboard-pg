// Platzhalter in E-Mail-Vorlagen (rein, auch im Browser nutzbar).

import { a, anredeZeile, kontaktParts, type AnredeKontakt, type Ansprache } from "@/lib/ansprache";

export const PLATZHALTER = ["{anrede}", "{vorname}", "{nachname}", "{name}", "{produkt}", "{terminlink}", "{meinname}", "{signatur}"] as const;

/**
 * Platzhalter, die der Dialog „E-Mail schreiben“ aus eigenen Feldern füllt (Ole, 14.11.2026).
 * Steht einer davon in einer Vorlage, zeigt der Dialog das passende Feld (auch in eigenen Vorlagen).
 */
export const ZUSATZ_PLATZHALTER = [
  "{termin_datum}",
  "{termin_art}",
  "{videolink}",
  "{termin_unterlagen}",
  "{fehlende_unterlagen}",
  "{melde_datum}",
  "{versicherer}",
  "{vertragsnummer}",
  "{kuendigungstermin}",
  "{musterkuendigung}",
  "{wuensche}",
  "{rat}",
] as const;

export type ZusatzKey = (typeof ZUSATZ_PLATZHALTER)[number] extends `{${infer K}}` ? K : never;

export type Werte = {
  vorname: string;
  name: string;
  produkt: string;
  meinname: string;
  signatur?: string;
  /** Nachname (letztes Wort des Namens) */
  nachname?: string;
  /** Begrüßung je Ansprache (ohne Komma): „Hallo Anna“ bzw. „Guten Tag Frau Beispiel“ / „Guten Tag Anna Beispiel“ / „Guten Tag“ */
  anrede?: string;
  /** Persönlicher Buchungslink; leer = Satz mit {terminlink} entfällt (z. B. Termin steht schon) */
  terminlink?: string | null;
} & Partial<Record<ZusatzKey, string | null>>;

/** Ohne eigene Signatur steht an ihrer Stelle ein schlichter Gruß (Ole, 14.11.2026: Signatur standardmäßig in den Vorlagen). */
export const GRUSS_OHNE_SIGNATUR = "Viele Grüße\n{meinname}";

/** Platzhalter, deren ganzer Satz entfällt, wenn sie leer sind (Link fehlt). */
const SATZ_ENTFAELLT = ["terminlink", "videolink"] as const;

/** Satz mit {key} entfernen (z. B. kein Terminlink, weil der Termin schon steht). */
function ohneSatzMit(text: string, key: string): string {
  const re = new RegExp(`[^.!?\\n]*\\{${key}\\}[^\\n.!?]*[.!?]?[ \\t]*`, "g");
  return text
    .replace(re, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

export function fuelle(text: string, w: Werte): string {
  const sig = (w.signatur ?? "").trim();
  let base = text;
  for (const k of SATZ_ENTFAELLT) if (!(w[k] ?? "").trim()) base = ohneSatzMit(base, k);
  base = base.replace(/\{signatur\}/g, sig ? "{signatur}" : GRUSS_OHNE_SIGNATUR);
  const fest: Record<string, () => string> = {
    anrede: () => w.anrede ?? `Hallo ${w.vorname}`.trim(),
    vorname: () => w.vorname,
    nachname: () => w.nachname ?? "",
    name: () => w.name,
    produkt: () => w.produkt,
    terminlink: () => (w.terminlink ?? "").trim(),
    meinname: () => w.meinname,
    signatur: () => sig,
  };
  // Ein Durchgang: eingesetzte Werte (z. B. die Musterkündigung) werden nicht noch einmal ersetzt.
  return base.replace(/\{([a-z_]+)\}/g, (all, k: string) => {
    if (k in fest) return fest[k]();
    if ((ZUSATZ_PLATZHALTER as readonly string[]).includes(`{${k}}`)) return (w[k as ZusatzKey] ?? "").trim();
    return all;
  });
}

/**
 * Text einer Vorlage mit Signatur (Ole, 14.11.2026): steht {signatur} in der Vorlage, dort –
 * sonst automatisch darunter (nach einer Leerzeile). Ohne Signatur unverändert.
 */
export function fuelleMitSignatur(text: string, w: Werte): string {
  const filled = fuelle(text, w);
  const sig = (w.signatur ?? "").trim();
  if (!sig || text.includes("{signatur}")) return filled;
  return `${filled.trimEnd()}\n\n${sig}`;
}

/**
 * Werte für einen Lead (Vorname = erstes Wort des Namens). {anrede} nach der Regel in lib/ansprache.ts;
 * Herr/Frau nur, wenn bekannt (salutation, z. B. aus dem Formularfeld Anrede), nie geraten.
 */
export function werteFuer(
  lead: { name: string | null; source: string | null } & Pick<AnredeKontakt, "firstName" | "lastName" | "salutation">,
  meinname: string,
  opts: { ansprache?: Ansprache; terminlink?: string | null } = {},
): Werte {
  const name = (lead.name ?? "").trim();
  const kontakt: AnredeKontakt = { fullName: name, firstName: lead.firstName, lastName: lead.lastName, salutation: lead.salutation };
  const parts = kontaktParts(kontakt);
  return {
    vorname: parts.first,
    nachname: parts.last,
    name,
    produkt: (lead.source ?? "").trim() || (opts.ansprache === "du" ? "deine Versicherung" : "Ihre Versicherung"),
    meinname,
    anrede: anredeZeile(opts.ansprache ?? "sie", kontakt).replace(/,$/, ""),
    terminlink: opts.terminlink ?? null,
  };
}

/** Text enthält einen Terminlink? (für „Erinnern, falls kein Termin gebucht wird“) */
export function hatTerminlink(text: string, link: string | null | undefined): boolean {
  return !!link && text.includes(link);
}

/** Welche Zusatz-Platzhalter eine Vorlage nutzt (der Dialog zeigt dafür Felder). */
export function zusatzIn(...texte: string[]): Set<ZusatzKey> {
  const all = texte.join("\n");
  return new Set(ZUSATZ_PLATZHALTER.filter((p) => all.includes(p)).map((p) => p.slice(1, -1) as ZusatzKey));
}

// ─── Werte für die Zusatz-Platzhalter ─────────────────────────────────────────

const TZ = "Europe/Berlin";

/** „Dienstag, 17. November um 14:00 Uhr“ (Jahr nur, wenn nicht dieses Jahr). */
export function terminDatumText(startsAt: Date, now = new Date()): string {
  const year = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: TZ, year: "numeric" }).format(d);
  const tag = new Intl.DateTimeFormat("de-DE", {
    timeZone: TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(year(startsAt) !== year(now) ? { year: "numeric" } : {}),
  }).format(startsAt);
  const zeit = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(startsAt);
  return `${tag} um ${zeit} Uhr`;
}

/** „am Telefon“ bzw. „per Videocall“. */
export function terminArtText(mode: string | null | undefined): string {
  return mode === "video" ? "per Videocall" : "am Telefon";
}

/** Kalendertag (YYYY-MM-DD) als „Montag, 7. Dezember“ (Jahr nur, wenn nicht dieses Jahr). */
export function tagText(dayKey: string, now = new Date()): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!m) return "";
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12));
  const thisYear = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, year: "numeric" }).format(now);
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(m[1] !== thisYear ? { year: "numeric" } : {}),
  }).format(d);
}

/** Kalendertag (YYYY-MM-DD) als „31.12.2026“. */
export function datumKurz(dayKey: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "";
}

const liste = (items: string[]) => items.map((x) => `• ${x}`).join("\n");

export type ProduktArt = "tier" | "sach" | "sonst";

/** Grobe Art des Produkts für „Was bereitliegen sollte“ (Tier, Sach, sonst). */
export function produktArt(produkt: string | null | undefined): ProduktArt {
  const p = (produkt ?? "").toLowerCase();
  if (p.includes("futter")) return "sonst";
  if (/\btkv\b|tier|hund|katze|pferd/.test(p)) return "tier";
  if (/hausrat|haftpflicht|geb[äa]ude|rechtsschutz|privatschutz|unfall|kfz|\bauto|sach|glas|elementar/.test(p)) return "sach";
  return "sonst";
}

/** {termin_unterlagen}: was zum Termin bereitliegen sollte, je Produkt. */
export function terminUnterlagen(produkt: string | null | undefined, an: Ansprache): string {
  const art = produktArt(produkt);
  const items: string[] = [];
  if (art === "tier") items.push("Tierpass bzw. Chipnummer", "Tierarztrechnungen der letzten Zeit, falls vorhanden");
  if (art === "sach")
    items.push(
      a(an, "deine bisherige Police mit Ablaufdatum, falls vorhanden", "Ihre bisherige Police mit Ablaufdatum, falls vorhanden"),
      "Geburtsdaten aller Personen, die mitversichert werden sollen",
    );
  items.push(a(an, "deine IBAN, falls du direkt abschließen möchtest", "Ihre IBAN, falls Sie direkt abschließen möchten"));
  return liste(items);
}

/** Auswahl im Dialog „Unterlagen fehlen noch“ (neutral formuliert, passt zu Du und Sie). */
export const UNTERLAGEN_OPTIONEN = [
  "IBAN für den Beitragseinzug",
  "Bisherige Police bzw. Versicherungsnummer",
  "Gewünschter Versicherungsbeginn",
  "Geburtsdaten der zu versichernden Personen",
  "Unterschriebener Antrag",
  "Kündigungsbestätigung des bisherigen Versicherers",
  "Tierpass bzw. Chipnummer",
  "Tierarztrechnungen der letzten Zeit",
] as const;

/** {fehlende_unterlagen}: gewählte Punkte als Liste (leere Einträge fallen weg). */
export function fehlendeUnterlagen(items: readonly string[]): string {
  return liste(items.map((x) => x.trim()).filter(Boolean));
}

/** Musterkündigung (Brief des Kunden an den bisherigen Versicherer, daher ohne Du/Sie-Wechsel). */
export function musterKuendigung(f: { name: string; versicherer?: string | null; vertragsnummer?: string | null; kuendigungstermin?: string | null }): string {
  const termin = f.kuendigungstermin?.trim();
  const zum = termin ? `zum ${termin}, hilfsweise zum nächstmöglichen Zeitpunkt` : "zum nächstmöglichen Zeitpunkt";
  return [
    "Musterkündigung",
    "",
    `An: ${f.versicherer?.trim() || "[Name des bisherigen Versicherers]"}`,
    `Versicherungsnehmer: ${f.name.trim() || "[Ihr Name]"}`,
    `Vertragsnummer: ${f.vertragsnummer?.trim() || "[Vertragsnummer]"}`,
    "",
    "Kündigung meines Versicherungsvertrags",
    "",
    "Sehr geehrte Damen und Herren,",
    "",
    `hiermit kündige ich den oben genannten Vertrag fristgerecht ${zum}. Bitte bestätigen Sie mir die Kündigung und das Vertragsende schriftlich.`,
    "",
    "Mit freundlichen Grüßen",
    "",
    f.name.trim() || "[Ihr Name]",
    "[Anschrift, Ort, Datum, Unterschrift]",
  ].join("\n");
}
