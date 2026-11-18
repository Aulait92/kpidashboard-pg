// Policen-Strecke v2 (Ole, 18.11.2026 freigegeben, docs/ux/policen-flow/texte-v2.md auf claude/loving-mendel-j965x3):
// alle Texte an den Lead, rein und ohne Datenbank, in Sie und Du (a(an, du, sie)), ohne Gedankenstriche.
//   1. Chat-Nachricht „Kleiner Tipp für {Tag}“ mit Flow-Knopf [Policen senden] und Quick Reply [Später]
//   2. Formular (WhatsApp Flow) „Policen senden“: Kurzliste 1 bis 4, Häkchen „Lieber ohne KI: nur speichern“ (leer),
//      Link Datenschutzhinweise, Hinweis, Knopf „Zustimmen & senden“ (Flow JSON: flow-json.ts)
//   3. Bestätigung mit Anzahl Dateien und Knopf [Weitere senden], Fußzeile Widerruf; bei ki = false ein Zusatzsatz
//   4. „Später“, zwei Erinnerungen (je [Policen senden] [Nein, danke]) und die Antwort auf „Nein, danke“
// Regeln aus texte-v2.md: „Später“ ist weder Einwilligung noch Ablehnung; KI-Satz „damit Ihr Vergleich zum Termin schon
// fertig ist“ nur, wenn das Auslesen für die Sparte des Leads aktiv ist (kiFertig, sonst neutral „damit er sich
// vorbereiten kann“); keine Aussage zur automatischen Löschung; „ohne KI“ nie schlechtreden.
//
// Grenzen (Meta, siehe flow-json.ts und tests/unit/policen-flow.test.ts): Text einer interaktiven Nachricht bzw.
// Vorlage höchstens 1.024 Zeichen, Fußzeile 60, Antwort-Knopf 20, Vorlagen-Knopf 25, Flow-Knopf (flow_cta) laut Doku
// „30 Zeichen oder weniger, ohne Emoji“. Darum stehen die Knöpfe ohne 📎 im Code: WhatsApp zeigt an Flow-Knöpfen ein
// eigenes Symbol (ungeprüft, im ersten Live-Test ansehen).

import { createHash } from "node:crypto";
import { a, type Ansprache } from "@/lib/ansprache";

export type Pronomen = "er" | "sie";

/** Was die Texte brauchen. name = Vermittler wie überall gegenüber Leads (Sie „Herr Kannapinn“, Du „Ole“). */
export type FlowTextKontext = {
  an: Ansprache;
  name: string;
  pronomen: Pronomen | null;
  firma?: string | null;
  /** Termin als Tag („Donnerstag“ bzw. „Donnerstag, 26.11.“), null = kein Termin bekannt */
  tag?: string | null;
  /** Uhrzeit des Termins („10 Uhr“) */
  uhrzeit?: string | null;
  /** Videotermin (sonst „Termin“) */
  video?: boolean;
  /** Auslesen für die Sparte des Leads aktiv und die Terminvorbereitung zeigt den Vergleich vor dem Termin */
  kiFertig: boolean;
  /** Satz zu Gesundheitsangaben (aus bei Tierkranken und wenn Kranken/BU/Leben für den Vermittler nicht freigegeben ist) */
  gesundheit: boolean;
};

// ─── Knöpfe und Payloads ────────────────────────────────────────────────────

export const PAYLOAD_SPAETER = "policen:spaeter";
export const PAYLOAD_NEIN_DANKE = "policen:nein_danke";
/** Flow-Knopf in Chat-Nachricht und Erinnerungen (Vorlage höchstens 25, flow_cta höchstens 30 Zeichen, ohne Emoji). */
export const KNOPF_POLICEN_SENDEN = "Policen senden";
/** Flow-Knopf der Bestätigung (öffnet das Formular erneut). */
export const KNOPF_WEITERE_SENDEN = "Weitere senden";
export const KNOPF_SPAETER = "Später";
export const KNOPF_NEIN_DANKE = "Nein, danke";
/** Fußzeilen-Knopf im Formular (Footer label, höchstens 35 Zeichen). */
export const KNOPF_ZUSTIMMEN = "Zustimmen & senden";
export const NEIN_DANKE_KNOEPFE = [{ id: PAYLOAD_NEIN_DANKE, title: KNOPF_NEIN_DANKE }];

