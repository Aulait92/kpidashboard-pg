// Erstinformation nach § 15/16 VersVermV (Ole, 15.11.2026): reine Funktionen für Einrichtung, öffentliche Seite,
// PDF und Bot. Status = Customer.vermittlerTyp ("vertreter" = Ausschließlichkeitsvertreter, "mehrfachvertreter",
// "makler"). Tippgeber dürfen den Dienst nicht nutzen (der Assistent vereinbart Termine für einen erlaubten
// Vermittler, ein Tippgeber darf selbst nicht vermitteln).
//
// Rechtsgrundlage (geprüft am 15.11.2026 gegen den Wortlaut von § 15 und § 16 VersVermV 2018, gesetze-im-internet.de;
// § 34d GewO aus dem geltenden Wortlaut):
// - § 15 Abs. 1 Nr. 3 VersVermV unterscheidet beim Vertreter b) aa) „mit einer Erlaubnis nach § 34d Absatz 1 GewO“
//   und b) bb) „nach § 34d Absatz 7 Satz 1 Nummer 1 GewO als gebundener Versicherungsvertreter“.
// - § 34d Abs. 7 Satz 1 Nr. 1 GewO befreit von der Erlaubnis, wer ausschließlich für EIN Versicherungsunternehmen
//   oder, wenn die Produkte NICHT in Konkurrenz stehen, für MEHRERE tätig ist und für den das bzw. die Unternehmen
//   die uneingeschränkte Haftung übernehmen. Ein Mehrfachvertreter ist deshalb nicht automatisch „mit Erlaubnis nach
//   Abs. 1“: Vertritt er konkurrierende Produkte (typischer Mehrfachagent), braucht er die Erlaubnis nach Abs. 1;
//   vertritt er nur nicht konkurrierende Produkte mit Haftungsübernahme, ist er gebundener Vertreter nach Abs. 7.
//   Deshalb fragen wir beim Mehrfachvertreter die Art ab (erlaubnis "abs1" | "abs7"), Vorschlag aus dem Impressum,
//   Standard "abs1" (häufigster Fall).
// - Ausschließlichkeitsvertreter: Wortlaut wie gewünscht „gebundener Versicherungsvertreter nach § 34d Abs. 7 Satz 1
//   Nr. 1 GewO“. Hat ein AO ausnahmsweise eine eigene Erlaubnis nach Abs. 1, lädt er die Erstinformation seiner
//   Gesellschaft als PDF hoch (die dann gilt) oder wählt „Mehrfachvertreter“ nicht; das ist selten und bewusst
//   nicht als eigene Auswahl abgebildet.
// - Makler: „Versicherungsmakler mit Erlaubnis nach § 34d Abs. 1 GewO“ (§ 15 Abs. 1 Nr. 3 a) aa)).
// - § 16 Abs. 1/2 VersVermV: Mitteilung auf Papier oder (wenn angemessen und vom Kunden gewählt) auf einem anderen
//   dauerhaften Datenträger; eine Website nur mit personalisiertem Zugang oder Zustimmung. Deshalb geht die
//   Erstinformation als PDF raus (WhatsApp-Dokument bzw. E-Mail-Anhang), der Link ist nur zusätzlich, und das
//   Dokument nennt die Möglichkeit, sie auf Papier zu bekommen (Wahlrecht nach § 16 Abs. 2 Nr. 1).

import { a, type Ansprache } from "@/lib/ansprache";
import { advisorDisplayName } from "@/lib/advisor-name";
import { gesellschaftName } from "@/lib/tarifkatalog";

export type VermittlerStatus = "vertreter" | "mehrfachvertreter" | "makler";
export type Erlaubnis = "abs1" | "abs7";
export type Verguetung = "provision" | "courtage" | "honorar";

export const VERMITTLER_STATUS: readonly { key: VermittlerStatus | "tippgeber"; label: string; hint: string }[] = [
  { key: "makler", label: "Versicherungsmakler", hint: "§ 34d Abs. 1 GewO, Sie vermitteln im Auftrag Ihrer Kunden für viele Versicherer." },
  { key: "mehrfachvertreter", label: "Mehrfachvertreter", hint: "Sie sind Vertreter mehrerer Versicherer (mit Erlaubnis nach § 34d Abs. 1 GewO oder gebunden nach Abs. 7)." },
  { key: "vertreter", label: "Ausschließlichkeitsvertreter", hint: "§ 34d Abs. 7 GewO, Sie vermitteln ausschließlich für einen Versicherer (z. B. Allianz, ERGO)." },
  { key: "tippgeber", label: "Tippgeber", hint: "Sie geben nur Kontakte weiter und vermitteln selbst nicht." },
];

