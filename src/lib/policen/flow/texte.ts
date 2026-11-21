// Policen-Strecke v2 (Ole, 18.11.2026 freigegeben, docs/ux/policen-flow/texte-v2.md auf claude/loving-mendel-j965x3):
// alle Texte an den Lead, rein und ohne Datenbank, in Sie und Du (a(an, du, sie)), ohne Gedankenstriche.
//   1. Chat-Nachricht „Kleiner Tipp für {Tag}“ mit Flow-Knopf [Policen senden] und Quick Reply [Später]
//      (Kfz-Lead: Fahrzeugschein, letzte Rechnung, genannte andere Verträge, Knopf [Unterlagen senden], Ole 22.11.2026)
//   2. Formular (WhatsApp Flow) „Policen senden“ (für alle Leads gleich, auch Kfz): Kurzliste 1 bis 4, Häkchen „Lieber ohne KI: nur speichern“ (leer),
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
import { anderePolicenSatz } from "@/lib/policen/andere-policen";

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
  /** Kfz-Lead (Ole, 21.11.2026): die freie Chat-Nachricht nennt Fahrzeugschein und letzte Rechnung (Vorlage bleibt allgemein) */
  kfz?: boolean;
  /**
   * Genannte Verträge ohne das angefragte Produkt („Haftpflicht bei Allianz“, lib/policen/andere-policen.ts) und
   * Komplettcheck Ja: nur dann bittet die Kfz-Nachricht auch um die anderen Policen (Ole, 22.11.2026).
   */
  andereVertraege?: string[] | null;
  komplettcheck?: boolean | null;
};

// ─── Knöpfe und Payloads ────────────────────────────────────────────────────

export const PAYLOAD_SPAETER = "policen:spaeter";
export const PAYLOAD_NEIN_DANKE = "policen:nein_danke";
/** Flow-Knopf in Chat-Nachricht und Erinnerungen (Vorlage höchstens 25, flow_cta höchstens 30 Zeichen, ohne Emoji). */
export const KNOPF_POLICEN_SENDEN = "Policen senden";
/**
 * Flow-Knopf der Kfz-Nachricht (Ole, 22.11.2026: es geht um Fahrzeugschein, Rechnung und Policen, nicht nur Policen).
 * Nur in der freien Nachricht (flow_cta beim Senden), keine Vorlage.
 */
export const KNOPF_UNTERLAGEN_SENDEN = "Unterlagen senden";
/** Knopf der Chat-Nachricht je Lead. */
export const flowKnopf = (k: Pick<FlowTextKontext, "kfz">) => (k.kfz ? KNOPF_UNTERLAGEN_SENDEN : KNOPF_POLICEN_SENDEN);
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

/** „Ihr Termin findet auch ohne Policen statt.“ (letzter Absatz der Chat-Nachricht, Zeile im Formular). */
export const ohnePolicenSatz = (an: Ansprache) => a(an, "Dein Termin findet auch ohne Policen statt.", "Ihr Termin findet auch ohne Policen statt.");
/** Kfz (Ole, 22.11.2026): „… ohne Unterlagen statt.“ (Fahrzeugschein und Rechnung sind keine Policen). */
export const ohneUnterlagenSatz = (an: Ansprache) => a(an, "Dein Termin findet auch ohne Unterlagen statt.", "Ihr Termin findet auch ohne Unterlagen statt.");

/**
 * Text der Chat-Nachricht. Ohne Pronomen ein Satz ohne er/sie; ohne Termin „vor Ihrem Termin“.
 * Paket 4 (19.11.2026, docs/ux/2026-11-19-policen-champions.md): konkreter Nutzen statt Ersparnisversprechen (§ 5 UWG,
 * K8). „ob … doppelt“ statt „wo … doppelt“ (keine Unterstellung), „was genau versichert ist“ statt „was fehlt“ (keine
 * Lückenaussage). Verboten in allen Lead-Texten: sparen, günstiger, zu teuer, Garantie, deutlich schneller (Test).
 */
