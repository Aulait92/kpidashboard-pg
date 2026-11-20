// Policen vor dem Termin per WhatsApp (Ole, 17.11.2026, neu gefasst 18.11.2026): reine Regeln und Texte, ohne
// Datenbank, testbar.
//
// Ablauf (lib/policen/server.ts): Der Assistent bittet um Fotos oder PDFs der Policen direkt im Chat (lib/policen/bitte.ts,
// Knöpfe „Einverstanden“ / „Nicht zur Hand“). Der Tipp auf „Einverstanden“ ist die ausdrückliche Einwilligung
// (Art. 9 Abs. 2 lit. a DSGVO), denn jede Police kann Gesundheitsangaben enthalten. Ohne Einwilligung wird eine Datei
// nicht geladen (nur die Media-ID bis zu 24 Stunden), es kommt einmal die Nachfrage.
//
// KEINE KI für Unterlagen (Ole, 18.11.2026): keine OCR, keine Zuordnung, kein Auslesen, kein Widerruf per KI, für alle
// Sparten. Dateien werden nur geladen, am Inhalt auf den Dateityp geprüft, verschlüsselt gespeichert und dem
// zuständigen Vermittler gezeigt. Sparte höchstens laut Dateiname bzw. Begleittext (Regeln unten, ohne KI).
// Texte an Leads ohne Gedankenstriche, in beiden Ansprachen (a(an, du, sie)), keine Versprechen.

import { a, type Ansprache } from "@/lib/ansprache";

/** Größte Datei, die angenommen wird. */
export const POLICEN_MAX_BYTES = 10 * 1024 * 1024;
/** Höchstens so viele Unterlagen je Lead (Schutz vor Fluten). */
export const POLICEN_MAX_JE_LEAD = 30;
/** Löschfrist: Tage nach dem (letzten) Termin, ohne Termin nach dem Eingang (Ole, 18.11.2026: 90 Tage). */
export const LOESCHFRIST_TAGE = 90;
/** Ausstehende Einwilligung: nach so vielen Stunden verfällt die Unterlage (nur die Media-ID war gemerkt). */
export const WARTEN_STUNDEN = 24;
/** Erinnerung an den Vermittler („In die Kundenakte übernehmen“) so viele Tage vor der Löschung, nur bei Abschluss. */
export const ERINNERUNG_TAGE = 14;
/** Version des Datenschutzhinweises /datenschutz/policen (steht im Nachweis; bei jeder inhaltlichen Änderung hochzählen). */
export const DATENSCHUTZ_VERSION = "2026-11-19.1";
/** Vermerk, wenn der Vermittler eine Unterlage behält. */
export const BEHALTEN_VERMERK = "Beratungsdokumentation (§ 61 VVG)";

/** Einwilligung zu Gesundheitsunterlagen erst ab diesem Alter (docs/recht-gesundheitsunterlagen.md Abschnitt e, Punkt 11). */
export const VOLLJAEHRIG_AB = 18;

/**
 * Minderjährig laut Formularangaben (Lead.formData: Label/Wert-Liste)? Nur wenn ein Geburtsdatum bzw. Alter der Person
 * eindeutig unter 18 ergibt; Tierangaben („Geburtsjahr (Tier)“) zählen nicht. Unbekannt: false.
 */
export function minderjaehrig(formData: unknown, now = new Date()): boolean {
  if (!Array.isArray(formData)) return false;
  for (const x of formData as { label?: unknown; value?: unknown }[]) {
    const label = typeof x?.label === "string" ? x.label.toLowerCase() : "";
    const value = typeof x?.value === "string" || typeof x?.value === "number" ? String(x.value).trim() : "";
    if (!label || !value || /tier|hund|katze|pferd|kind/.test(label)) continue;
    if (/^(alter|ihr alter|dein alter)\b/.test(label) && /^\d{1,3}$/.test(value)) return Number(value) < VOLLJAEHRIG_AB;
    if (!/geburtsdatum|geburtstag|geboren am/.test(label)) continue;
    const m = value.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/) ?? value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) continue;
    const [j, mo, t] = m[0].includes("-") ? [Number(m[1]), Number(m[2]), Number(m[3])] : [Number(m[3]), Number(m[2]), Number(m[1])];
    if (j < 1900 || mo < 1 || mo > 12 || t < 1 || t > 31) continue;
    const volljaehrigAm = Date.UTC(j + VOLLJAEHRIG_AB, mo - 1, t);
    return now.getTime() < volljaehrigAm;
  }
  return false;
}

