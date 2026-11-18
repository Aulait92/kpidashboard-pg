// Platzhalter in E-Mail-Vorlagen (rein, auch im Browser nutzbar).

import { a, anredeName, anredeZeile, kontaktParts, type AnredeKontakt, type Ansprache, grusswort } from "@/lib/ansprache";
import { outreachProdukt } from "@/lib/whatsapp/erstanschreiben";
import { bereitlegenPunkte } from "@/lib/whatsapp/gespraech";

export const PLATZHALTER = [
  "{anrede}",
  "{vorname}",
  "{nachname}",
  "{name}",
  "{produkt}",
  "{terminlink}",
  "{meinname}",
  "{signatur}",
  // Stand 3 (Ole, 15.11.2026), automatisch gefüllt (werteFuer), im Text änderbar
  "{betreff_name}",
  "{ihr_produkt}",
  "{rueckruf_1}",
  "{rueckruf_2}",
  "{anruf_tag}",
  // Angebot nachfassen (Paket P3, Ole 17.11.2026): Link „Rückruf wünschen“ (/rueckruf/<token>), automatisch gefüllt;
  // ohne Link entfällt der Satz
  "{rueckruf_link}",
] as const;

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
  // „Wie besprochen“ Stand 4 (18.11.2026): „heute“ beim Neustart nach der Bedenkzeit, sonst „am Donnerstag, 26. November“
  "{melde_wann}",
  "{versicherer}",
  "{vertragsnummer}",
  "{kuendigungstermin}",
  "{musterkuendigung}",
  "{wuensche}",
  "{rat}",
  // Angebot: drei Vorteile, die der Vermittler im Dialog einträgt (Ole, 15.11.2026)
  "{vorteil_1}",
  "{vorteil_2}",
  "{vorteil_3}",
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
  /** Name vorn im Betreff mit Komma („Frau Schneider, “ bzw. „Anna, “), ohne bekannten Namen leer */
  betreff_name?: string;
  /** Produkt mit Possessiv („Ihrer Zahnzusatzversicherung“, „Ihrem Privatschutz“, sonst „Ihrer Anfrage“) */
  ihr_produkt?: string;
  /** Zwei Rückrufzeiten („heute um 17 Uhr“, „morgen um 10 Uhr“) */
  rueckruf_1?: string;
  rueckruf_2?: string;
  /** Tag des Anrufs nach dem Angebot („Donnerstag“) */
  anruf_tag?: string;
  /** Link „Rückruf wünschen“ (nur in automatischen Mails zum Angebot); leer = Satz entfällt */
  rueckruf_link?: string | null;
} & Partial<Record<ZusatzKey, string | null>>;

/** Ohne eigene Signatur steht an ihrer Stelle ein schlichter Gruß (Ole, 14.11.2026: Signatur standardmäßig in den Vorlagen). */
export const GRUSS_OHNE_SIGNATUR = "Viele Grüße\n{meinname}";

/** Platzhalter, deren ganzer Satz entfällt, wenn sie leer sind (Link fehlt). */
const SATZ_ENTFAELLT = ["terminlink", "videolink", "rueckruf_link"] as const;

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
    betreff_name: () => w.betreff_name ?? "",
    ihr_produkt: () => w.ihr_produkt ?? "",
    rueckruf_1: () => w.rueckruf_1 ?? "",
    rueckruf_2: () => w.rueckruf_2 ?? "",
    anruf_tag: () => w.anruf_tag ?? "",
    rueckruf_link: () => (w.rueckruf_link ?? "").trim(),
  };
  // Ein Durchgang: eingesetzte Werte (z. B. die Musterkündigung) werden nicht noch einmal ersetzt.
  const out = base.replace(/\{([a-z0-9_]+)\}/g, (all, k: string) => {
    if (k in fest) return fest[k]();
    if ((ZUSATZ_PLATZHALTER as readonly string[]).includes(`{${k}}`)) return (w[k as ZusatzKey] ?? "").trim();
    return all;
  });
  // Betreff ohne bekannten Namen: „Kurz zu Ihrer …“ statt „kurz zu Ihrer …“
  return text.startsWith("{betreff_name}") ? out.charAt(0).toUpperCase() + out.slice(1) : out;
}

const BERLIN = "Europe/Berlin";
const WOCHENTAG = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

/** Berliner Kalendertag und Stunde (rein). */
function berlinTag(d: Date): { dow: number; hour: number; key: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: BERLIN, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", weekday: "short" })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  return { dow, hour: Number(parts.hour), key: `${parts.year}-${parts.month}-${parts.day}` };
}

/** Nächster Werktag (Mo bis Fr) nach heute: Abstand in Tagen. */
function tageBisWerktag(dow: number, nach = 1): number {
  let d = 0;
  let n = 0;
  while (n < nach) {
    d++;
    const w = (dow + d) % 7;
    if (w !== 0 && w !== 6) n++;
  }
  return d;
}

