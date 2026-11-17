// Policen vor dem Termin per WhatsApp (Ole, 17.11.2026): reine Regeln und Texte, ohne Datenbank, testbar.
//
// Ablauf (lib/policen/server.ts): Der Lead schickt Fotos oder PDFs seiner Policen in den Chat. Die App lädt sie bei
// 360dialog, ordnet die Sparte zu (KI, nur Klassifikation) und speichert sie verschlüsselt am Lead.
//   - Sachversicherungen (Haftpflicht, Hausrat, Wohngebäude, Kfz, Rechtsschutz, Tier): speichern, kurz bestätigen,
//     Vertragsdaten auslesen (Gesellschaft, Sparte, Beitrag, Zahlweise, Summe, SB, Ablauf).
//   - Gesundheitsbezug (Kranken, BU, Leben, Pflege, Unfall): nur mit Schalter POLICEN_GESUNDHEIT_AN und nur mit
//     ausdrücklicher Einwilligung (Art. 9 Abs. 2 lit. a DSGVO), nie auslesen. Ohne Einwilligung bzw. Schalter aus:
//     Datei verwerfen, freundlicher Hinweis.
//   - Schalter an (docs/recht-gesundheitsunterlagen.md Abschnitt b, Ole 17.11.2026): Nennt der Lead eine
//     Gesundheitssparte, enthält schon die Einladung die Einwilligung (zwei Knöpfe). Ohne Einwilligung wird eine Datei
//     mit möglichem Gesundheitsbezug nicht geladen und nicht an die KI gegeben (vorabEinordnung, nur Dateiname,
//     Begleittext und Angaben des Leads); die Media-ID bleibt höchstens 24 Stunden, die Frage kommt einmal erneut.
//     Nach der Einwilligung ordnet die KI solche Unterlagen nur über einen EU-Endpunkt zu (policenKiEu), sonst gar nicht.
// Texte an Leads ohne Gedankenstriche, in beiden Ansprachen (a(an, du, sie)), keine Versprechen.

import { bedrockEu, type BedrockEu } from "@/lib/ki-eu-konfig";
import { a, type Ansprache } from "@/lib/ansprache";

/** Größte Datei, die angenommen wird. */
export const POLICEN_MAX_BYTES = 10 * 1024 * 1024;
/** Höchstens so viele Unterlagen je Lead (Schutz vor Fluten). */
export const POLICEN_MAX_JE_LEAD = 30;
/** Löschfrist: Tage nach dem Termin (bzw. nach dem Eingang, wenn es keinen Termin gibt), wenn kein Abschluss. */
export const LOESCHFRIST_TAGE = 30;
/** Ausstehende Einwilligung: nach so vielen Stunden verfällt die Unterlage (nur die Media-ID war gemerkt). */
export const WARTEN_STUNDEN = 24;
/** Mit Abschluss: Löschung so viele Tage nach dem Abschluss (Standard), außer „Beratungsdokumentation behalten“. */
export const LOESCHFRIST_ABSCHLUSS_TAGE = 90;
/** Erinnerung an den Vermittler („In die Kundenakte übernehmen“) so viele Tage vor der Löschung nach Abschluss. */
export const ERINNERUNG_TAGE = 14;
/** Einwilligungsfrage höchstens so oft je Chat (Einladung bzw. erste Frage und einmal erneut). */
export const MAX_EINWILLIGUNGSFRAGEN = 2;
/** Version des Einwilligungstexts (steht im Protokoll; bei jeder inhaltlichen Änderung hochzählen). */
export const EINWILLIGUNG_VERSION = "2026-11-17.3";
/** Vermerk, wenn der Vermittler eine Unterlage behält. */
export const BEHALTEN_VERMERK = "Beratungsdokumentation (§ 61 VVG)";

/** Einwilligung zu Gesundheitsunterlagen erst ab diesem Alter (docs/recht-gesundheitsunterlagen.md Abschnitt e, Punkt 11). */
export const VOLLJAEHRIG_AB = 18;