/**
 * Minderjährig laut Chat: Der Lead hat bestätigt, dass ein Geburtsdatum unter 18 sein eigenes ist (Conversation.
 * qualificationData.geburt mit „eigenes, bestätigt“, lib/whatsapp/geburt-chat.ts). Unbestätigte Daten zählen nicht.
 */
export function minderjaehrigLautChat(qualificationData: unknown, now = new Date()): boolean {
  if (!qualificationData || typeof qualificationData !== "object" || Array.isArray(qualificationData)) return false;
  const g = (qualificationData as Record<string, unknown>).geburt;
  if (typeof g !== "string" || !/eigenes, bestätigt/.test(g)) return false;
  return minderjaehrig([{ label: "Geburtsdatum", value: g.replace(/\s*\(.*\)\s*$/, "") }], now);
}

/**
 * Notschalter POLICEN_WHATSAPP_AUS (Railway-Variable): Bitte um Policen, Einwilligung und Ablage aus. Sonst ist die
 * Funktion an, sobald die Ablage eingerichtet ist (ablage.ts ablageBereit: privater EU-Bucket und Schlüssel).
 */
export function policenNotAus(env: Record<string, string | undefined> = process.env): boolean {
  return /^(1|true|ja|an|on)$/i.test((env.POLICEN_WHATSAPP_AUS ?? "").trim());
}

/** Notschalter POLICEN_GESUNDHEIT_AUS: Kranken/BU/Leben für alle Vermittler aus (z. B. wenn der DPF wegfällt). */
export function gesundheitNotAus(env: Record<string, string | undefined> = process.env): boolean {
  return /^(1|true|ja|an|on)$/i.test((env.POLICEN_GESUNDHEIT_AUS ?? "").trim());
}

/** Version der AVV-Ergänzung (b) „Versicherungsunterlagen über WhatsApp“ (Karte unter Einstellungen). */
export const AVV_POLICEN_VERSION = "b-2026-11-17";

/**
 * Kranken/BU/Leben für diesen Vermittler an (Rechtsprüfung A5, Ole 18.11.2026)? Intern/Test (policenIntern, isTest):
 * sofort. Sonst erst, wenn er der AVV-Ergänzung (b) in der aktuellen Version zugestimmt hat UND seine
 * Datenschutzhinweis-URL (https) hinterlegt ist. Notschalter POLICEN_GESUNDHEIT_AUS: für alle aus.
 */
export function gesundheitFreigegeben(
  c:
    | { isTest?: boolean | null; policenIntern?: boolean | null; policenAvvZugestimmtAt?: Date | null; policenAvvVersion?: string | null; policenDatenschutzUrl?: string | null }
    | null
    | undefined,
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (!c || gesundheitNotAus(env)) return false;
  if (c.policenIntern || c.isTest) return true;
  return !!c.policenAvvZugestimmtAt && c.policenAvvVersion === AVV_POLICEN_VERSION && /^https:\/\/\S+$/i.test((c.policenDatenschutzUrl ?? "").trim());
}
export const GESUNDHEIT_FREIGABE_SELECT = { isTest: true, policenIntern: true, policenAvvZugestimmtAt: true, policenAvvVersion: true, policenDatenschutzUrl: true } as const;

