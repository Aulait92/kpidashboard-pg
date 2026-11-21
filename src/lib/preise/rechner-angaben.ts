// Angaben je Sparte, die der Rechner für den Beitrag braucht (Ole, 17.11.2026). Verbindliche Quelle: Tabelle
// „Je Sparte → Benötigte Angaben (laut Rechner)“ in docs/preise-pilot.md (Allianz-Rechner). EINE Quelle für
//   - „Beiträge rechnen“ in der Terminvorbereitung (lib/preise/pilot.ts rechnerAngaben: Angaben zum Kopieren) und
//   - die Folgefragen des WhatsApp-Assistenten nach der Zusage zum Termin (folgefragen, lib/whatsapp/bot.ts).
// Regeln für die Folgefragen: nur Angaben, die der Lead weiß und die für den Beitrag nötig sind; was der Vermittler im
// Termin festlegt (Selbstbeteiligung, Summen, Tarifwahl, Versicherungsbeginn) steht hier als „termin“ und wird nie
// gefragt; Gesundheitsangaben zu Menschen stehen nicht hier. Rein, ohne Datenbank.
// Lebensbereiche (Rechtsschutz, P2): Der Rechner braucht sie für den Beitrag (docs/preise-pilot.md), der Lead kann sie
// beantworten, also fragt der Assistent danach (nicht mehr „termin“).

import { a, type Ansprache } from "@/lib/ansprache";
import { qualificationPoints, type QualificationKey } from "@/lib/whatsapp/qualification";
import { istKfzProdukt, KFZ_FORMULAR } from "@/lib/whatsapp/produkt-fragen";

/** Sparten mit Rechner (Schlüssel wie im Tarifkatalog bzw. RECHNER in pilot.ts). */
export type RechnerSparte =
  | "katze-kranken"
  | "katze-op"
  | "hund-kranken"
  | "hund-op"
  | "haftpflicht"
  | "hausrat"
  | "rechtsschutz"
  | "wohngebaeude"
  | "unfall"
  | "tierhalter-hund"
  | "tierhalter-pferd"
  | "kfz";

/** Woraus eine Angabe gelesen wird: Formular, Angaben des Assistenten, Adresse des Leads, Tierart der Sparte. */
export type AngabenQuelle = {
  formular: { label: string; value: string }[];
  angaben: unknown;
  adresse?: string | null;
};

type Ctx = { tierart: string; q: (k: QualificationKey) => string | null; form: (re: RegExp) => string | null; adresse: string | null; plz: string | null };

/**
 * Eine Folgefrage (Sie/Du); feld = wohin der Assistent die Antwort schreibt (record_qualification). knoepfe: Antwort
 * per Knopf („Ja“/„Nein“, Ole 17.11.2026), im offenen Fenster als interaktive Nachricht.
 */
export type Folgefrage = { key: string; feld: QualificationKey; sie: string; du: string; knoepfe?: string[] };

/** Knöpfe für Ja/Nein-Angaben der Rechner-Tabelle. */
export const JA_NEIN = ["Ja", "Nein"] as const;

type AngabeDef = {
  /** Beschriftung in „Beiträge rechnen“ */
  label: string;
  /** lead = Assistent fragt nach der Zusage, falls unbekannt; termin = legt der Vermittler im Termin fest (nie fragen) */
  wer: "lead" | "termin";
  wert: (c: Ctx) => string | null;
  /** Frage(n) an den Lead; mehrere Teile (Wohngebäude) einzeln, je mit eigener Erkennung im bekannten Wert */
  fragen?: (Folgefrage & { bekannt?: RegExp })[];
  /** Reihenfolge der Folgefragen über alle Sparten (Ole, 17.11.2026: Geburtsdatum, Wohnfläche, öffentlicher Dienst) */
  rang: number;
};

/** Nur die Postleitzahl (Datensparsamkeit: die Straße braucht nur der Wohngebäude-Rechner). */
export function plzAus(...texte: (string | null | undefined)[]): string | null {
  for (const t of texte) {
    const m = t?.match(/\b\d{5}\b/);
    if (m) return m[0];
  }
  return null;
}