export const TIPPGEBER_HINWEIS =
  "Als Tippgeber dürfen Sie selbst keine Versicherungen vermitteln. Unser Assistent vereinbart Beratungstermine im Namen eines erlaubten Vermittlers, deshalb können wir den Dienst für Tippgeber leider nicht anbieten. Bitte sprechen Sie uns an, wenn Sie inzwischen eine Erlaubnis nach § 34d GewO haben.";

/** Statusbezeichnungen nach § 15 Abs. 1 Nr. 3 VersVermV (Wortlaut von Ole freigegeben). */
export const STATUS_MAKLER = "Versicherungsmakler mit Erlaubnis nach § 34d Abs. 1 GewO";
export const STATUS_GEBUNDEN = "gebundener Versicherungsvertreter nach § 34d Abs. 7 Satz 1 Nr. 1 GewO";
export const STATUS_VERTRETER_ERLAUBNIS = "Versicherungsvertreter mit Erlaubnis nach § 34d Abs. 1 GewO";

/** Gemeinsame Stelle nach § 11a Abs. 1 GewO (§ 15 Abs. 1 Nr. 9 VersVermV): Anschrift, Telefon, Internetadresse. */
export const VERMITTLERREGISTER =
  "Deutscher Industrie- und Handelskammertag (DIHK) e. V., Breite Straße 29, 10178 Berlin, Telefon 0180 6005850 (20 Cent je Anruf aus dem deutschen Festnetz, höchstens 60 Cent je Anruf aus Mobilfunknetzen), www.vermittlerregister.info";

/** Schlichtungsstellen (§ 15 Abs. 1 Nr. 12 VersVermV). */
export const SCHLICHTUNGSSTELLEN = [
  "Versicherungsombudsmann e. V., Postfach 08 06 32, 10006 Berlin, www.versicherungsombudsmann.de",
  "Ombudsmann Private Kranken- und Pflegeversicherung, Postfach 06 02 22, 10052 Berlin, www.pkv-ombudsmann.de",
] as const;

export const VERGUETUNG_LABEL: Record<Verguetung, string> = {
  provision: "Provision",
  courtage: "Courtage",
  honorar: "Honorar",
};

export function asVermittlerStatus(v: unknown): VermittlerStatus {
  return v === "makler" ? "makler" : v === "mehrfachvertreter" ? "mehrfachvertreter" : "vertreter";
}

export function vermittlerStatusLabel(v: unknown): string {
  const s = asVermittlerStatus(v);
  return VERMITTLER_STATUS.find((x) => x.key === s)!.label;
}

/** Bezeichnung für die Pflichtangaben (wie im Vermittlerregister). Mehrfachvertreter: je nach Erlaubnisart. */
export function statusRegisterText(v: unknown, erlaubnis: Erlaubnis = "abs1"): string {
  const s = asVermittlerStatus(v);
  if (s === "makler") return STATUS_MAKLER;
  if (s === "mehrfachvertreter" && erlaubnis === "abs1") return STATUS_VERTRETER_ERLAUBNIS;
  return STATUS_GEBUNDEN;
}

/**
 * Registernummer aus dem IHK-Vermittlerregister (Großbuchstaben und Ziffern): heutiges Format D-XXXX-XXXXX-XX
 * oder das ältere Format D-X-XXX-XXXX-XX (z. B. D-W-151-ALAP-38, viele Allianz-Vertreter; Ole, 20.11.2026).
 * Leerzeichen, Kleinbuchstaben und fehlende Bindestriche werden toleriert. null = ungültig.
 */