/**
 * Minderjährig laut Formularangaben (Lead.formData: Label/Wert-Liste)? Nur wenn ein Geburtsdatum bzw. Alter der Person
 * eindeutig unter 18 ergibt; Tierangaben („Geburtsjahr (Tier)“) zählen nicht. Unbekannt: false (dann gilt der Satz im
 * Einwilligungstext „Zustimmen können Sie ab 18 Jahren.“).
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

/** Gesundheitsbezogene Unterlagen erlaubt? Railway-Variable POLICEN_GESUNDHEIT_AN, Standard aus (bis der Anwalt geprüft hat). */
export function policenGesundheitAn(env: Record<string, string | undefined> = process.env): boolean {
  return /^(1|true|ja|an|on)$/i.test((env.POLICEN_GESUNDHEIT_AN ?? "").trim());
}

/**
 * KI für Unterlagen mit möglichem Gesundheitsbezug (nach der Einwilligung): nur über einen EU-Endpunkt.
 * POLICEN_KI_REGION=eu und einer von:
 *   1. Amazon Bedrock Frankfurt (ki-eu.ts: KI_EU_AWS_ACCESS_KEY_ID, KI_EU_AWS_SECRET_ACCESS_KEY), bevorzugt;
 *   2. POLICEN_KI_EU_URL (Anthropic-kompatible Messages-API in der EU, z. B. Gateway) mit POLICEN_KI_EU_KEY,
 *      optional POLICEN_KI_EU_MODEL.
 * Fehlt beides: null, dann keine KI für diese Unterlagen, Einordnung nur nach Dateiname, Begleittext und Angaben des Leads.
 */