/** Antwort auf eine Tierfrage im Chat (lib/whatsapp/tier-fragen.ts: angaben.tier „Rasse: …; Geschlecht: …“). */
const ausChat = (c: Ctx, label: string): string | null => c.q("tier")?.match(new RegExp(`(?:^|;\\s*)${label}:\\s*([^;]+)`, "i"))?.[1]?.trim() || null;

const f = (key: string, feld: QualificationKey, sie: string, du: string, bekannt?: RegExp, knoepfe?: readonly string[]) => ({
  key,
  feld,
  sie,
  du,
  ...(bekannt ? { bekannt } : {}),
  ...(knoepfe ? { knoepfe: [...knoepfe] } : {}),
});

/** Wohnfläche als genaue Zahl (Ole, 19.11.2026: Bereiche reichen dem Rechner nicht); gleiche Frage wie die Zwischenfrage. */
export const WOHNFLAECHE_FRAGE = {
  sie: "Wie viele Quadratmeter Wohnfläche hat Ihre Wohnung? Bitte als Zahl, zum Beispiel 72.",
  du: "Wie viele Quadratmeter Wohnfläche hat deine Wohnung? Bitte als Zahl, zum Beispiel 72.",
} as const;

/** Alle Angaben der Rechner. */
export const ANGABEN = {
  plz: { label: "Postleitzahl", wer: "lead", rang: 5, wert: (c) => c.plz, fragen: [f("plz", "plz", "Wie lautet Ihre Postleitzahl?", "Wie lautet deine Postleitzahl?")] },
  geburt: { label: "Geburtsdatum", wer: "lead", rang: 1, wert: (c) => c.q("geburt") ?? c.form(/^geburtsdatum$|geburtsdatum \(person|^ihr geburtsdatum/i), fragen: [f("geburt", "geburt", "Wie lautet Ihr Geburtsdatum?", "Wie lautet dein Geburtsdatum?")] },
  familienstand: {
    label: "Familienstand (Single, Paar, Familie)",
    wer: "lead",
    rang: 4,
    wert: (c) => c.form(/lebenssituation|familienstand/i) ?? c.q("lebenssituation") ?? c.q("versichern"),
    fragen: [f("familienstand", "versichern", "Wer soll mitversichert sein: nur Sie, mit Partner oder die ganze Familie?", "Wer soll mitversichert sein: nur du, mit Partner oder die ganze Familie?")],
  },
  oeffentlicherDienst: {
    label: "Öffentlicher Dienst",
    wer: "lead",
    rang: 3,
    wert: (c) => c.q("beruf"),
    fragen: [f("oeffentlicherDienst", "beruf", "Sind Sie im öffentlichen Dienst tätig?", "Bist du im öffentlichen Dienst tätig?", undefined, JA_NEIN)],
  },
  wohnflaeche: { label: "Wohnfläche", wer: "lead", rang: 2, wert: (c) => c.q("wohnflaeche") ?? c.form(/wohnfl(ä|a)che/i), fragen: [f("wohnflaeche", "wohnflaeche", WOHNFLAECHE_FRAGE.sie, WOHNFLAECHE_FRAGE.du)] },
  lebensbereiche: {
    label: "Lebensbereiche",
    wer: "lead",
    rang: 5,
    wert: (c) => c.q("bereiche"),
    fragen: [
      f(
        "lebensbereiche",
        "bereiche",
        "Welche Bereiche soll Ihr Rechtsschutz abdecken: Privat, Beruf, Verkehr, Wohnen oder nur einen Teil davon?",
        "Welche Bereiche soll dein Rechtsschutz abdecken: Privat, Beruf, Verkehr, Wohnen oder nur einen Teil davon?",
      ),
    ],
  },
  berufsgruppe: { label: "Beruf", wer: "lead", rang: 6, wert: (c) => c.q("beruf") ?? c.form(/^beruf|t(ä|a)tigkeit/i), fragen: [f("beruf", "beruf", "Was machen Sie beruflich?", "Was machst du beruflich?")] },
  versichern: { label: "Wer versichert werden soll", wer: "lead", rang: 4, wert: (c) => c.q("versichern"), fragen: [f("versichern", "versichern", "Wer soll versichert werden: nur Sie oder auch Familienmitglieder?", "Wer soll versichert werden: nur du oder auch Familienmitglieder?")] },
  adresseGebaeude: {
    label: "Adresse des Gebäudes",
    wer: "lead",
    rang: 7,
    // Straße und Hausnummer nötig; nur die PLZ reicht dem Rechner nicht (gezeigt wird sie trotzdem)
    wert: (c) => c.adresse ?? c.q("plz") ?? c.plz,
    fragen: [f("adresseGebaeude", "plz", "Wie lautet die Adresse des Hauses (Straße und Hausnummer)?", "Wie lautet die Adresse des Hauses (Straße und Hausnummer)?", /\D\s*\d+\s*[a-z]?\s*,|stra(ß|ss)e|weg\b|platz\b|allee\b/i)],
  },
  gebaeude: {
    label: "Gebäude (Fläche, Baujahr, Einheiten, Bauweise)",
    wer: "lead",
    rang: 8,
    wert: (c) => c.q("gebaeude"),
    fragen: [
      f("gebaeudeFlaeche", "gebaeude", "Wie groß ist die Wohnfläche des Hauses ungefähr?", "Wie groß ist die Wohnfläche des Hauses ungefähr?", /m²|m2|qm|quadratmeter/i),
      f("baujahr", "gebaeude", "In welchem Jahr wurde das Haus gebaut?", "In welchem Jahr wurde das Haus gebaut?", /baujahr|\bbj\b|\b(1[89]|20)\d{2}\b/i),
      f("wohneinheiten", "gebaeude", "Wie viele Wohneinheiten hat das Haus?", "Wie viele Wohneinheiten hat das Haus?", /einheit|\bwe\b|einfamilien|zweifamilien|mehrfamilien/i),
      f("keller", "gebaeude", "Hat das Haus einen Keller?", "Hat das Haus einen Keller?", /keller/i, JA_NEIN),
      f("bauweise", "gebaeude", "Ist das Haus massiv gebaut, oder ist es zum Beispiel ein Holz- oder Fertighaus?", "Ist das Haus massiv gebaut, oder ist es zum Beispiel ein Holz- oder Fertighaus?", /massiv|holz|fertighaus|bauweise|stein|beton|ziegel/i),
    ],
  },
  // Kfz (Ole, 21.11.2026): HSN/TSN und Vorversicherung kommen aus den Fotos von Fahrzeugschein und letzter Rechnung
  // (Unterlagen-Bitte der Strecke, die nach den Folgefragen kommt); darum hier keine Folgefrage, nur die Anzeige.
  fahrzeug: {
    label: "Fahrzeug (HSN, TSN)",
    wer: "lead",
    rang: 20,
    wert: (c) => c.q("fahrzeug") ?? ([c.form(/herstellerschl|\bhsn\b|2\.1/i), c.form(/typschl|\btsn\b|2\.2/i)].filter(Boolean).join(" / ") || null),
  },
  vorversicherung: {
    label: "Bisherige Kfz-Versicherung (Versicherer, SF-Klasse, Vers.-Nr.)",
    wer: "lead",
    rang: 21,
    wert: (c) => c.q("vorversicherung") ?? c.form(/sf-?klasse|schadenfrei|vorversicher/i),
  },
  // Weitere Felder des Allianz-Kfz-Rechners (Screenshot Ole, 21.11.2026). Erstzulassung, Zulassung auf den Halter und
  // SF-Klasse stehen auf Fahrzeugschein bzw. Rechnung (Fotos); hier nur, was dort nicht steht.
  kfzVertrag: {
    label: "Anlass, Schutz, Schäden (3 Jahre)",
    wer: "lead",
    rang: 22,
    // Anlass und Schutz kommen meist aus dem Leadformular (KFZ_FORMULAR), Schäden fragt der Assistent
    wert: (c) => [c.form(KFZ_FORMULAR.anlass), c.form(KFZ_FORMULAR.schutz), c.q("kfzVertrag")].filter(Boolean).join("; ") || null,
    fragen: [
      f("kfzAnlass", "kfzVertrag", "Geht es um einen Versicherungswechsel für Ihr jetziges Fahrzeug oder um ein neu gekauftes Fahrzeug?", "Geht es um einen Versicherungswechsel für dein jetziges Fahrzeug oder um ein neu gekauftes Fahrzeug?", /wechsel|neu|ersatz|gekauft/i),
      f("kfzSchutz", "kfzVertrag", "Welcher Schutz ist Ihnen wichtig: nur Haftpflicht, Teilkasko oder Vollkasko?", "Welcher Schutz ist dir wichtig: nur Haftpflicht, Teilkasko oder Vollkasko?", /haftpflicht|teilkasko|vollkasko|\btk\b|\bvk\b|noch nicht|wei(ß|ss) (ich )?(es )?nicht|beraten/i),
      f("kfzSchaeden", "kfzVertrag", "Hat Ihre Kfz-Versicherung in den letzten 3 Jahren einen Schaden bezahlt?", "Hat deine Kfz-Versicherung in den letzten 3 Jahren einen Schaden bezahlt?", /sch(ä|a)den|schadenfrei/i, JA_NEIN),
    ],
  },
  // Antwort auf die Kfz-Einstiegsfrage im Erstanschreiben (Ole, 21.11.2026): nur Anzeige, keine Folgefrage
  kfzStart: {
    label: "Ablauf jetziger Vertrag bzw. neues Auto da",
    wer: "lead",
    rang: 22,
    wert: (c) => c.q("kfzStart"),
  },
  kfzFahrer: {
    label: "Nutzung, Führerschein seit, weitere Fahrer",
    wer: "lead",
    rang: 23,
    wert: (c) => c.q("kfzFahrer"),
    fragen: [
      f("kfzNutzung", "kfzFahrer", "Nutzen Sie das Fahrzeug privat oder auch geschäftlich?", "Nutzt du das Fahrzeug privat oder auch geschäftlich?", /privat|gesch(ä|a)ftlich|beruflich|firma/i),
      f("kfzFuehrerschein", "kfzFahrer", "In welchem Jahr haben Sie Ihren Führerschein gemacht?", "In welchem Jahr hast du deinen Führerschein gemacht?", /f(ü|ue)hrerschein|seit\s+(19|20)\d{2}/i),
      f("kfzWeitereFahrer", "kfzFahrer", "Fährt außer Ihnen noch jemand das Fahrzeug? Wenn ja, wie alt ist die jüngste Person?", "Fährt außer dir noch jemand das Fahrzeug? Wenn ja, wie alt ist die jüngste Person?", /fahrer|nur ich|allein|niemand|keine weiteren|partner|frau|mann|sohn|tochter/i),
    ],
  },
  kfzDetails: {
    label: "km im Jahr, Finanzierung",
    wer: "lead",
    rang: 24,
    wert: (c) => c.q("kfzDetails"),
    fragen: [
      f("kfzKm", "kfzDetails", "Wie viele Kilometer fahren Sie ungefähr im Jahr?", "Wie viele Kilometer fährst du ungefähr im Jahr?", /\bkm\b|kilometer|\d{1,3}\.\d{3}|\d{4,6}/i),
      f("kfzFinanzierung", "kfzDetails", "Ist das Fahrzeug bezahlt, finanziert oder geleast?", "Ist das Fahrzeug bezahlt, finanziert oder geleast?", /bezahlt|eigen|finanziert|kredit|leasing|geleast/i),
    ],
  },
  summen: { label: "Versicherungssummen", wer: "termin", rang: 99, wert: () => null },
  tierart: { label: "Tierart", wer: "lead", rang: 10, wert: (c) => c.form(/tierart/i) ?? c.tierart },
  rasse: { label: "Rasse", wer: "lead", rang: 11, wert: (c) => c.form(/rasse/i) ?? ausChat(c, "Rasse"), fragen: [f("rasse", "tier", "Welche Rasse hat Ihr Tier?", "Welche Rasse hat dein Tier?")] },
  geburtTier: {
    label: "Geburtsmonat und -jahr des Tieres",
    wer: "lead",
    rang: 12,
    wert: (c) => [c.form(/geburtsmonat/i), c.form(/geburtsjahr/i)].filter(Boolean).join(" ") || c.form(/geburtsdatum.*tier|alter.*tier/i) || ausChat(c, "Geboren"),
    fragen: [f("geburtTier", "tier", "Wann ist Ihr Tier ungefähr geboren (Monat und Jahr)?", "Wann ist dein Tier ungefähr geboren (Monat und Jahr)?")],
  },
  geschlechtTier: { label: "Geschlecht des Tieres", wer: "lead", rang: 13, wert: (c) => c.form(/geschlecht/i) ?? ausChat(c, "Geschlecht"), fragen: [f("geschlechtTier", "tier", "Ist Ihr Tier männlich oder weiblich?", "Ist dein Tier männlich oder weiblich?")] },
  haltung: { label: "Haltung (Wohnung oder Freigänger)", wer: "lead", rang: 14, wert: (c) => c.form(/haltung/i) ?? ausChat(c, "Haltung"), fragen: [f("haltung", "tier", "Ist Ihre Katze eine Wohnungskatze oder ein Freigänger?", "Ist deine Katze eine Wohnungskatze oder ein Freigänger?")] },
  hunderasse: { label: "Hunderasse", wer: "lead", rang: 11, wert: (c) => c.form(/rasse/i) ?? ausChat(c, "Rasse"), fragen: [f("hunderasse", "tier", "Welche Rasse hat Ihr Hund?", "Welche Rasse hat dein Hund?")] },
  hunde: { label: "Hunde (Anzahl, je Hund)", wer: "lead", rang: 15, wert: (c) => c.form(/anzahl tiere/i) ?? c.q("tier"), fragen: [f("hunde", "tier", "Wie viele Hunde leben bei Ihnen?", "Wie viele Hunde leben bei dir?")] },
  pferde: { label: "Pferde (Anzahl, Rasse, Nutzung)", wer: "lead", rang: 15, wert: (c) => c.form(/anzahl tiere/i) ?? c.q("tier"), fragen: [f("pferde", "tier", "Wie viele Pferde haben Sie, welche Rasse, und wofür nutzen Sie sie?", "Wie viele Pferde hast du, welche Rasse, und wofür nutzt du sie?")] },
} satisfies Record<string, AngabeDef>;

export type AngabeKey = keyof typeof ANGABEN;

/** Benötigte Angaben je Sparte laut Rechner (docs/preise-pilot.md), in der Reihenfolge der Anzeige. */
export const RECHNER_ANGABEN: Record<RechnerSparte, AngabeKey[]> = {
  "katze-kranken": ["plz", "tierart", "rasse", "geburtTier", "geschlechtTier", "haltung"],
  "katze-op": ["plz", "tierart", "rasse", "geburtTier", "geschlechtTier", "haltung"],
  "hund-kranken": ["plz", "tierart", "rasse", "geburtTier", "geschlechtTier"],
  "hund-op": ["plz", "tierart", "rasse", "geburtTier", "geschlechtTier"],
  haftpflicht: ["geburt", "familienstand", "plz", "oeffentlicherDienst"],
  hausrat: ["plz", "wohnflaeche", "geburt"],
  rechtsschutz: ["geburt", "familienstand", "lebensbereiche", "berufsgruppe"],
  wohngebaeude: ["adresseGebaeude", "gebaeude"],
  unfall: ["versichern", "geburt", "berufsgruppe"],
  "tierhalter-hund": ["plz", "hunderasse", "hunde"],
  "tierhalter-pferd": ["plz", "pferde"],
  kfz: ["fahrzeug", "vorversicherung", "plz", "geburt", "oeffentlicherDienst", "kfzVertrag", "kfzStart", "kfzFahrer", "kfzDetails"],
};

const TIERART: Partial<Record<RechnerSparte, string>> = { "katze-kranken": "Katze", "katze-op": "Katze", "hund-kranken": "Hund", "hund-op": "Hund", "tierhalter-hund": "Hund", "tierhalter-pferd": "Pferd" };

function ctxFor(src: AngabenQuelle, sparte: RechnerSparte): Ctx {
  const a = Object.fromEntries(qualificationPoints(src.angaben).map((p) => [p.key, p.value])) as Partial<Record<QualificationKey, string>>;
  const q = (k: QualificationKey): string | null => a[k]?.replace(/\s+/g, " ").trim() || null;
  const form = (re: RegExp) => src.formular.find((x) => re.test(x.label))?.value?.replace(/\s+/g, " ").trim() || null;
  const adresse = src.adresse ?? form(/adresse|anschrift|stra(ß|ss)e/i);
  const plz = plzAus(form(/postleitzahl|\bplz\b|post ?code/i), adresse, q("plz"));
  return { tierart: TIERART[sparte] ?? "", q, form, adresse, plz };
}

/** Angaben einer Sparte mit Wert (null = unbekannt). */
export function angabenFuerSparte(src: AngabenQuelle, sparte: string): { key: AngabeKey; label: string; wert: string | null }[] {
  const keys = RECHNER_ANGABEN[sparte as RechnerSparte];
  if (!keys) return [];
  const c = ctxFor(src, sparte as RechnerSparte);
  return keys.map((k) => ({ key: k, label: ANGABEN[k].label, wert: ANGABEN[k].wert(c) }));
}

/**
 * Sparten mit Rechner, für die sich der Lead interessiert: Produkt (z. B. „TKV-Katze“) bzw. Versicherungsinteresse aus
 * Formular und Assistent (Privatschutz). Tiere nur, wenn klar ist, welche und ob Kranken oder Halterhaftpflicht.
 */
export function spartenDesLeads(source: string | null | undefined, src: AngabenQuelle): RechnerSparte[] {
  const s = (source ?? "").toLowerCase();
  // Kfz-Versicherung als Produkt (lib/whatsapp/produkt-fragen.ts istKfzProdukt)
  if (istKfzProdukt(source)) return ["kfz"];
  const op = /\bop\b|op-/.test(s);
  if (!/privatschutz/.test(s) && /\btkv\b|tierkranken|tier-?op|katze|hundekranken|hunde-?op|pferd/.test(s) && !/futter|halter/.test(s)) {
    if (/katze/.test(s) || /\btkv\b|tierkranken|tier-?op/.test(s)) {
      const art = (src.formular.find((x) => /tierart/i.test(x.label))?.value ?? (/hund/.test(s) ? "hund" : "katze")).toLowerCase();
      if (/hund/.test(art)) return [op ? "hund-op" : "hund-kranken"];
      if (/pferd/.test(art)) return [];
      return [op ? "katze-op" : "katze-kranken"];
    }
    if (/hund/.test(s)) return [op ? "hund-op" : "hund-kranken"];
    return []; // Pferdekranken: noch kein Rechner im Pilot
  }
  const a = Object.fromEntries(qualificationPoints(src.angaben).map((p) => [p.key, p.value])) as Partial<Record<QualificationKey, string>>;
  const interesse = [src.formular.find((x) => /versicherungsinteresse|^interesse\b|sparte/i.test(x.label))?.value, a.interesse, /privatschutz/.test(s) ? "" : source]
    .filter(Boolean)
    .join(", ");
  const ohneTier = interesse.replace(/tierhalter-?\s*haftpflicht|tierkrankenversicherung/gi, "");
  const out: RechnerSparte[] = [];
  if (/haftpflicht/i.test(ohneTier)) out.push("haftpflicht");
  if (/hausrat/i.test(interesse)) out.push("hausrat");
  if (/rechtsschutz/i.test(interesse)) out.push("rechtsschutz");
  if (/wohngeb(ä|a)ude/i.test(interesse)) out.push("wohngebaeude");
  if (/unfall/i.test(interesse)) out.push("unfall");
  // Tierhalterhaftpflicht nur mit klarer Tierart (Ole, 17.11.2026: kein Hund oder Pferd ohne Tierhalterhaftpflicht)
  const tierText = `${interesse} ${a.tier ?? ""}`;
  if (/halter/i.test(tierText) && /hund/i.test(tierText)) out.push("tierhalter-hund");
  if (/halter/i.test(tierText) && /pferd/i.test(tierText)) out.push("tierhalter-pferd");
  return out;
}

/**
 * Folgefragen nach der Zusage (Ole, 17.11.2026): je gewählter Sparte genau die Rechner-Angaben, die noch unbekannt sind
 * und die der Lead beantworten kann. Doppelte (Geburtsdatum, PLZ) nur einmal, Reihenfolge nach Rang. Leer = keine Frage.
 */
export function folgefragen(sparten: readonly RechnerSparte[], src: AngabenQuelle): Folgefrage[] {
  const out: (Folgefrage & { rang: number; i: number })[] = [];
  const seen = new Set<string>();
  for (const sparte of sparten) {
    const c = ctxFor(src, sparte);
    for (const k of RECHNER_ANGABEN[sparte]) {
      const def: AngabeDef = ANGABEN[k];
      if (def.wer !== "lead" || !def.fragen) continue;
      const wert = def.wert(c);
      for (const fr of def.fragen) {
        if (seen.has(fr.key)) continue;
        // Mehrteilige Angabe (Gebäude): ein Teil gilt als bekannt, wenn er im bisherigen Wert erkennbar ist
        const bekannt = fr.bekannt ? !!wert && fr.bekannt.test(wert) : !!wert;
        seen.add(fr.key);
        if (!bekannt) out.push({ key: fr.key, feld: fr.feld, sie: fr.sie, du: fr.du, ...("knoepfe" in fr && fr.knoepfe ? { knoepfe: fr.knoepfe } : {}), rang: def.rang, i: out.length });
      }
    }
  }
  return out.sort((x, y) => x.rang - y.rang || x.i - y.i).map(({ key, feld, sie, du, knoepfe }) => ({ key, feld, sie, du, ...(knoepfe ? { knoepfe } : {}) }));
}

/** Kurzform, wenn der Nutzen schon in der Zwischenfrage stand (Ole, 19.11.2026: nicht zweimal „Damit … zeigen kann:“). */
const KURZ: Record<string, { sie: string; du: string }> = {
  geburt: { sie: "Und Ihr Geburtsdatum?", du: "Und dein Geburtsdatum?" },
};

/**
 * Folgefrage als Text; die erste mit Nutzen: „Damit Herr Kannapinn Ihnen gleich passende Beiträge zeigen kann: …“.
 * nutzenGesagt: die Zwischenfrage vor dem Termin hatte schon dieselbe Einleitung, dann knapp („Und Ihr Geburtsdatum?“,
 * sonst die Frage allein; Fragen mit Knöpfen bleiben wörtlich, damit die Knöpfe passen).
 */
export function folgefrageText(fr: Folgefrage, an: Ansprache, person: string, erste: boolean, o: { nutzenGesagt?: boolean } = {}): string {
  const frage = a(an, fr.du, fr.sie);
  if (!erste) return frage;
  if (o.nutzenGesagt) {
    const k = fr.knoepfe?.length ? null : KURZ[fr.key];
    return k ? a(an, k.du, k.sie) : frage;
  }
  return `${a(an, `Damit ${person} dir gleich passende Beiträge zeigen kann:`, `Damit ${person} Ihnen gleich passende Beiträge zeigen kann:`)} ${frage}`;
}