export function normalizeRegisterNummer(raw: string | null | undefined): string | null {
  const s = (raw ?? "").toUpperCase().replace(/[\s‐-―_.]+/g, "-").replace(/-+/g, "-").trim();
  const compact = s.replace(/-/g, "");
  const m = /^D([A-Z0-9]{4})([A-Z0-9]{5})([A-Z0-9]{2})$/.exec(compact);
  if (m) return `D-${m[1]}-${m[2]}-${m[3]}`;
  const alt = /^D([A-Z])(\d{3})([A-Z0-9]{4})(\d{2})$/.exec(compact);
  return alt ? `D-${alt[1]}-${alt[2]}-${alt[3]}-${alt[4]}` : null;
}

/** Eigene Seite des Vermittlers mit der Erstinformation (nur https bzw. http, keine internen Ziele). */
export function normalizeErstinfoUrl(raw: string | null | undefined): string | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (!u.hostname.includes(".") || /^(localhost|127\.|10\.|192\.168\.)/.test(u.hostname)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Status aus der Angabe im Impressum vorschlagen („gebundener Versicherungsvertreter nach § 34d Abs. 7“ usw.). */
export function statusFromImpressum(registerType: string | null | undefined): VermittlerStatus | null {
  const t = (registerType ?? "").toLowerCase();
  if (!t) return null;
  if (/makler/.test(t)) return "makler";
  if (/mehrfach/.test(t)) return "mehrfachvertreter";
  if (/gebunden|ausschlie|abs\.?\s*7/.test(t)) return "vertreter";
  return null;
}

/** Erlaubnisart eines Vertreters aus dem Impressum (gebunden nach Abs. 7 oder Erlaubnis nach Abs. 1). */
export function erlaubnisFromImpressum(registerType: string | null | undefined): Erlaubnis | null {
  const t = (registerType ?? "").toLowerCase();
  if (/gebunden|abs(atz|\.)?\s*7/.test(t)) return "abs7";
  if (/erlaubnis|abs(atz|\.)?\s*1\b/.test(t)) return "abs1";
  return null;
}

export const ERSTINFO_MAX_BYTES = 5 * 1024 * 1024;

/** PDF am Inhalt erkennen (%PDF). */
export function isPdf(data: Uint8Array): boolean {
  return data.length > 4 && data[0] === 0x25 && data[1] === 0x50 && data[2] === 0x44 && data[3] === 0x46;
}

// ─── Pflichtangaben (§ 15 Abs. 1 VersVermV) ───────────────────────────────────────────────────────────────

/** Bekannte Versicherer: Vorschlag für Ausschließlichkeitsvertreter aus Kundenname bzw. Website. */
const BRANDS: [RegExp, string][] = [
  [/allianz/i, "Allianz"],
  [/\bergo\b/i, "ERGO"],
  [/\baxa\b/i, "AXA"],
  [/signal[\s-]?iduna/i, "SIGNAL IDUNA"],
  [/\bhdi\b/i, "HDI"],
  [/generali/i, "Generali"],
  [/zurich/i, "Zurich"],
  [/\br\+v\b|\bruv\b|\br-v\b/i, "R+V"],
  [/\blvm\b/i, "LVM"],
  [/provinzial/i, "Provinzial"],
  [/\bdevk\b/i, "DEVK"],
  [/\bhuk\b/i, "HUK-COBURG"],
  [/gothaer/i, "Gothaer"],
  [/barmenia/i, "Barmenia"],
  [/continentale/i, "Continentale"],
  [/debeka/i, "Debeka"],
  [/\bwwk\b/i, "WWK"],
  [/n(ü|ue)rnberger/i, "Nürnberger"],
  [/\bvgh\b/i, "VGH"],
  [/\barag\b/i, "ARAG"],
  [/helvetia/i, "Helvetia"],
  [/\bvhv\b/i, "VHV"],
];

export function versichererVorschlag(customerName: string | null | undefined, website: string | null | undefined): string | null {
  let host = "";
  try {
    host = website ? new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`).hostname : "";
  } catch {
    host = "";
  }
  for (const src of [customerName ?? "", host.replace(/\./g, " ")]) {
    const hit = BRANDS.find(([re]) => re.test(src));
    if (hit) return hit[1];
  }
  return null;
}

/** „Allianz Versicherungs-AG“ → „die Allianz Versicherungs-AG“; mit Artikel bleibt es, „…verein“ → „den …“. */
export function versichererMitArtikel(name: string): string {
  const n = name.trim();
  if (/^(der|die|das|den|dem)\s/i.test(n)) return n;
  return /verein\b/i.test(n) ? `den ${n}` : `die ${n}`;
}

/** Versicherer aus dem Formular: eine Zeile je Versicherer (auch „;“), ohne Doppelte. */
export function parseVersicherer(raw: string | null | undefined): string[] {
  const out: string[] = [];
  for (const part of (raw ?? "").split(/[\n;]+/)) {
    const t = part.replace(/\s+/g, " ").trim().slice(0, 160);
    if (t && !out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t);
  }
  return out.slice(0, 30);
}

export function asVerguetung(list: readonly unknown[] | null | undefined): Verguetung[] {
  const ok: Verguetung[] = ["provision", "courtage", "honorar"];
  return ok.filter((v) => (list ?? []).includes(v));
}

/** Gespeicherte Angaben (Erstinformation-Datensatz); null = noch nicht gespeichert. */
export type ErstinfoRecord = {
  registerNummer?: string | null;
  name?: string | null;
  firma?: string | null;
  anschrift?: string | null;
  telefon?: string | null;
  email?: string | null;
  versicherer?: string[] | null;
  erlaubnis?: string | null;
  beratung?: boolean | null;
  beteiligungen?: string | null;
  verguetung?: string[] | null;
  zuwendungen?: boolean | null;
  ihk?: string | null;
  bestaetigtAt?: Date | null;
  fileName?: string | null;
};

/** Angaben aus dem Impressum (Onboarding.websiteInfo, lib/impressum.ts). */
export type ErstinfoWeb = {
  companyName?: string | null;
  representative?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  registerNumber?: string | null;
  registerType?: string | null;
  chamber?: string | null;
  sourceUrl?: string | null;
  impressumUrl?: string | null;
} | null;

export type ErstinfoDaten = {
  status: VermittlerStatus;
  /** Nur Mehrfachvertreter wählt; Vertreter = abs7, Makler = abs1 */
  erlaubnis: Erlaubnis;
  name: string;
  firma: string;
  anschrift: string;
  telefon: string;
  email: string;
  registerNummer: string;
  ihk: string;
  versicherer: string[];
  beratung: boolean;
  /** null = keine Beteiligungen über 10 % */
  beteiligungen: string | null;
  verguetung: Verguetung[];
  zuwendungen: boolean;
};

const clean = (v: string | null | undefined) => (v ?? "").trim();

/** Standard-Vergütung nach Status: Makler Courtage, Vertreter Provision. */
export function verguetungStandard(status: VermittlerStatus): Verguetung[] {
  return status === "makler" ? ["courtage"] : ["provision"];
}

/**
 * Vor- und Nachname des Vermittlers: gespeichert, sonst Vorschlag aus Impressum (Vertreter) bzw. Kundenname als Person
 * („Agentur Susanne Meier“ → „Susanne Meier“). Auch Quelle des Vornamens im Erstanschreiben (lead-anrede.ts).
 */
// Wörter, die auf eine Firma statt eine Person hindeuten (Go-Live-Check 19.11.2026: „Herr Versicherungsbüro Sonnberg“
// stand sonst im Pflicht-PDF nach § 15 VersVermV).
const FIRMEN_WORT = /^(company|co\.?|inc\.?|ltd\.?|ag|ug|gmbh|kg|ohg|gbr|e\.?\s?k\.?|group|gruppe|holding|services?|solutions|consulting|partner|agentur\w*|generalagentur\w*|hauptvertretung\w*|vertretung\w*|versicherung\w*|versicherungsbüro\w*|finanz\w*|makler\w*|büro|buero|kanzlei|&|und|test)$/i;

/** Sieht wie ein Personenname aus (mindestens zwei Wörter, kein Firmenwort)? */
export function siehtNachPersonAus(name: string | null | undefined): boolean {
  const words = clean(name).split(/\s+/).filter(Boolean);
  return words.length >= 2 && !words.some((w) => FIRMEN_WORT.test(w.replace(/[(),.]/g, "")));
}

/**
 * Name der Person: Gespeichertes, sonst Inhaber laut Impressum, sonst Anzeigename des Inhabers-Logins (Go-live-Prüfung
 * 19.11.2026, B1), sonst Kundenname nur wenn er nach Person aussieht, sonst leer (Pflichtfeld).
 */
export function erstinfoName(saved: string | null | undefined, web: ErstinfoWeb | undefined, customerName: string | null | undefined, inhaberName?: string | null): string {
  if (saved != null) return saved.trim();
  const vertreter = clean(web?.representative);
  if (vertreter && siehtNachPersonAus(vertreter)) return vertreter;
  const inhaber = clean(inhaberName);
  if (inhaber && siehtNachPersonAus(inhaber) && !inhaber.includes("@")) return inhaber;
  const person = advisorDisplayName(customerName);
  if (person && siehtNachPersonAus(person)) return person.trim();
  return "";
}

/**
 * Wirkt ein gespeicherter Name wie eine Firma statt wie eine Person („Versicherungsbüro Sonnberg“, „Meier GmbH“, „Allianz
 * Max Berger“)? Breiter als siehtNachPersonAus (auch Versicherermarken), für die Diagnose q=erstinfo-namen (B1).
 */
export function wirktWieFirma(name: string | null | undefined): boolean {
  const s = (name ?? "").replace(/\s+/g, " ").trim();
  if (!s) return false;
  if (/agentur|b(ü|ue)ro|versicherung|vertretung|makler|finanz|vorsorge|assekuranz|kanzlei|consulting|service/i.test(s)) return true;
  if (/(^|[\s,.&])(gmbh|mbh|ug|ag|kg|ohg|gbr|e\.\s?k\.?|co\.?)(?=$|[\s,.)])/i.test(s)) return true;
  return BRANDS.some(([re]) => re.test(s));
}

/**
 * Interne Kundenbezeichnung nach dem Muster „Gesellschaft + Person“ („Allianz Max Berger“, „ERGO Anna Meier“)? So legen
 * wir Kunden intern an; Leads sollen das nicht sehen (Usability-Check 25.11.2026, Rest von W7).
 */
export function interneKundenbezeichnung(customerName: string | null | undefined): boolean {
  const words = clean(customerName).split(/\s+/).filter(Boolean);
  // Marke aus ein oder zwei Wörtern vorn („Allianz“, „Signal Iduna“), danach nur noch ein Personenname
  for (const n of [1, 2]) {
    const marke = words.slice(0, n).join(" ");
    const rest = words.slice(n).join(" ");
    if (BRANDS.some(([re]) => re.test(marke)) && siehtNachPersonAus(rest) && !BRANDS.some(([re]) => re.test(rest))) return true;
  }
  return false;
}

/**
 * Name des Vermittlers gegenüber Leads (öffentliche Seiten wie /book, Untertitel im Konto): Firma aus der
 * Erstinformation (Anbieterangaben), sonst der Name daraus, sonst wie bisher der Kundenname (intern „Allianz Max Berger“
 * ohne Marke: „Max Berger“). Eine gespeicherte Firma, die
 * nur der interne Kundenname ist (alter Vorschlag), zählt nicht.
 */
export function anbieterAnzeigeName(e: { firma?: string | null; name?: string | null } | null | undefined, customerName: string | null | undefined): string {
  const kunde = clean(customerName);
  const firma = clean(e?.firma);
  const firmaOk = firma && !(firma === kunde && interneKundenbezeichnung(kunde));
  return (firmaOk ? firma : "") || clean(e?.name) || (interneKundenbezeichnung(kunde) ? (advisorDisplayName(kunde) ?? kunde) : kunde);
}

/**
 * Angaben zusammenführen: Gespeichertes hat Vorrang, sonst Vorschlag aus Impressum und Angebot (Ole: nichts
 * abfragen, was wir schon wissen; vorausfüllen und nur prüfen lassen).
 * Vor- und Nachname (Go-live-Prüfung 19.11.2026, B1): siehe erstinfoName, mit dem Anzeigenamen des Inhabers als Vorschlag.
 * Versicherer (W1): bei Vertretern zuerst die in der Einrichtung gewählte Gesellschaft (Customer.tarifGesellschaften).
 */
export function erstinfoDaten(
  e: ErstinfoRecord | null | undefined,
  web: ErstinfoWeb | undefined,
  customer: { name?: string | null; vermittlerTyp?: string | null; inhaberName?: string | null; gesellschaften?: string[] | null },
): ErstinfoDaten {
  const status = asVermittlerStatus(customer.vermittlerTyp);
  const w = web ?? {};
  const name = erstinfoName(e?.name, w, customer.name, customer.inhaberName);
  // Interner Kundenname („Allianz Max Berger“) ist kein Firmenname für Leads (Usability-Check 25.11.2026)
  const firmaVorschlag = clean(w.companyName) || (interneKundenbezeichnung(customer.name) ? "" : clean(customer.name));
  const firma = e?.firma ?? (firmaVorschlag && firmaVorschlag !== name ? firmaVorschlag : "");
  const gespeicherteVersicherer = (e?.versicherer ?? []).filter((v) => v.trim());
  const gewaehlt = (customer.gesellschaften ?? []).map((g) => g.trim()).filter(Boolean);
  const vorschlaege =
    status === "makler"
      ? []
      : gewaehlt.length
        ? (status === "vertreter" ? gewaehlt.slice(0, 1) : gewaehlt).map(gesellschaftName)
        : status === "vertreter"
          ? [versichererVorschlag(customer.name, w.sourceUrl || w.impressumUrl)].filter((v): v is string => !!v)
          : [];
  const versicherer = status === "makler" ? [] : gespeicherteVersicherer.length ? gespeicherteVersicherer : vorschlaege;
  const verguetung = asVerguetung(e?.verguetung);
  const erlaubnis: Erlaubnis =
    status === "makler" ? "abs1" : status === "vertreter" ? "abs7" : e?.erlaubnis === "abs7" || e?.erlaubnis === "abs1" ? e.erlaubnis : (erlaubnisFromImpressum(w.registerType) ?? "abs1");
  return {
    status,
    erlaubnis,
    name: clean(name),
    firma: clean(firma),
    anschrift: clean(e?.anschrift ?? w.address),
    telefon: clean(e?.telefon ?? w.phone),
    email: clean(e?.email ?? w.email),
    registerNummer: e?.registerNummer ?? normalizeRegisterNummer(w.registerNumber) ?? "",
    ihk: clean(e?.ihk ?? w.chamber),
    versicherer: status === "vertreter" ? versicherer.slice(0, 1) : versicherer,
    beratung: e?.beratung ?? true,
    beteiligungen: clean(e?.beteiligungen) || null,
    verguetung: verguetung.length ? verguetung : verguetungStandard(status),
    zuwendungen: e?.zuwendungen ?? false,
  };
}

/**
 * Was fehlt noch? Leer = vollständig. Mit eigenem PDF (z. B. Vorlage der Gesellschaft) gilt dieses als
 * Erstinformation; dann reicht die Registernummer. Ohne PDF erzeugen wir sie aus den Angaben, dann müssen alle
 * Pflichtangaben nach § 15 Abs. 1 VersVermV da sein. Bestätigt = Angaben einmal geprüft und gespeichert.
 */
export function erstinfoFehlt(d: ErstinfoDaten, opts: { upload: boolean; bestaetigt: boolean }): string[] {
  const out: string[] = [];
  if (!normalizeRegisterNummer(d.registerNummer)) out.push("Registernummer");
  if (!opts.upload) {
    if (!d.name) out.push("Name");
    if (!d.anschrift) out.push("Anschrift");
    if (d.status === "vertreter" && d.versicherer.length !== 1) out.push("Versicherer, für den Sie tätig sind");
    if (d.status === "mehrfachvertreter" && d.versicherer.length < 1) out.push("Versicherer, für die Sie tätig sind");
    if (!d.verguetung.length) out.push("Art der Vergütung");
    if (!d.ihk) out.push("Zuständige IHK");
  }
  if (!opts.bestaetigt) out.push("Bestätigung der Angaben");
  return out;
}

/** Ist die Erstinformation vollständig? (gemeinsam für Einrichtung, Checkliste, Heute) */
export function erstinfoVollstaendig(
  e: ErstinfoRecord | null | undefined,
  web: ErstinfoWeb | undefined,
  customer: { name?: string | null; vermittlerTyp?: string | null },
): boolean {
  return erstinfoFehlt(erstinfoDaten(e, web, customer), { upload: !!e?.fileName, bestaetigt: !!e?.bestaetigtAt }).length === 0;
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Satz zum Status (§ 15 Abs. 1 Nr. 3) mit den Versicherern. */
export function statusSatz(d: Pick<ErstinfoDaten, "status" | "erlaubnis" | "versicherer">): string {
  if (d.status === "makler") return `${STATUS_MAKLER}.`;
  if (d.status === "vertreter") {
    const v = d.versicherer[0];
    return v ? `${cap(STATUS_GEBUNDEN)}, tätig ausschließlich für ${versichererMitArtikel(v)}.` : `${cap(STATUS_GEBUNDEN)}.`;
  }
  const liste = d.versicherer.map((v) => `• ${v}`).join("\n");
  return d.erlaubnis === "abs7"
    ? `${cap(STATUS_GEBUNDEN)} (Mehrfachvertreter), tätig für folgende Versicherungsunternehmen, deren Versicherungsprodukte nicht in Konkurrenz zueinander stehen:\n${liste}`
    : `${STATUS_VERTRETER_ERLAUBNIS} (Mehrfachvertreter), tätig für folgende Versicherungsunternehmen:\n${liste}`;
}

/** Vergütung (§ 15 Abs. 1 Nr. 5 bis 8). */
export function verguetungText(d: Pick<ErstinfoDaten, "verguetung" | "zuwendungen">): string {
  const zeile: Record<Verguetung, string> = {
    provision: "Provision vom Versicherungsunternehmen, sie ist in der Versicherungsprämie enthalten",
    courtage: "Courtage vom Versicherungsunternehmen, sie ist in der Versicherungsprämie enthalten",
    honorar: "Honorar, das direkt vom Kunden zu zahlen ist (nur nach gesonderter Vereinbarung)",
  };
  const lines = ["Für die Vermittlung wird folgende Vergütung erhalten:", ...d.verguetung.map((v) => `• ${zeile[v]}`)];
  lines.push(
    d.zuwendungen
      ? "Daneben werden andere Zuwendungen von Versicherungsunternehmen erhalten (zum Beispiel geldwerte Vorteile oder Sachleistungen)."
      : "Andere Zuwendungen werden nicht erhalten.",
  );
  lines.push(
    d.verguetung.length > 1 || d.zuwendungen
      ? "Die Vergütung besteht aus einer Verknüpfung der genannten Vergütungsarten."
      : "Die Vergütung besteht nicht aus einer Verknüpfung verschiedener Vergütungsarten.",
  );
  return lines.join("\n");
}

export const KEINE_BETEILIGUNGEN =
  "Es bestehen keine unmittelbaren oder mittelbaren Beteiligungen von über 10 % an den Stimmrechten oder am Kapital eines Versicherungsunternehmens. Kein Versicherungsunternehmen und kein Mutterunternehmen eines Versicherungsunternehmens hält eine unmittelbare oder mittelbare Beteiligung von über 10 % an den Stimmrechten oder am Kapital des Vermittlers.";

export type ErstinfoAbschnitt = { ueberschrift: string; text: string };

/** Hinweis auf Papier (Wahlrecht nach § 16 Abs. 2 Nr. 1 VersVermV), in der Ansprache des Kunden. */
export function papierHinweis(an: Ansprache): string {
  return a(
    an,
    "Auf Wunsch bekommst du diese Erstinformation auch kostenlos auf Papier.",
    "Auf Wunsch erhalten Sie diese Erstinformation auch kostenlos auf Papier.",
  );
}

/** Der Text der Erstinformation (öffentliche Seite und PDF): alle Angaben nach § 15 Abs. 1 VersVermV. */
export function erstinfoAbschnitte(d: ErstinfoDaten): ErstinfoAbschnitt[] {
  const kontakt = [d.name, d.firma && d.firma !== d.name ? d.firma : "", d.anschrift, d.telefon ? `Telefon: ${d.telefon}` : "", d.email ? `E-Mail: ${d.email}` : ""]
    .filter(Boolean)
    .join("\n");
  const behoerde = d.status === "makler" || (d.status === "mehrfachvertreter" && d.erlaubnis === "abs1") ? "Erlaubnis- und Registrierungsbehörde" : "Registrierungsbehörde";
  return [
    { ueberschrift: "Vermittler", text: kontakt },
    { ueberschrift: "Status", text: statusSatz(d) },
    {
      ueberschrift: "Vermittlerregister",
      text: `Eingetragen im Vermittlerregister nach § 34d Abs. 10 GewO unter der Registrierungsnummer ${d.registerNummer || "(fehlt)"}.\nDie Eintragung lässt sich überprüfen bei der gemeinsamen Stelle: ${VERMITTLERREGISTER}`,
    },
    { ueberschrift: `Zuständige ${behoerde}`, text: d.ihk || "(fehlt)" },
    {
      ueberschrift: "Beratung",
      text: d.beratung ? "Zu den vermittelten Versicherungen wird eine Beratung angeboten." : "Es wird keine Beratung angeboten.",
    },
    { ueberschrift: "Vergütung", text: verguetungText(d) },
    { ueberschrift: "Beteiligungen", text: d.beteiligungen || KEINE_BETEILIGUNGEN },
    {
      ueberschrift: "Schlichtungsstellen",
      text: `Bei Streitigkeiten zwischen Versicherungsvermittlern und Versicherungsnehmern können folgende Schlichtungsstellen angerufen werden:\n${SCHLICHTUNGSSTELLEN.map((s) => `• ${s}`).join("\n")}`,
    },
  ];
}

/** Dateiname des PDFs, z. B. „Erstinformation_Agentur_Meier_GmbH.pdf“ (auch das WhatsApp-Dokument an Leads). */
export function erstinfoDateiname(name: string): string {
  const n = name.replace(/[^\p{L}\p{N} ]+/gu, " ").trim().replace(/\s+/g, "_").slice(0, 60);
  return n ? `Erstinformation_${n}.pdf` : "Erstinformation.pdf";
}

// ─── Ihre Angaben (Einrichtung Schritt 1, Ole 20.11.2026: einmal fragen, früh) ─────────────────────────────

/** Angaben zur Person, einmal am Anfang der Einrichtung (Erstinformation, Signatur, Nennung gegenüber Leads). */
export type VermittlerAngaben = { anrede: string; name: string; telefon: string; anschrift: string; registerNummer: string };

const einzeilig = (v: string | null | undefined) => (v ?? "").replace(/\s+/g, " ").trim();

/** Bekannt = alle Angaben da (dann zeigen spätere Schritte sie nur noch an, mit „ändern“). */
export function angabenBekannt(a: { anrede?: string | null; name?: string | null; telefon?: string | null; anschrift?: string | null; registerNummer?: string | null }): boolean {
  return !!a.anrede && !!einzeilig(a.name) && !!einzeilig(a.telefon) && !!einzeilig(a.anschrift) && !!normalizeRegisterNummer(a.registerNummer);
}

/** Prüfen und bereinigen (rein). Fehlertexte in Sie-Form, ohne Gedankenstriche. */
export function pruefeAngaben(
  raw: Partial<Record<keyof VermittlerAngaben, string | null>>,
): { ok: true; angaben: VermittlerAngaben } | { ok: false; error: string } {
  const anrede = (raw.anrede ?? "").trim();
  if (!["Herr", "Frau", "keine"].includes(anrede)) return { ok: false, error: "Bitte Ihre Anrede wählen. Ihre Kunden lesen z. B. „Herr Kannapinn“." };
  const name = einzeilig(raw.name).slice(0, 160);
  if (name.split(" ").length < 2) return { ok: false, error: "Bitte Vor- und Nachnamen eintragen." };
  const telefon = einzeilig(raw.telefon).slice(0, 60);
  if (telefon.replace(/\D/g, "").length < 6) return { ok: false, error: "Bitte Ihre Telefonnummer eintragen." };
  const anschrift = (raw.anschrift ?? "").replace(/\r\n?/g, "\n").trim().slice(0, 400);
  if (!anschrift) return { ok: false, error: "Bitte Ihre Geschäftsanschrift eintragen." };
  const registerNummer = normalizeRegisterNummer(raw.registerNummer);
  if (!registerNummer) {
    return { ok: false, error: "Die Registernummer passt nicht. Bitte so eingeben, wie sie auf Ihrer IHK-Urkunde steht, z. B. D-XXXX-XXXXX-XX oder D-X-XXX-XXXX-XX." };
  }
  return { ok: true, angaben: { anrede, name, telefon, anschrift, registerNummer } };
}