// ─── Hilfen ─────────────────────────────────────────────────────────────────

const TZ = "Europe/Berlin";
const DAY = 24 * 60 * 60 * 1000;

/** {Tag}: Wochentag („Donnerstag“), ab 6 Tagen Abstand mit Datum („Donnerstag, 26.11.“). */
export function tagText(d: Date, now = new Date()): string {
  const wochentag = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, weekday: "long" }).format(d);
  if (d.getTime() - now.getTime() < 6 * DAY) return wochentag;
  const datum = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, day: "2-digit", month: "2-digit" }).format(d);
  return `${wochentag}, ${datum}`;
}

/** {Uhrzeit}: „10 Uhr“ bzw. „10:30 Uhr“. */
export function uhrzeitText(d: Date): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat("de-DE", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map((x) => [x.type, x.value]));
  return p.minute === "00" ? `${Number(p.hour)} Uhr` : `${Number(p.hour)}:${p.minute} Uhr`;
}

/** er/sie aus der Anrede bzw. dem Namen („Herr …“), null = unbekannt. */
export function pronomenAus(anrede: string | null | undefined, name: string): Pronomen | null {
  if (anrede === "Herr") return "er";
  if (anrede === "Frau") return "sie";
  if (/^Herr\b/.test(name) || /^(Ihr|dein) Berater$/.test(name)) return "er";
  if (/^Frau\b/.test(name)) return "sie";
  return null;
}

/** „Herr Kannapinn (Ole Kannapinn UG)“; die Firma nur, wenn sie etwas anderes sagt als der Name. */
function mitFirma(name: string, firma: string | null | undefined): string {
  const f = (firma ?? "").replace(/\s+/g, " ").trim();
  return f && !name.toLowerCase().includes(f.toLowerCase()) ? `${name} (${f})` : name;
}

export type Nachricht = { text: string; fusszeile: string | null };

// ─── 1. Chat-Nachricht ──────────────────────────────────────────────────────

/** „Ihr Termin findet auch ohne Policen statt.“ (Fußzeile der Chat-Nachricht, Zeile im Formular). */
export const ohnePolicenSatz = (an: Ansprache) => a(an, "Dein Termin findet auch ohne Policen statt.", "Ihr Termin findet auch ohne Policen statt.");

/** Text der Chat-Nachricht. Ohne Pronomen ein Satz ohne er/sie; ohne Termin „vor Ihrem Termin“. */
export function chatNachricht(k: FlowTextKontext): Nachricht {
  const tag = k.tag ? `Kleiner Tipp für ${k.tag} 💡` : a(k.an, "Kleiner Tipp für deinen Termin 💡", "Kleiner Tipp für Ihren Termin 💡");
  const pruefung = k.pronomen ? `prüft ${k.pronomen} schon vor dem Termin` : "ist schon vor dem Termin klar";
  const kern = a(
    k.an,
    `Wenn ${k.name} deine Policen vorab sieht, ${pruefung}, *ob du Geld sparen kannst*: doppelte Verträge, zu teure Tarife, fehlender Schutz. So wird der Termin kürzer und konkreter.`,
    `Wenn ${k.name} Ihre Policen vorab sieht, ${pruefung}, *ob Sie Geld sparen können*: doppelte Verträge, zu teure Tarife, fehlender Schutz. So wird der Termin kürzer und konkreter.`,
  );
  return { text: `${tag}\n\n${kern}\n\n*Meist reicht ein Foto der ersten Seite.* Dauert etwa eine Minute.`, fusszeile: ohnePolicenSatz(k.an) };
}

// ─── 2. Formular (Daten für den Bildschirm, Wortlaut für den Nachweis) ───────

/** Dynamische Texte des Formulars (Flow JSON: ${data.<key>}). */
export type FormularDaten = {
  ueberschrift: string;
  punkt1: string;
  punkt2: string;
  punkt3: string;
  punkt4: string;
  hinweis: string;
  datenschutz_url: string;
};