export type KiEndpunkt = { art?: "anthropic"; baseURL: string; apiKey: string; model: string | null } | BedrockEu;
export function policenKiEu(env: Record<string, string | undefined> = process.env): KiEndpunkt | null {
  if ((env.POLICEN_KI_REGION ?? "").trim().toLowerCase() !== "eu") return null;
  const bedrock = bedrockEu(env);
  if (bedrock) return { ...bedrock, model: (env.POLICEN_KI_EU_MODEL ?? "").trim() || bedrock.model };
  const baseURL = (env.POLICEN_KI_EU_URL ?? "").trim().replace(/\/$/, "");
  const apiKey = (env.POLICEN_KI_EU_KEY ?? "").trim();
  if (!/^https:\/\//i.test(baseURL) || !apiKey) return null;
  return { art: "anthropic", baseURL, apiKey, model: (env.POLICEN_KI_EU_MODEL ?? "").trim() || null };
}

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

export type Klassifikation = { sparte: Sparte | null; gesundheit: boolean; police: boolean };

/**
 * Entscheidung je Unterlage. KI-Ergebnis vorn; Dateiname und Begleittext können einen Gesundheitsbezug nur ergänzen,
 * nie aufheben. Ohne KI-Ergebnis und ohne erkennbare Sparte gilt vorsichtig: Gesundheitsbezug möglich.
 */
export function entscheide(o: { ki: Klassifikation | null; text?: string | null }): { sparte: Sparte | null; gesundheit: boolean } {
  const ausText = sparteAusText(o.text);
  if (o.ki) {
    const sparte = o.ki.sparte ?? ausText;
    return { sparte, gesundheit: o.ki.gesundheit || istGesundheitsbezug(o.ki.sparte) || istGesundheitsbezug(ausText) || gesundheitInText(o.text) };
  }
  if (ausText) return { sparte: ausText, gesundheit: istGesundheitsbezug(ausText) };
  return { sparte: null, gesundheit: true };
}

/**
 * Vor dem Laden, ohne Inhalt und ohne KI (Schalter an, noch keine Einwilligung): Sparte und ob ein Gesundheitsbezug
 * möglich ist. Grundlage nur Dateiname und Begleittext (text) sowie die Angaben des Leads (Vertragsliste, Produkt).
 * Unbekannt gilt als möglich; nur wenn der Lead ausschließlich Sachversicherungen genannt hat, nicht.
 */
export function vorabEinordnung(o: { text?: string | null; leadAngaben?: (string | null | undefined)[] }): { sparte: Sparte | null; gesundheitMoeglich: boolean } {
  const ausText = sparteAusText(o.text);
  if (ausText) return { sparte: ausText, gesundheitMoeglich: istGesundheitsbezug(ausText) || gesundheitInText(o.text) };
  if (gesundheitInText(o.text)) return { sparte: null, gesundheitMoeglich: true };
  const angaben = (o.leadAngaben ?? []).filter((x): x is string => typeof x === "string" && !!x.trim());
  const genannt = [...new Set(angaben.flatMap(spartenAusText).filter((x) => x !== "sonstig"))];
  const sparte = genannt.length === 1 ? genannt[0] : null;
  const leadGesundheit = angaben.some((x) => gesundheitInText(x)) || genannt.some(istGesundheitsbezug);
  return { sparte, gesundheitMoeglich: !genannt.length || leadGesundheit };
}

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

/** Vermittler wie in lib/whatsapp/gespraech.ts: nom „Herr Kannapinn“, dat „Herrn Kannapinn“. */
export type Person = { nom: string; dat: string };

/**
 * Einladung nach der Vertragsfrage (bzw. Komplettcheck „Ja“). Schalter aus: nur Sachversicherungen, nennt die
 * Vertragsliste eine Gesundheitssparte, kommt ein Satz dazu, dass die im Termin angeschaut werden.
 */
export function einladungText(an: Ansprache, person: Person, o: { gesundheitAn: boolean; gesundheitInListe?: boolean }): string {
  if (o.gesundheitAn) {
    return a(
      an,
      `Wenn du magst, schick gern Fotos oder PDFs deiner Policen hier in den Chat, dann kann sich ${person.nom} vorher einlesen. Sonst schauen wir sie im Termin gemeinsam an.`,
      `Wenn Sie mögen, schicken Sie gern Fotos oder PDFs Ihrer Policen hier in den Chat, dann kann sich ${person.nom} vorher einlesen. Sonst schauen wir sie im Termin gemeinsam an.`,
    );
  }
  const satz = a(
    an,
    `Wenn du magst, schick gern Fotos oder PDFs deiner Policen für Sachversicherungen wie Haftpflicht, Hausrat oder Kfz hier in den Chat, dann kann sich ${person.nom} vorher einlesen.`,
    `Wenn Sie mögen, schicken Sie gern Fotos oder PDFs Ihrer Policen für Sachversicherungen wie Haftpflicht, Hausrat oder Kfz hier in den Chat, dann kann sich ${person.nom} vorher einlesen.`,
  );
  const rest = o.gesundheitInListe
    ? "Unterlagen zur Kranken-, BU- oder Lebensversicherung schauen wir uns im Termin gemeinsam an."
    : a(an, "Sonst schauen wir sie im Termin gemeinsam an.", "Sonst schauen wir sie im Termin gemeinsam an.");
  return `${satz} ${rest}`;
}

/**
 * Kurze Policen-Bitte im Abschluss der Termin-Strecke bei Komplettcheck „Ja“ (Ole, 17.11.2026, P2: jeder Lead wird
 * einmal gebeten; kam die Einladung nach der Vertragsfrage nicht, z. B. ohne Antwort, steht sie hier). Schalter aus:
 * nur Sachversicherungen. Erkennbar an EINLADUNG_RE.
 */
export function policenBitteKurz(an: Ansprache, person: Person, o: { gesundheitAn: boolean }): string {
  const was = o.gesundheitAn ? "" : " für Sachversicherungen (z. B. Haftpflicht, Hausrat, Kfz)";
  return a(
    an,
    `Gern kannst du vorab Fotos oder PDFs deiner Policen${was} hier in den Chat schicken, dann schaut ${person.nom} sie mit an.`,
    `Gern können Sie vorab Fotos oder PDFs Ihrer Policen${was} hier in den Chat schicken, dann schaut ${person.nom} sie mit an.`,
  );
}

/**
 * Enge Policen-Bitte (Ole, 17.11.2026, P2) bei Komplettcheck „Nein“ bzw. unbekannt: nur der bestehende Vertrag in der
 * angefragten Sparte, freiwillig, ein Satz im Abschluss. wort = „Haftpflicht- und Hausratversicherung“ (ohne Artikel).
 */
export function policenBitteEng(an: Ansprache, person: Person, wort: string | null): string {
  const was = wort ? `eine ${wort}` : "dafür eine Versicherung";
  return a(
    an,
    `Falls du schon ${was} hast: Schick mir gern ein Foto der Police, dann vergleicht ${person.nom} direkt und achtet auf die Kündigungsfrist.`,
    `Falls Sie schon ${was} haben: Schicken Sie mir gern ein Foto der Police, dann vergleicht ${person.nom} direkt und achtet auf die Kündigungsfrist.`,
  );
}

/** Erkennt die Einladung in einer unserer Nachrichten (nur einmal je Chat), auch die Einladung mit Einwilligung. */
export const EINLADUNG_RE = /(Fotos oder PDFs (deiner|Ihrer) (Policen|bisherigen Versicherungen))|ein Foto der Police, dann vergleicht/;

/** Verantwortlicher im Einwilligungstext: Vermittler (Name in der Ansprache), Firma, Link zur Langfassung. */
export type Verantwortlicher = { person: Person; firma: string | null; link: string | null };

/** Firma nur, wenn sie etwas anderes sagt als der Name (z. B. nicht „Ole Kannapinn (Ole Kannapinn)“). */
function mitFirma(v: Verantwortlicher): string {
  const firma = (v.firma ?? "").replace(/\s+/g, " ").trim();
  if (!firma || v.person.nom.toLowerCase().includes(firma.toLowerCase())) return v.person.nom;
  return `${v.person.nom} (${firma})`;
}

/**
 * Ausdrückliche Einwilligung (Art. 9 Abs. 2 lit. a DSGVO), Wortlaut aus docs/recht-gesundheitsunterlagen.md
 * Abschnitt b, ergänzt um den Altershinweis (Abschnitt e, Punkt 11; Fassung 2026-11-17.3). In der Einladung
 * (Schalter an, Lead nennt eine Gesundheitssparte) bzw. nach einer Datei (nachDatei, erster Satz angepasst). Genau dieser Text wird mit EINWILLIGUNG_VERSION protokolliert. Höchstens 1.024
 * Zeichen (interaktive WhatsApp-Nachricht).
 */
export function einwilligungText(an: Ansprache, v: Verantwortlicher, o: { nachDatei?: boolean } = {}): string {
  const wer = mitFirma(v);
  const absaetze = [
    o.nachDatei
      ? a(
          an,
          "Danke für deine Unterlage. Unterlagen zur Kranken-, Berufsunfähigkeits-, Lebens-, Pflege- oder Unfallversicherung können Angaben zu deiner Gesundheit enthalten.",
          "Danke für Ihre Unterlage. Unterlagen zur Kranken-, Berufsunfähigkeits-, Lebens-, Pflege- oder Unfallversicherung können Angaben zu Ihrer Gesundheit enthalten.",
        )
      : a(
          an,
          "Vor dem Termin kannst du uns Fotos oder PDFs deiner bisherigen Versicherungen hier schicken. Unterlagen zur Kranken-, Berufsunfähigkeits-, Lebens-, Pflege- oder Unfallversicherung können Angaben zu deiner Gesundheit enthalten.",
          "Vor dem Termin können Sie uns Fotos oder PDFs Ihrer bisherigen Versicherungen hier schicken. Unterlagen zur Kranken-, Berufsunfähigkeits-, Lebens-, Pflege- oder Unfallversicherung können Angaben zu Ihrer Gesundheit enthalten.",
        ),
    a(
      an,
      `Bist du einverstanden, dass ${wer} deine Unterlagen einschließlich dieser Gesundheitsangaben speichert und zur Vorbereitung deines Termins nutzt? Eine KI ordnet jede Unterlage einer Versicherungsart zu, Gesundheitsangaben werden nicht ausgewertet. Dafür setzen wir Dienstleister ein, auch in den USA. Sehen kann die Unterlagen nur dein Berater.`,
      `Sind Sie einverstanden, dass ${wer} Ihre Unterlagen einschließlich dieser Gesundheitsangaben speichert und zur Vorbereitung Ihres Termins nutzt? Eine KI ordnet jede Unterlage einer Versicherungsart zu, Gesundheitsangaben werden nicht ausgewertet. Dafür setzen wir Dienstleister ein, auch in den USA. Sehen kann die Unterlagen nur Ihr Berater.`,
    ),
    a(
      an,
      "Zustimmen kannst du ab 18 Jahren. Unterlagen von mitversicherten Personen schick bitte nur mit deren Einverständnis (bei Kindern als Elternteil). Ohne Vertragsabschluss löschen wir alles 30 Tage nach dem Termin. Du kannst jederzeit widerrufen, zum Beispiel mit der Nachricht „Widerruf“.",
      "Zustimmen können Sie ab 18 Jahren. Unterlagen von mitversicherten Personen schicken Sie bitte nur mit deren Einverständnis (bei Kindern als Elternteil). Ohne Vertragsabschluss löschen wir alles 30 Tage nach dem Termin. Sie können jederzeit widerrufen, zum Beispiel mit der Nachricht „Widerruf“.",
    ),
    v.link ? `Mehr dazu: ${v.link}` : null,
  ];
  return absaetze.filter(Boolean).join("\n\n");
}
/** Erkennt die Einwilligungsfrage (neu und der frühere kurze Wortlaut). */
export const EINWILLIGUNG_RE = /einschließlich dieser Gesundheitsangaben|können Gesundheitsangaben enthalten\. Dürfen wir sie für/;

/** Einladung mit Einwilligung als interaktive Nachricht. */
export function einladungMitEinwilligung(an: Ansprache, v: Verantwortlicher): { text: string; buttons: { id: string; title: string }[] } {
  return { text: einwilligungText(an, v), buttons: EINWILLIGUNG_KNOEPFE };
}

export const KNOPF_JA = "Ja, einverstanden";
export const KNOPF_NEIN = "Lieber im Termin";
export const PAYLOAD_JA = "policen:ja";
export const PAYLOAD_NEIN = "policen:nein";
export const EINWILLIGUNG_KNOEPFE = [
  { id: PAYLOAD_JA, title: KNOPF_JA },
  { id: PAYLOAD_NEIN, title: KNOPF_NEIN },
];
/** Nach „Ja, einverstanden“ auf die Einladung (noch keine Datei da). */
export const einwilligungDankeText = (an: Ansprache) =>
  a(an, "Danke! Schick die Unterlagen einfach hier als Foto oder PDF.", "Danke! Schicken Sie die Unterlagen einfach hier als Foto oder PDF.");

export const angekommenText = () => "Danke, ist angekommen.";
export const ANGEKOMMEN_RE = /ist angekommen\./;
export const ablehnungText = () => "Kein Problem, dann schauen wir sie im Termin an.";

export function gesundheitAusText(an: Ansprache, person: Person): string {
  return a(
    an,
    `Danke! Unterlagen zur Kranken-, BU- oder Lebensversicherung speichere ich hier nicht, die schaust du dir am besten im Termin gemeinsam mit ${person.dat} an.`,
    `Danke! Unterlagen zur Kranken-, BU- oder Lebensversicherung speichere ich hier nicht, die schauen Sie sich am besten im Termin gemeinsam mit ${person.dat} an.`,
  );
}
export const formatText = (an: Ansprache) =>
  a(an, "Diese Datei kann ich leider nicht öffnen. Schick die Police gern als Foto oder PDF.", "Diese Datei kann ich leider nicht öffnen. Schicken Sie die Police gern als Foto oder PDF.");
export const zuGrossText = (an: Ansprache) =>
  a(an, "Die Datei ist leider zu groß (höchstens 10 MB). Schick gern ein Foto der ersten Seite.", "Die Datei ist leider zu groß (höchstens 10 MB). Schicken Sie gern ein Foto der ersten Seite.");
export const nichtGeladenText = (an: Ansprache) =>
  a(an, "Leider konnte ich die Datei nicht laden. Schick sie gern noch einmal.", "Leider konnte ich die Datei nicht laden. Schicken Sie sie gern noch einmal.");
export const widerrufText = (an: Ansprache) => a(an, "Erledigt, deine Unterlagen sind gelöscht.", "Erledigt, Ihre Unterlagen sind gelöscht.");

// ─── Antworten des Leads ────────────────────────────────────────────────────

const norm = (t: string | null | undefined) => (t ?? "").trim().toLowerCase().replace(/[.!]+$/, "");

// Nicht gemeint: Termin, Versicherungsvertrag (der Widerruf eines Vertrags gehört in den Termin)
const KEIN_UNTERLAGEN_BEZUG = /(termin|vertrag|antrag)/;
const UNTERLAGEN = /(unterlage|police|dokument|datei|foto|bild|pdf|daten|alles|gesundheitsangabe)/;

/**
 * Eindeutiger Widerruf nach Regeln: „Widerruf“, „Unterlagen löschen“, „Einwilligung zurück“, „nicht mehr einverstanden“,
 * „bitte nicht mehr speichern“. Nicht: „Termin löschen“ und nicht der Widerruf eines Versicherungsvertrags
 * („meinen alten Vertrag widerrufen“), der gehört in den Termin. Sinngemäße Fälle prüft die KI (widerrufVerdacht).
 */
export function istWiderruf(text: string | null | undefined): boolean {
  const t = norm(text);
  if (!t) return false;
  if (/^(ich )?(widerruf|widerrufe|widerrufen)( (meine|die|der|ihre|deine) einwilligung)?$/.test(t)) return true;
  if (/widerruf/.test(t) && /(einwilligung|einverständnis|zustimmung|unterlage|dokument|daten|speicher|foto|bild)/.test(t)) return true;
  if (/(einwilligung|einverständnis|zustimmung)/.test(t) && /(zurück|nicht mehr|entzieh|ziehe)/.test(t)) return true;
  if (/(doch|nicht mehr) (nicht )?einverstanden/.test(t) && !KEIN_UNTERLAGEN_BEZUG.test(t)) return true;
  if (/nicht (mehr )?(speichern|gespeichert|aufbewahren|behalten)/.test(t) && UNTERLAGEN.test(t) && !KEIN_UNTERLAGEN_BEZUG.test(t)) return true;
  return /(lösch|loesch|entfern|vernicht)/.test(t) && UNTERLAGEN.test(t) && !/termin/.test(t);
}

/**
 * Könnte ein Widerruf sein, ist aber nach den Regeln nicht eindeutig: Dann entscheidet die KI (lib/policen/ki.ts
 * widerrufKi), ohne KI gilt die Regel. Nur relevant, wenn der Lead Unterlagen oder eine Einwilligung hat.
 */
export function widerrufVerdacht(text: string | null | undefined): boolean {
  const t = norm(text);
  if (!t || t.length > 600) return false;
  return /(widerruf|zurück|lösch|loesch|entfern|vernicht|nicht (mehr )?(speicher|einverstanden|gespeichert|haben|nutzen|verwenden)|doch nicht|will (das|ich) (doch )?nicht|möchte (das|ich) (doch )?nicht|lieber nicht|datenschutz|dsgvo|meine daten|wieder weg|wieder raus|anders überlegt|rückgängig)/.test(t);
}

/** Getippte Zustimmung auf die Einwilligungsfrage (Knopf ist der Normalfall). */
export function istZustimmung(text: string | null | undefined): boolean {
  return /^(ja|ja,? (einverstanden|gern|gerne|klar|bitte|okay|ok|passt)|einverstanden|ok|okay)$/.test(norm(text));
}
export function istAblehnung(text: string | null | undefined): boolean {
  return /^(nein|nein,? danke|lieber (nicht|im termin)|lieber im termin|nicht speichern)$/.test(norm(text));
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

/** Bereitlegen-Liste ohne „bestehende Verträge und Policen“, wenn der Lead schon welche geschickt hat. */
export function ohneBisherigePolicen(liste: string[], geschickt: boolean): string[] {
  if (!geschickt) return liste;
  return liste
    .filter((x) => !/bisherigen? Polic(e|en), falls vorhanden|bestehenden Verträge und Policen/i.test(x))
    .map((x) => x.replace(/die bisherige Gebäudepolice, /i, ""));
}

// ─── Ausgelesene Vertragsdaten (nur Sachversicherungen) ─────────────────────

export const ZAHLWEISEN = ["monatlich", "vierteljährlich", "halbjährlich", "jährlich"] as const;
export type Zahlweise = (typeof ZAHLWEISEN)[number];

export type Auszug = {
  gesellschaft: string | null;
  sparte: Sparte | null;
  beitrag: number | null;
  zahlweise: Zahlweise | null;
  versicherungssumme: string | null;
  selbstbeteiligung: string | null;
  ablauf: string | null;
  hauptfaelligkeit: string | null;
};

const s = (v: unknown, max = 80) => (typeof v === "string" && v.trim() ? v.replace(/\s+/g, " ").trim().slice(0, max) : null);

/** KI-Ausgabe defensiv bereinigen. Gesundheitssparten werden nie übernommen (null). */
export function cleanAuszug(raw: unknown): Auszug | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const sparte = isSparte(r.sparte) ? r.sparte : sparteAusText(s(r.sparte));
  if (sparte && SPARTEN[sparte].gesundheit) return null;
  const beitragRaw = typeof r.beitrag === "number" ? r.beitrag : typeof r.beitrag === "string" ? Number(r.beitrag.replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, "")) : NaN;
  const zw = s(r.zahlweise)?.toLowerCase().replace("ae", "ä") ?? null;
  const out: Auszug = {
    gesellschaft: s(r.gesellschaft),
    sparte,
    beitrag: Number.isFinite(beitragRaw) && beitragRaw > 0 && beitragRaw < 100_000 ? Math.round(beitragRaw * 100) / 100 : null,
    zahlweise: ZAHLWEISEN.find((z) => z === zw) ?? null,
    versicherungssumme: s(r.versicherungssumme),
    selbstbeteiligung: s(r.selbstbeteiligung),
    ablauf: s(r.ablauf, 40),
    hauptfaelligkeit: s(r.hauptfaelligkeit, 40),
  };
  const leer = Object.values(out).every((v) => v == null);
  return leer ? null : out;
}