const tagWort = (abstand: number, dow: number) => (abstand === 1 ? "morgen" : `am ${WOCHENTAG[(dow + abstand) % 7]}`);

/**
 * Zwei Rückrufzeiten für „Nicht erreicht“ (rein): werktags vor 15 Uhr „heute um 17 Uhr“ und „morgen um 10 Uhr“,
 * sonst der nächste Werktag um 10 und um 17 Uhr.
 */
export function rueckrufZeiten(now = new Date()): [string, string] {
  const t = berlinTag(now);
  const werktag = t.dow !== 0 && t.dow !== 6;
  const next = tageBisWerktag(t.dow);
  if (werktag && t.hour < 15) return ["heute um 17 Uhr", `${tagWort(next, t.dow)} um 10 Uhr`];
  const tag = tagWort(next, t.dow);
  return [`${tag} um 10 Uhr`, `${tag} um 17 Uhr`];
}

/** Tag des Anrufs nach dem Angebot (rein): zwei Werktage später, als Wochentag („Donnerstag“). */
export function anrufTag(now = new Date()): string {
  const t = berlinTag(now);
  return WOCHENTAG[(t.dow + tageBisWerktag(t.dow, 2)) % 7];
}

/** „Ihrer Zahnzusatzversicherung“, „Ihrem Privatschutz“; unbekannt → „Ihrer Anfrage“ (rein). */
export function ihrProdukt(produkt: string | null | undefined, an: Ansprache = "sie"): string {
  const raw = (produkt ?? "").replace(/\s*\(.*\)\s*$/, "").trim();
  // Bekannte Produkte mit lesbarem Namen („TKV-Katze“ → „Katzenversicherung“), wie im WhatsApp-Erstanschreiben
  const p = outreachProdukt(produkt)?.produkt ?? raw;
  const fem = a(an, "deiner", "Ihrer");
  const mask = a(an, "deinem", "Ihrem");
  if (!p || p.length > 40) return `${fem} Anfrage`;
  if (/(ung|ion|versicherung|rente|vorsorge)$/i.test(p)) return `${fem} ${p}`;
  if (/(schutz|plan|zusatz|geld|vertrag|tarif)$/i.test(p)) return `${mask} ${p}`;
  return `${fem} Anfrage zu ${p}`;
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
 * Herr/Frau aus dem Formularfeld Anrede bzw. der Korrektur im Kontakt, sonst aus einem eindeutigen Vornamen (Ole, 18.11.2026).
 */
export function werteFuer(
  lead: { name: string | null; source: string | null } & Pick<AnredeKontakt, "firstName" | "lastName" | "salutation">,
  meinname: string,
  opts: { ansprache?: Ansprache; terminlink?: string | null; now?: Date } = {},
): Werte {
  const name = (lead.name ?? "").trim();
  const kontakt: AnredeKontakt = { fullName: name, firstName: lead.firstName, lastName: lead.lastName, salutation: lead.salutation };
  const parts = kontaktParts(kontakt);
  const an = opts.ansprache ?? "sie";
  // E-Mails (Ole, 15.11.2026): bei Sie nur mit bekannter Anrede „Frau Winter“, sonst neutral („Guten Tag,“ und
  // Betreff „Kurz zu …“), nie „Nina Winter“. Bei Du der Vorname.
  const ohneAnrede = an === "sie" && !parts.salutation;
  const betreffName = ohneAnrede ? null : anredeName(an, kontakt);
  const [r1, r2] = rueckrufZeiten(opts.now);
  return {
    vorname: parts.first,
    nachname: parts.last,
    name,
    produkt: (lead.source ?? "").trim() || (opts.ansprache === "du" ? "deine Versicherung" : "Ihre Versicherung"),
    meinname,
    anrede: (ohneAnrede ? `${grusswort(an)},` : anredeZeile(an, kontakt)).replace(/,$/, ""),
    terminlink: opts.terminlink ?? null,
    betreff_name: betreffName ? `${betreffName}, ` : "",
    ihr_produkt: ihrProdukt(lead.source, an),
    rueckruf_1: r1,
    rueckruf_2: r2,
    anruf_tag: anrufTag(opts.now),
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

/**
 * {termin_unterlagen}: was zum Termin bereitliegen sollte, als Aufzählung. Dieselbe Liste wie im WhatsApp-Schluss und
 * in den Termin-Mails (bereitlegenListe bzw. bereitlegenFuerLead in lib/whatsapp/gespraech.ts, Ole 18.11.2026, M3).
 */
export function terminUnterlagen(bereitlegen: readonly string[]): string {
  return liste(bereitlegenPunkte(bereitlegen));
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