/** Feste Texte des Formulars (stehen im Flow JSON). */
export const FORMULAR = {
  titel: "Policen senden",
  intro: "Meist reicht ein Foto der ersten Seite. Gern mehrere Verträge auf einmal.",
  fotos: "Fotos aufnehmen oder wählen",
  pdfs: "PDFs auswählen",
  /** Wechsel zwischen Fotos und PDFs (Meta: Foto- und Dateiauswahl nicht auf demselben Bildschirm) */
  zuPdfs: "Lieber PDFs senden",
  zuFotos: "Lieber Fotos senden",
  ohneKi: "Lieber ohne KI: nur speichern",
  datenschutz: "Datenschutzhinweise",
} as const;

export function formularDaten(k: FlowTextKontext, datenschutzUrl: string): FormularDaten {
  const { an } = k;
  const zweck = k.kiFertig
    ? a(an, "damit dein Vergleich zum Termin schon fertig ist", "damit Ihr Vergleich zum Termin schon fertig ist")
    : `damit ${k.pronomen ?? k.name} sich vorbereiten kann`;
  const gesundheit = k.gesundheit ? ", auch wenn die Policen Gesundheitsangaben enthalten" : "";
  return {
    ueberschrift: a(an, "Das passiert mit deinen Policen", "Das passiert mit Ihren Policen"),
    punkt1: `1. **${a(an, "Nur für deinen Termin:", "Nur für Ihren Termin:")}** ${mitFirma(k.name, k.firma)} speichert sie zur Vorbereitung.`,
    punkt2: `2. **Per KI ausgelesen, ${zweck}:** Die Vertragsdaten liest ein KI-Dienst in der EU aus${gesundheit}.`,
    punkt3: "3. **Beteiligt:** WhatsApp (Meta, Zugriff auch aus den USA) und der Dienstleister performancegrowth.",
    punkt4: `4. **Jederzeit widerrufbar:** ${a(an, "Schreib „Widerruf“, dann wird alles gelöscht.", "Schreiben Sie „Widerruf“, dann wird alles gelöscht.")}`,
    hinweis: `${a(an, "Mit „Zustimmen & senden“ bist du mit den Punkten oben einverstanden.", "Mit „Zustimmen & senden“ sind Sie mit den Punkten oben einverstanden.")} ${ohnePolicenSatz(an)}`,
    datenschutz_url: datenschutzUrl,
  };
}

const ohneMarkdown = (t: string) => t.replace(/\*\*/g, "");

/** Wortlaut des Formulars in der Reihenfolge auf dem Bildschirm (für den Nachweis, A3). */
export function formularWortlaut(d: FormularDaten): string {
  return [
    FORMULAR.titel,
    FORMULAR.intro,
    `${FORMULAR.fotos} / ${FORMULAR.pdfs}`,
    d.ueberschrift,
    ohneMarkdown(d.punkt1),
    ohneMarkdown(d.punkt2),
    `[ ] ${FORMULAR.ohneKi}`,
    ohneMarkdown(d.punkt3),
    ohneMarkdown(d.punkt4),
    `${FORMULAR.datenschutz}: ${d.datenschutz_url}`,
    d.hinweis,
    `[${KNOPF_ZUSTIMMEN}]`,
  ].join("\n");
}

/** SHA-256 (hex) eines Wortlauts. */
export const textHash = (wortlaut: string) => createHash("sha256").update(wortlaut, "utf8").digest("hex");

/**
 * Textversionen der Einwilligung im Formular (Format wie lib/policen/bitte.ts, damit lib/policen/auslesen/konfig.ts
 * textVersionKi sie erkennt): mit Gesundheitsangaben „.g1“, ohne (Tierkranken bzw. Kranken/BU/Leben nicht freigegeben)
 * „.s1“. Bei jeder inhaltlichen Änderung hochzählen; der genaue Wortlaut steht zusätzlich als Hash im Nachweis.
 */