const euro = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);

/** Eine Zeile für die Vermittler-Ansicht: „HUK-Coburg · 89,00 € jährlich · SB 150 € · Ablauf 01.03.2027“. */
export function auszugZeile(x: Auszug | null): string | null {
  if (!x) return null;
  const teile = [
    x.gesellschaft,
    x.beitrag != null ? `${euro(x.beitrag)}${x.zahlweise ? ` ${x.zahlweise}` : ""}` : null,
    x.versicherungssumme ? `Summe ${x.versicherungssumme}` : null,
    x.selbstbeteiligung ? `SB ${x.selbstbeteiligung}` : null,
    x.ablauf ? `Ablauf ${x.ablauf}` : x.hauptfaelligkeit ? `Fällig ${x.hauptfaelligkeit}` : null,
  ].filter(Boolean);
  return teile.length ? teile.join(" · ") : null;
}

/**
 * Bestehende Verträge aus den Unterlagen, als eigene Liste. Später mit der Vertragsliste aus dem Chat (Komplettcheck)
 * zusammenführbar: gleiche Sparte und Gesellschaft = derselbe Vertrag (quelle bleibt erhalten).
 */
export type VertragAusUnterlage = Auszug & { quelle: "unterlage"; unterlageId: string };
export function vertraegeAusUnterlagen(docs: { id: string; extracted: unknown; gesundheitsbezug: boolean }[]): VertragAusUnterlage[] {
  return docs.flatMap((d) => {
    if (d.gesundheitsbezug) return [];
    const x = cleanAuszug(d.extracted);
    return x ? [{ ...x, quelle: "unterlage" as const, unterlageId: d.id }] : [];
  });
}