export function chatNachricht(k: FlowTextKontext): Nachricht {
  const tag = k.tag ? `Kleiner Tipp für ${k.tag} 💡` : a(k.an, "Kleiner Tipp für deinen Termin 💡", "Kleiner Tipp für Ihren Termin 💡");
  const pruefung = k.pronomen ? `sieht ${k.pronomen} schon vor dem Termin` : "ist schon vor dem Termin klar";
  // Ole 20.11.2026: sagen, dass versucht wird, Geld zu sparen (Bemühen, kein Ergebnisversprechen nach § 5 UWG)
  const spart = `Dabei versucht ${k.pronomen ?? k.name},`;
  const kern = a(
    k.an,
    `Wenn ${k.name} deine Policen vorab hat, ${pruefung}, *ob du etwas doppelt zahlst, wann du kündigen kannst und was genau versichert ist.* ${spart} dir Geld zu sparen. So wird der Termin kürzer und konkreter.`,
    `Wenn ${k.name} Ihre Policen vorab hat, ${pruefung}, *ob Sie etwas doppelt zahlen, wann Sie kündigen können und was genau versichert ist.* ${spart} Ihnen Geld zu sparen. So wird der Termin kürzer und konkreter.`,
  );
  if (k.kfz) {
    const wer = k.pronomen ?? k.name;
    const kfzKern = a(
      k.an,
      `Wenn ${k.name} deinen Fahrzeugschein und die letzte Rechnung deiner Kfz-Versicherung vorab hat, kann ${wer} *deinen Beitrag schon vor dem Termin rechnen.* Darauf steht alles Nötige, zum Beispiel deine SF-Klasse.`,
      `Wenn ${k.name} Ihren Fahrzeugschein und die letzte Rechnung Ihrer Kfz-Versicherung vorab hat, kann ${wer} *Ihren Beitrag schon vor dem Termin rechnen.* Darauf steht alles Nötige, zum Beispiel Ihre SF-Klasse.`,
    );
    // Andere Policen als eigener Absatz mit Grund und den genannten Verträgen (Ole, 22.11.2026), nur bei Komplettcheck Ja
    // bzw. genannten Verträgen
    const andere = anderePolicenSatz(k.an, wer, { vertraege: k.andereVertraege, komplettcheck: k.komplettcheck, verb: "hochladen" });
    const teile = [tag, kfzKern, "*Je ein Foto reicht* (beim Fahrzeugschein die Vorderseite). Dauert etwa eine Minute.", andere, ohneUnterlagenSatz(k.an)];
    return { text: teile.filter(Boolean).join("\n\n"), fusszeile: null };
  }
  // „Termin findet auch ohne Policen statt“ als eigener letzter Absatz statt Fußzeile (Ole, 20.11.2026: zwischen Text und
  // Fußzeile kaum Platz; den Abstand setzt WhatsApp, Leerzeilen am Ende werden abgeschnitten)
  return { text: `${tag}\n\n${kern}\n\n*Meist reicht ein Foto der ersten Seite.* Dauert etwa eine Minute.\n\n${ohnePolicenSatz(k.an)}`, fusszeile: null };
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
  // Bleibt „Policen senden“ (Ole, 22.11.2026): sonst neues Flow JSON, neue Einwilligungsfassung und neue Vorlagen
  titel: "Policen senden",
  intro: "Meist reicht ein Foto der ersten Seite. Gern mehrere Verträge auf einmal.",
  fotos: "Fotos aufnehmen oder wählen",
  pdfs: "PDFs auswählen",
  /** Wechsel zu den PDFs (Meta: Foto- und Dateiauswahl nicht auf demselben Bildschirm); zurück per Zurück-Pfeil */
  zuPdfs: "Lieber PDFs senden",
  ohneKi: "Lieber ohne KI: nur speichern",
  datenschutz: "Datenschutzhinweise",
} as const;

export function formularDaten(k: FlowTextKontext, datenschutzUrl: string): FormularDaten {
  const { an } = k;
  const zweck = k.kiFertig
    ? a(an, "damit dein Vergleich zum Termin schon fertig ist", "damit Ihr Vergleich zum Termin schon fertig ist")
    : `damit ${k.pronomen ?? k.name} sich vorbereiten kann`;
  const gesundheit = k.gesundheit ? ", auch wenn die Policen Gesundheitsangaben enthalten" : "";
  // Formular für alle Leads gleich, auch Kfz (Ole, 22.11.2026: keine neue Einwilligungsfassung)
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
  // Ohne KI steht die Bestätigung der Wahl direkt nach dem Dank (Paket 4), danach wie mit KI.
  const teile = [
    `✅ Danke, ${angekommen}`,
    ...(ki ? [] : [OHNE_KI_SATZ]),
    a(an, `${k.name} sieht sie sich ${wann} an und versucht, dir Geld zu sparen. Bis dahin musst du nichts weiter tun.`, `${k.name} sieht sie sich ${wann} an und versucht, Ihnen Geld zu sparen. Bis dahin müssen Sie nichts weiter tun.`),
    k.kfz ? NOCH_EINE_POLICE_KFZ : NOCH_EINE_POLICE,
  ];
  return { text: teile.join("\n\n"), fusszeile: WIDERRUF_FUSSZEILE };
}
/** Letzte Zeile der Bestätigung (beide Ansprachen gleich): lädt zu weiteren Verträgen ein, Knopf „Weitere senden“. */
export const NOCH_EINE_POLICE = "Noch eine Police, etwa Kfz oder Hausrat? Einfach nachsenden.";
/** Kfz-Lead: nie Kfz als „noch eine“ Police (Ole, 22.11.2026). */
export const NOCH_EINE_POLICE_KFZ = "Noch eine Police, etwa Haftpflicht oder Hausrat? Einfach nachsenden.";
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