export const FLOW_TEXT_VERSION = "2026-11-19.g1";
export const FLOW_TEXT_VERSION_SACH = "2026-11-19.s1";
export const flowTextVersion = (gesundheit: boolean) => (gesundheit ? FLOW_TEXT_VERSION : FLOW_TEXT_VERSION_SACH);

// ─── 3. Bestätigung ─────────────────────────────────────────────────────────

/** Fußzeile der Bestätigung (beide Ansprachen gleich). */
export const WIDERRUF_FUSSZEILE = "Widerruf jederzeit: einfach „Widerruf“ schreiben.";

export function bestaetigung(k: FlowTextKontext, n: number, ki: boolean): Nachricht {
  const { an } = k;
  const angekommen = n === 1 ? "*1 Datei ist angekommen.*" : `*${n} Dateien sind angekommen.*`;
  const wann = k.tag ? `vor ${k.tag}` : a(an, "vor deinem Termin", "vor Ihrem Termin");
  const teile = [
    `✅ Danke, ${angekommen}`,
    a(
      an,
      `${k.name} sieht sie sich ${wann} an und prüft, wo du sparen kannst. Bis dahin musst du nichts weiter tun.`,
      `${k.name} sieht sie sich ${wann} an und prüft, wo Sie sparen können. Bis dahin müssen Sie nichts weiter tun.`,
    ),
    ...(ki ? [] : [OHNE_KI_SATZ]),
    "Noch eine Police vergessen? Einfach nachsenden.",
  ];
  return { text: teile.join("\n\n"), fusszeile: WIDERRUF_FUSSZEILE };
}
/** Zusatzsatz bei „Lieber ohne KI: nur speichern“. */
export const OHNE_KI_SATZ = "Alles klar, wir lesen nichts automatisch aus.";
export const BESTAETIGUNG_RE = /^✅ Danke, \*\d+ Dateie?n? (ist|sind) angekommen\.\*/;

// ─── 4. „Später“, Erinnerungen, „Nein, danke“ ───────────────────────────────

/**
 * Antwort auf „Später“. erinnern = protokolliertes Opt-in aus der Buchung (A8); ohne Opt-in gibt es keine Erinnerung,
 * dann fehlt der Satz dazu (und der Knopf „Nein, danke“, siehe server.ts).
 */
export function spaeterAntwort(an: Ansprache, erinnern: boolean): string {
  const satz = a(an, "Alles klar, kein Problem. Dein Termin findet so oder so statt.", "Alles klar, kein Problem. Ihr Termin findet so oder so statt.");
  return erinnern ? `${satz} ${a(an, "Ich erinnere dich höchstens zweimal daran.", "Ich erinnere Sie höchstens zweimal daran.")}` : satz;
}

/** Fußzeile beider Erinnerungen (A8: Abmeldehinweis). */
export const erinnerungFusszeile = (an: Ansprache) => a(an, "Kein Interesse? Tipp „Nein, danke“ oder STOP.", "Kein Interesse? Tippen Sie „Nein, danke“ oder STOP.");

/** Erinnerung 1 (24 Std. nach der Bitte, nur wenn der Termin dann mindestens 2 Tage entfernt ist). */
export function erinnerung1(k: FlowTextKontext): Nachricht {
  const tag = k.tag ?? "";
  const text = a(
    k.an,
    `Kurze Erinnerung an deinen Termin am ${tag}: Mit deinen Policen kann ${k.name} vorab prüfen, ob du Geld sparen kannst. Meist reicht ein Foto der ersten Seite.`,
    `Kurze Erinnerung an Ihren Termin am ${tag}: Mit Ihren Policen kann ${k.name} vorab prüfen, ob Sie Geld sparen können. Meist reicht ein Foto der ersten Seite.`,
  );
  return { text, fusszeile: erinnerungFusszeile(k.an) };
}