export const SPARTEN = {
  haftpflicht: { label: "Haftpflicht", gesundheit: false },
  hausrat: { label: "Hausrat", gesundheit: false },
  wohngebaeude: { label: "Wohngebäude", gesundheit: false },
  kfz: { label: "Kfz", gesundheit: false },
  rechtsschutz: { label: "Rechtsschutz", gesundheit: false },
  tier: { label: "Tierversicherung", gesundheit: false },
  kranken: { label: "Krankenversicherung", gesundheit: true },
  bu: { label: "Berufsunfähigkeit", gesundheit: true },
  leben: { label: "Leben/Rente", gesundheit: true },
  pflege: { label: "Pflege", gesundheit: true },
  unfall: { label: "Unfall", gesundheit: true },
  sonstig: { label: "Sonstiges", gesundheit: false },
} as const;
export type Sparte = keyof typeof SPARTEN;
export const SPARTE_KEYS = Object.keys(SPARTEN) as Sparte[];
export const isSparte = (v: unknown): v is Sparte => typeof v === "string" && v in SPARTEN;
export const sparteLabel = (s: string | null | undefined) => (isSparte(s) ? SPARTEN[s].label : "Unterlage");

// Reihenfolge zählt: Tier vor Kranken/Haftpflicht (Tierkranken, Tierhalterhaftpflicht), Wohngebäude vor Haftpflicht
const SPARTE_RE: [RegExp, Sparte][] = [
  [/(tier|hunde?|katzen?|pferde?)\s*-?\s*(op|kranken|halter|haftpflicht|versicherung)|\btkv\b/i, "tier"],
  [/berufsunf|\bbuz?\b|dienstunf|erwerbsunf|grundf(ä|ae)hig|existenzschutz/i, "bu"],
  [/kranken|\bpkv\b|zahn|beihilfe|heilpraktiker|krankenhaus|tagegeld/i, "kranken"],
  [/pflege/i, "pflege"],
  [/unfall/i, "unfall"],
  [/lebensvers|risikoleben|\bleben\b|sterbegeld|rentenvers|altersvorsorge|riester|r(ü|ue)rup/i, "leben"],
  [/wohngeb(ä|ae)ude|geb(ä|ae)udevers/i, "wohngebaeude"],
  [/hausrat/i, "hausrat"],
  [/rechtsschutz/i, "rechtsschutz"],
  [/\bkfz\b|kraftfahr|auto\s*vers|autoversicherung|teilkasko|vollkasko|motorrad/i, "kfz"],
  [/haftpflicht|\bphv\b/i, "haftpflicht"],
];

/** Sparte aus einem Text (Dateiname, Begleittext, Vertragsliste); null = nicht erkennbar. */
export function sparteAusText(text: string | null | undefined): Sparte | null {
  const t = (text ?? "").replace(/[_.-]+/g, " ");
  if (!t.trim()) return null;
  for (const [re, s] of SPARTE_RE) if (re.test(t)) return s;
  return null;
}

/** Alle Sparten in einem Text (z. B. Vertragsliste „Haftpflicht HUK, Hausrat Allianz“), je Teil bei Komma, „und“ usw. */
export function spartenAusText(text: string | null | undefined): Sparte[] {
  const teile = (text ?? "").split(/[,;/+\n]|\bund\b|\bsowie\b/i);
  return [...new Set(teile.map(sparteAusText).filter((x): x is Sparte => !!x))];
}

/** Nennt dieser Text (z. B. die Vertragsliste „Haftpflicht HUK, BU Allianz“) eine Sparte mit Gesundheitsangaben? */
// Wie lib/angebote.ts GESUNDHEITS_SPARTE (hier ohne Server-Abhängigkeiten), dazu Unfall (Gesundheitsfragen im Antrag)
const GESUNDHEIT_RE =
  /kranken|zahn|berufsunf|\bbuz?\b|dienstunf|erwerbsunf|grundf(ä|ae)hig|existenzschutz|leben|sterbegeld|pflege|dread|schwere\s*krankheit|\bpkv\b|beihilfe|heilpraktiker|sehhilfe|tagegeld|unfall/i;

export function gesundheitInText(text: string | null | undefined): boolean {
  const t = (text ?? "").replace(/(tier|hunde?|katzen?|pferde?)\s*-?\s*(op|kranken)[\wäöüß-]*/gi, "");
  return GESUNDHEIT_RE.test(t);
}

export const istGesundheitsbezug = (s: string | null | undefined) => isSparte(s) && SPARTEN[s].gesundheit;

// ─── Dateitypen ─────────────────────────────────────────────────────────────

export type PolicenTyp = "application/pdf" | "image/jpeg" | "image/png" | "image/webp";