/**
 * Erinnerung 1 (24 Std. nach der Bitte, nur wenn der Termin dann mindestens 2 Tage entfernt ist). Eine Frage statt einer
 * Erinnerung (lädt zur Antwort ein), dann der Aufwand, dann der Nutzen. Ohne Pronomen (auch in der Vorlage).
 */
export function erinnerung1(k: FlowTextKontext): Nachricht {
  const tag = k.tag ?? "";
  const text = a(
    k.an,
    `Kurze Frage zu deinem Termin am ${tag}: Hast du deine Policen gerade zur Hand? Meist reicht ein Foto der ersten Seite. Dann sieht ${k.name} vorab, wann du kündigen kannst und ob du etwas doppelt zahlst.`,
    `Kurze Frage zu Ihrem Termin am ${tag}: Haben Sie Ihre Policen gerade zur Hand? Meist reicht ein Foto der ersten Seite. Dann sieht ${k.name} vorab, wann Sie kündigen können und ob Sie etwas doppelt zahlen.`,
  );
  return { text, fusszeile: erinnerungFusszeile(k.an) };
}

/** Text der Erinnerung 2 (auch die Vorlage mit {{1}} … {{3}}). */
function erinnerung2Text(an: Ansprache, uhrzeit: string, art: string, name: string): string {
  return a(
    an,
    `Morgen um ${uhrzeit} ist dein ${art}. Noch schnell ein Foto deiner Policen? Dann kann sich ${name} gezielt vorbereiten. Sonst einfach im Termin zeigen.`,
    `Morgen um ${uhrzeit} ist Ihr ${art}. Noch schnell ein Foto Ihrer Policen? Dann kann sich ${name} gezielt vorbereiten. Sonst einfach im Termin zeigen.`,
  );
}

/** Erinnerung 2 (Vortag 18 Uhr Berlin). Nennt den Namen, kein er/sie. */
export function erinnerung2(k: FlowTextKontext): Nachricht {
  return { text: erinnerung2Text(k.an, k.uhrzeit ?? "", k.video === false ? "Termin" : "Videotermin", k.name), fusszeile: erinnerungFusszeile(k.an) };
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
    // Vorlage bei Meta unverändert: Satz „… auch ohne Policen statt“ weiter als Fußzeile (nur die freie Nachricht hat ihn im Text)
    const ohne = ohnePolicenSatz(an);
    return { text: t.text.replace(`\n\n${ohne}`, ""), fusszeile: ohne, knopf2: KNOPF_SPAETER, beispiele: ["Donnerstag", an === "du" ? "Ole" : "Herr Kannapinn", "er"] };
  }
  if (art === "erinnerung1") {
    const t = erinnerung1({ an, name: "{{2}}", pronomen: null, tag: "{{1}}", kiFertig: false, gesundheit: false });
    return { ...t, knopf2: KNOPF_NEIN_DANKE, beispiele: ["Donnerstag", an === "du" ? "Ole" : "Herr Kannapinn"] };
  }
  const t = erinnerung2Text(an, "{{1}}", "{{2}}", "{{3}}");
  return { text: t, fusszeile: erinnerungFusszeile(an), knopf2: KNOPF_NEIN_DANKE, beispiele: ["10 Uhr", "Videotermin", an === "du" ? "Ole" : "Herr Kannapinn"] };
}

/** Werte für {{1}} … einer Vorlage (passend zu vorlagenText). */
export function vorlagenParameter(art: VorlagenArt, k: FlowTextKontext): string[] {
  const wer = k.pronomen ?? k.name;
  if (art === "bitte") return [k.tag ?? a(k.an, "deinen Termin", "Ihren Termin"), k.name, wer];
  if (art === "erinnerung1") return [k.tag ?? "", k.name];
  return [k.uhrzeit ?? "", k.video === false ? "Termin" : "Videotermin", k.name];
}