/** Erinnerung 2 (Vortag 18 Uhr Berlin). Ohne Pronomen: Name statt er/sie. */
export function erinnerung2(k: FlowTextKontext): Nachricht {
  const art = k.video === false ? "Termin" : "Videotermin";
  const wer = k.pronomen ?? k.name;
  const text = a(
    k.an,
    `Morgen um ${k.uhrzeit ?? ""} ist dein ${art}. Wenn ${k.name} deine Policen vorher sieht, kann ${wer} gezielter vorbereiten. Wenn nicht, auch gut: Du kannst sie auch im Termin zeigen.`,
    `Morgen um ${k.uhrzeit ?? ""} ist Ihr ${art}. Wenn ${k.name} Ihre Policen vorher sieht, kann ${wer} gezielter vorbereiten. Wenn nicht, auch gut: Sie können sie auch im Termin zeigen.`,
  );
  return { text, fusszeile: erinnerungFusszeile(k.an) };
}

/** Antwort auf „Nein, danke“ (Knopf oder getippt). */
export function neinDankeAntwort(k: Pick<FlowTextKontext, "tag" | "uhrzeit">): string {
  return k.tag && k.uhrzeit ? `Alles klar, keine Erinnerungen mehr. Bis ${k.tag} um ${k.uhrzeit}!` : "Alles klar, keine Erinnerungen mehr.";
}

/** Getipptes „Nein, danke“ (bzw. „nein“, „kein Interesse“) auf eine Erinnerung oder die Antwort auf „Später“. */
export function istNeinDanke(text: string | null | undefined): boolean {
  const t = (text ?? "")
    .toLowerCase()
    .replace(/[„“"'.!,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return /^(nein|nein danke|danke nein|kein interesse|keine erinnerungen?( mehr)?|nicht mehr erinnern)$/.test(t);
}

// ─── Vorlagen (außerhalb des 24-Stunden-Fensters) ───────────────────────────

/**
 * Vorlagentexte mit Platzhaltern (Meta: {{1}} …), je Ansprache. Kategorie UTILITY (Begründung in server.ts
 * VORLAGEN_KATEGORIE). Reihenfolge der Parameter siehe vorlagenParameter.
 */
export type VorlagenArt = "bitte" | "erinnerung1" | "erinnerung2";

export function vorlagenText(art: VorlagenArt, an: Ansprache): Nachricht & { knopf2: string; beispiele: string[] } {
  if (art === "bitte") {
    const t = chatNachricht({ an, name: "{{2}}", pronomen: "{{3}}" as Pronomen, tag: "{{1}}", kiFertig: false, gesundheit: false });
    return { ...t, knopf2: KNOPF_SPAETER, beispiele: ["Donnerstag", an === "du" ? "Ole" : "Herr Kannapinn", "er"] };
  }
  if (art === "erinnerung1") {
    const t = erinnerung1({ an, name: "{{2}}", pronomen: null, tag: "{{1}}", kiFertig: false, gesundheit: false });
    return { ...t, knopf2: KNOPF_NEIN_DANKE, beispiele: ["Donnerstag", an === "du" ? "Ole" : "Herr Kannapinn"] };
  }
  const t = a(
    an,
    "Morgen um {{1}} ist dein {{2}}. Wenn {{3}} deine Policen vorher sieht, kann {{4}} gezielter vorbereiten. Wenn nicht, auch gut: Du kannst sie auch im Termin zeigen.",
    "Morgen um {{1}} ist Ihr {{2}}. Wenn {{3}} Ihre Policen vorher sieht, kann {{4}} gezielter vorbereiten. Wenn nicht, auch gut: Sie können sie auch im Termin zeigen.",
  );
  return { text: t, fusszeile: erinnerungFusszeile(an), knopf2: KNOPF_NEIN_DANKE, beispiele: ["10 Uhr", "Videotermin", an === "du" ? "Ole" : "Herr Kannapinn", "er"] };
}

/** Werte für {{1}} … einer Vorlage (passend zu vorlagenText). */
export function vorlagenParameter(art: VorlagenArt, k: FlowTextKontext): string[] {
  const wer = k.pronomen ?? k.name;
  if (art === "bitte") return [k.tag ?? a(k.an, "deinen Termin", "Ihren Termin"), k.name, wer];
  if (art === "erinnerung1") return [k.tag ?? "", k.name];
  return [k.uhrzeit ?? "", k.video === false ? "Termin" : "Videotermin", k.name, wer];
}