/** Erlaubter Typ anhand des Inhalts (nicht der Angabe von WhatsApp); null = nicht erlaubt (z. B. HEIC, Word). */
export function typAusInhalt(b: Uint8Array): PolicenTyp | null {
  if (b.length < 12) return null;
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return "application/pdf";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}

/** Typ laut Angabe von WhatsApp (nur für den Dateinamen, solange nichts geladen ist). */
export function typAusMime(mime: string | null | undefined): PolicenTyp {
  const m = (mime ?? "").toLowerCase().split(";")[0].trim();
  if (m === "image/jpeg" || m === "image/jpg") return "image/jpeg";
  if (m === "image/png" || m === "image/webp") return m;
  return "application/pdf";
}

/** Vorab nach der Angabe von WhatsApp: lohnt sich das Laden? (HEIC, Word, Videos … nicht) */
export function mimeErlaubt(mime: string | null | undefined): boolean {
  const m = (mime ?? "").toLowerCase().split(";")[0].trim();
  return ["application/pdf", "image/jpeg", "image/jpg", "image/png", "image/webp"].includes(m);
}

const ENDUNG: Record<PolicenTyp, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Dateiname: von WhatsApp (Dokument) bzw. „Foto 17.11.2026.jpg“ (Bild), ohne Pfadzeichen. */
export function dateiname(original: string | null | undefined, typ: PolicenTyp, now = new Date()): string {
  const clean = (original ?? "").replace(/[\\/\r\n"<>]/g, "_").trim().slice(0, 160);
  if (clean) return /\.[a-z0-9]{2,5}$/i.test(clean) ? clean : `${clean}.${ENDUNG[typ]}`;
  const tag = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(now);
  return `${typ === "application/pdf" ? "Dokument" : "Foto"} ${tag}.${ENDUNG[typ]}`;
}

// ─── Texte an den Lead ──────────────────────────────────────────────────────
// Die Bitte selbst, die Knöpfe und die Nachfrage stehen in lib/policen/bitte.ts.

/** Vermittler wie in lib/whatsapp/gespraech.ts: nom „Herr Kannapinn“, dat „Herrn Kannapinn“. */
export type Person = { nom: string; dat: string };

/** Eingangsbestätigung, höchstens einmal je Lead (Ole, 18.11.2026). */
export const angekommenText = (an: Ansprache) => a(an, "Danke, ist angekommen. Hast du noch weitere?", "Danke, ist angekommen. Haben Sie noch weitere?");
export const ANGEKOMMEN_RE = /ist angekommen\./;
/** Nach „Ja, einverstanden“ auf die Nachfrage, wenn die Bestätigung schon einmal kam. */
export const angekommenKurzText = () => "Danke, ist angekommen.";

/** Kranken/BU/Leben für diesen Vermittler nicht freigegeben, Datei laut Name bzw. Begleittext aus diesen Sparten. */
export function gesundheitAusText(an: Ansprache, person: Person): string {
  return a(
    an,
    `Danke! Unterlagen zur Kranken-, BU- oder Lebensversicherung speichere ich hier nicht, die schaust du dir am besten im Termin gemeinsam mit ${person.dat} an.`,
    `Danke! Unterlagen zur Kranken-, BU- oder Lebensversicherung speichere ich hier nicht, die schauen Sie sich am besten im Termin gemeinsam mit ${person.dat} an.`,
  );
}

/** Minderjährig laut Formular: keine Einwilligung, Unterlagen im Termin. */
export function minderjaehrigText(an: Ansprache, person: Person): string {
  return a(
    an,
    `Danke! Deine Unterlagen schaust du dir am besten im Termin gemeinsam mit ${person.dat} an, hier speichere ich sie nicht.`,
    `Danke! Ihre Unterlagen schauen Sie sich am besten im Termin gemeinsam mit ${person.dat} an, hier speichere ich sie nicht.`,
  );
}
export const formatText = (an: Ansprache) =>
  a(an, "Diese Datei kann ich leider nicht öffnen. Schick die Police gern als Foto oder PDF.", "Diese Datei kann ich leider nicht öffnen. Schicken Sie die Police gern als Foto oder PDF.");
export const zuGrossText = (an: Ansprache) =>
  a(an, "Die Datei ist leider zu groß (höchstens 10 MB). Schick gern ein Foto der ersten Seite.", "Die Datei ist leider zu groß (höchstens 10 MB). Schicken Sie gern ein Foto der ersten Seite.");
export const nichtGeladenText = (an: Ansprache) =>
  a(an, "Leider konnte ich die Datei nicht laden. Schick sie gern noch einmal.", "Leider konnte ich die Datei nicht laden. Schicken Sie sie gern noch einmal.");
/** Virenprüfung mit Befund (lib/sicherheit/virenpruefung.ts): neutral, ohne „Virus“, Datei ist verworfen. */
export const virenText = (an: Ansprache) =>
  a(
    an,
    "Diese Datei konnte ich leider nicht annehmen. Schick die Police gern als Foto oder als PDF direkt aus deinen Unterlagen.",
    "Diese Datei konnte ich leider nicht annehmen. Schicken Sie die Police gern als Foto oder als PDF direkt aus Ihren Unterlagen.",
  );
/** Prüfung gerade nicht möglich und VIRENPRUEFUNG_PFLICHT an: Datei nicht angenommen. */
export const spaeterText = (an: Ansprache) =>
  a(
    an,
    "Ich kann die Datei gerade nicht annehmen. Schick sie gern später noch einmal oder bring sie zum Termin mit.",
    "Ich kann die Datei gerade nicht annehmen. Schicken Sie sie gern später noch einmal oder bringen Sie sie zum Termin mit.",
  );
export const widerrufText = (an: Ansprache) => a(an, "Erledigt, deine Unterlagen sind gelöscht.", "Erledigt, Ihre Unterlagen sind gelöscht.");

/**
 * Erkennt die Bitte um Policen in einer unserer Nachrichten (nur einmal je Chat), auch die früheren Fassungen
 * („Fotos oder PDFs Ihrer Policen“, „… Ihrer bisherigen Versicherungen“).
 */
export const EINLADUNG_RE = /Fotos oder PDFs (deiner|Ihrer) (aktuellen Policen|Policen|bisherigen Versicherungen)/;

/** Policen-Funktion aus, aber jemand schickt trotzdem eine Datei: nichts abrufen, freundlich auf den Termin verweisen. */
export const ausText = (an: Ansprache) =>
  a(an, "Danke! Deine Unterlagen schauen wir uns am besten im Termin gemeinsam an, hier speichere ich sie nicht.", "Danke! Ihre Unterlagen schauen wir uns am besten im Termin gemeinsam an, hier speichere ich sie nicht.");

/**
 * Häkchen in der Buchung (/book, nicht vorausgewählt): Opt-in für Erinnerungen per WhatsApp zur Terminvorbereitung
 * (Rechtsprüfung A8, § 7 UWG). Ohne Häkchen erinnert der Assistent nicht an die Policen (server.ts darfPolicenErinnern).
 */
export const ERINNERUNG_OPTIN_TEXT =
  "Ich möchte per WhatsApp an die Vorbereitung meines Termins erinnert werden (z. B. an meine Unterlagen). Abmelden jederzeit mit STOP.";
export const ERINNERUNG_OPTIN_VERSION = "2026-11-18.1";

/**
 * Häkchen „Erinnerung an die Unterlagen“ auf /book. Standard seit 20.11.2026 (Ole direkt freigegeben): Nutzen fett vorn,
 * „(empfohlen)“, nie vorausgewählt (EuGH Planet49). Pflichtangaben: Zweck (Erinnerung an die Unterlagen für den Termin),
 * Kanal WhatsApp, Abmeldung STOP. Splittest buchung_erinnerung (lib/experimente.ts): B zeigt denselben Wortlaut als
 * hervorgehobene Karte statt als grauen Kleindruck.
 */
export function erinnerungOptin(fassung: "a" | "b", an: Ansprache): { fett: string; rest: string; text: string; version: string } {
  const fett = a(an, "Damit in deinem Termin nichts fehlt:", "Damit in Ihrem Termin nichts fehlt:");
  const rest = "Ja, bitte per WhatsApp an meine Unterlagen erinnern (empfohlen). Abmelden jederzeit mit STOP.";
  return { fett, rest, text: `${fett} ${rest}`, version: `2026-11-20.${fassung === "b" ? "karte." : ""}${an}` };
}

/** Hinweis im Chatverlauf statt Dateiname oder Vorschau (auch im Admin-Chat). */
export const CHAT_HINWEIS = "Dokument für den Vermittler";

// ─── Antworten des Leads (nur Regeln, keine KI) ─────────────────────────────

const norm = (t: string | null | undefined) => (t ?? "").trim().toLowerCase().replace(/[.!]+$/, "");

// Nicht gemeint: Termin, Versicherungsvertrag (der Widerruf eines Vertrags gehört in den Termin)
const KEIN_UNTERLAGEN_BEZUG = /(termin|vertrag|antrag)/;
const UNTERLAGEN = /(unterlage|police|dokument|datei|foto|bild|pdf|daten|alles|gesundheitsangabe|sachen)/;

/**
 * Widerruf nach Regeln, ohne KI (Ole, 18.11.2026): „Widerruf“, „löschen“, „bitte alles löschen“, „Unterlagen löschen“,
 * „Einwilligung zurück“, „nicht mehr einverstanden“, „bitte nicht mehr speichern“, „will ich doch nicht mehr“. Nur
 * relevant, wenn der Lead Unterlagen oder eine Einwilligung hat (server.ts). Nicht: „Termin löschen“ und nicht der
 * Widerruf eines Versicherungsvertrags („meinen alten Vertrag widerrufen“), der gehört in den Termin.
 */
export function istWiderruf(text: string | null | undefined): boolean {
  const t = norm(text);
  if (!t || t.length > 300) return false;
  if (/^(ich )?(widerruf|widerrufe|widerrufen)( (meine|die|der|ihre|deine) einwilligung)?$/.test(t)) return true;
  // Kurz: „löschen“, „bitte löschen“, „alles löschen bitte“, „löscht das“, „bitte wieder löschen“
  if (/^(bitte )?(alles |das |die |sie |wieder )*(lösch|loesch)(en|t|e)?( (sie|das|alles|die|bitte|wieder|doch))*( bitte)?$/.test(t)) return true;
  if (/widerruf/.test(t) && /(einwilligung|einverständnis|zustimmung|unterlage|dokument|daten|speicher|foto|bild)/.test(t)) return true;
  if (/(einwilligung|einverständnis|zustimmung)/.test(t) && /(zurück|nicht mehr|entzieh|ziehe)/.test(t)) return true;
  if (/(doch|nicht mehr) (nicht )?einverstanden/.test(t) && !KEIN_UNTERLAGEN_BEZUG.test(t)) return true;
  if (/nicht (mehr )?(speichern|gespeichert|aufbewahren|behalten)/.test(t) && UNTERLAGEN.test(t) && !KEIN_UNTERLAGEN_BEZUG.test(t)) return true;
  if (/(will|möchte|moechte) (das|ich) (doch )?nicht mehr/.test(t) && !KEIN_UNTERLAGEN_BEZUG.test(t)) return true;
  return /(lösch|loesch|entfern|vernicht)/.test(t) && UNTERLAGEN.test(t) && !/termin/.test(t);
}

/** Getippte Zustimmung direkt auf die Nachfrage (Knopf ist der Normalfall). */
export function istZustimmung(text: string | null | undefined): boolean {
  return /^(ja|ja,? (einverstanden|gern|gerne|klar|bitte|okay|ok|passt)|einverstanden|ok|okay)$/.test(norm(text));
}

// ─── Wann einladen, was bereitlegen ─────────────────────────────────────────

/** Bestehende Verträge laut Chat-Angaben (angaben.vorhanden) bzw. Komplettcheck „Ja“. */
export function hatVertraege(qualificationData: unknown): boolean {
  if (!qualificationData || typeof qualificationData !== "object" || Array.isArray(qualificationData)) return false;
  const q = qualificationData as Record<string, unknown>;
  const ja = (v: unknown) => typeof v === "string" && /^\s*(ja|yes)\b/i.test(v);
  if (ja(q.komplettcheck)) return true;
  const v = typeof q.vorhanden === "string" ? q.vorhanden.trim() : "";
  if (!v) return false;
  if (/^(keine?|nein|nichts|noch keine?|bisher keine?|ohne|neu)\b/i.test(v)) return false;
  // „beides neu“, „wäre alles neu“, „noch nicht versichert“ (Ole, 17.11.2026: Einladung kam trotz „beides neu“).
  // Gemischte Antworten („Haftpflicht bei HUK, Hausrat neu“) zählen weiter als vorhanden.
  const neu =
    /\b(beides|beide|alles|alle|komplett|w[äa]re|w[äa]ren|ist|sind)\s+(noch\s+)?(ganz\s+)?neu\b/i.test(v) ||
    /\b(noch\s+)?(nicht|nirgends|nirgendwo)\s+(\w+\s+)?versichert\b/i.test(v);
  return !(neu && !/\bbei\s+\S/i.test(v));
}

/** Einladung jetzt schicken? Nur bei bestehenden Verträgen und nur einmal je Chat. */
export function einladungFaellig(o: { qualificationData: unknown; outbound: (string | null)[] }): boolean {
  return hatVertraege(o.qualificationData) && !o.outbound.some((b) => EINLADUNG_RE.test(b ?? ""));
}

/** Vertragsliste nennt eine Gesundheitssparte? (für den Zusatzsatz in der Einladung) */
export function gesundheitInVertraegen(qualificationData: unknown): boolean {
  if (!qualificationData || typeof qualificationData !== "object") return false;
  const q = qualificationData as Record<string, unknown>;
  return gesundheitInText([q.vorhanden, q.komplettcheck].filter((x) => typeof x === "string").join(" "));
}

/** Bereitlegen-Liste ohne „bisherige Policen“, wenn der Lead schon welche geschickt hat. */
export function ohneBisherigePolicen(liste: string[], geschickt: boolean): string[] {
  if (!geschickt) return liste;
  return liste
    .filter((x) => !/bisherigen? Polic(e|en), falls vorhanden|bestehenden Verträge und Policen/i.test(x))
    .map((x) => x.replace(/die bisherige Gebäudepolice, /i, ""));
}

// ─── Löschfrist ─────────────────────────────────────────────────────────────

const TAG_MS = 24 * 60 * 60 * 1000;

/**
 * Wann wird die Unterlage gelöscht? 90 Tage nach dem letzten Termin, ohne Termin 90 Tage nach dem Eingang (Ole,
 * 18.11.2026). Bei Abschluss mit Erinnerung an den Vermittler 14 Tage vorher (abschlussSchritt). null:
 * „Beratungsdokumentation behalten“, dann löscht nur der Vermittler (bzw. Widerruf, Art. 17, Vertragsende).
 */
export function loeschDatum(o: { termine: Date[]; eingang: Date; behalten?: boolean }): Date | null {
  if (o.behalten) return null;
  const ref = o.termine.length ? new Date(Math.max(...o.termine.map((d) => d.getTime()))) : o.eingang;
  return new Date(ref.getTime() + LOESCHFRIST_TAGE * TAG_MS);
}

/**
 * Nach Abschluss: 14 Tage vor der Löschung den Vermittler erinnern („In die Kundenakte übernehmen“), dann am
 * Löschtag löschen. Die Löschung verschiebt sich nicht (höchstens 90 Tage nach dem Termin).
 */
export function abschlussSchritt(o: { datum: Date; erinnertAt: Date | null; now: Date }): { aktion: "loeschen" | "erinnern" | "warten"; deleteAfter: Date } {
  if (o.now.getTime() >= o.datum.getTime()) return { aktion: "loeschen", deleteAfter: o.datum };
  if (!o.erinnertAt && o.now.getTime() >= o.datum.getTime() - ERINNERUNG_TAGE * TAG_MS) return { aktion: "erinnern", deleteAfter: o.datum };
  return { aktion: "warten", deleteAfter: o.datum };
}

/** Abschluss laut Lead-Status (wie im Kontakt: „Abschluss“). */
export const istAbschluss = (status: string | null | undefined) => (status ?? "").trim().toLowerCase() === "abschluss";