// ─── Löschfrist ─────────────────────────────────────────────────────────────

const TAG_MS = 24 * 60 * 60 * 1000;

/**
 * Wann wird die Unterlage gelöscht? Ohne Abschluss 30 Tage nach dem letzten Termin (ohne Termin: nach dem Eingang).
 * Mit Abschluss 90 Tage nach dem Abschluss (frühestens nach dem Eingang), vorher Erinnerung an den Vermittler
 * (abschlussSchritt). null: „Beratungsdokumentation behalten“, dann löscht nur der Vermittler (bzw. Widerruf, Art. 17,
 * Vertragsende).
 */
export function loeschDatum(o: { termine: Date[]; eingang: Date; abschluss: boolean; abschlussAm?: Date | null; behalten?: boolean }): Date | null {
  if (o.behalten) return null;
  if (o.abschluss) return new Date(Math.max(o.eingang.getTime(), o.abschlussAm?.getTime() ?? 0) + LOESCHFRIST_ABSCHLUSS_TAGE * TAG_MS);
  const ref = o.termine.length ? new Date(Math.max(...o.termine.map((d) => d.getTime()))) : o.eingang;
  return new Date(ref.getTime() + LOESCHFRIST_TAGE * TAG_MS);
}

/**
 * Nach Abschluss: erst erinnern (14 Tage vorher), dann löschen. Wird die Erinnerung spät verschickt, verschiebt sich die
 * Löschung, damit dem Vermittler immer 14 Tage bleiben.
 */
export function abschlussSchritt(o: { datum: Date; erinnertAt: Date | null; now: Date }): { aktion: "loeschen" | "erinnern" | "warten"; deleteAfter: Date } {
  const frist = ERINNERUNG_TAGE * TAG_MS;
  if (!o.erinnertAt) {
    if (o.now.getTime() < o.datum.getTime() - frist) return { aktion: "warten", deleteAfter: o.datum };
    return { aktion: "erinnern", deleteAfter: new Date(Math.max(o.datum.getTime(), o.now.getTime() + frist)) };
  }
  const deleteAfter = new Date(Math.max(o.datum.getTime(), o.erinnertAt.getTime() + frist));
  return { aktion: o.now.getTime() >= deleteAfter.getTime() ? "loeschen" : "warten", deleteAfter };
}

/** Abschluss laut Lead-Status (wie im Kontakt: „Abschluss“). */
export const istAbschluss = (status: string | null | undefined) => (status ?? "").trim().toLowerCase() === "abschluss";
