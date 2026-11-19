// „So arbeitet Ihr Assistent“ (Paket P8, Ole 17.11.2026; docs/plan-lead-verlauf.md Ergänzung E und Korrektur A):
//   1. Zeitleiste mit drei Spuren (Lead, Assistent, Sie) und den Momenten, in denen der Vermittler gebraucht wird:
//      Anruf, wenn 30 Min. nach dem Erstanschreiben keine Antwort kommt (bestehender Anrufplan, 6 Versuche über
//      mindestens 3 Tage, lib/call-plan.ts), Termin, „Ist Frau Becker da?“, Angebot senden, Abschluss.
//   2. Beispielverlauf in WhatsApp-Optik aus DENSELBEN Textfunktionen wie der Assistent (nicht abgeschrieben):
//      Erstanschreiben v8, Zwischenfrage, Terminvorschlag, kurze Buchungsbestätigung, Komplettcheck-Frage, erste
//      Angebotsfrage, Vertragsfrage, Policen-Bitte mit Einwilligung, Schluss mit E-Mail-Bestätigung
//      (Reihenfolge wie docs/beispielverlauf-p2.md, Pfad A), im gewählten Produkt, in der eingestellten Ansprache und
//      mit dem Namen des Vermittlers.
// Rein (ohne Datenbank, testbar). Genutzt im Onboarding (Einrichtung, Schritt „So arbeitet Ihr Assistent“) und unter
// Einstellungen → Assistent → Ablauf (Abschnitt „So arbeitet Ihr Assistent“).

import { a, type Ansprache } from "@/lib/ansprache";
import { CALL_ATTEMPTS_TARGET } from "@/lib/call-plan";

/** Anrufplan über mindestens so viele Tage (lib/call-plan.ts, Ole 14.11.2026). */
const ANRUF_TAGE = 3;
import { SEQUENCES } from "@/lib/lead-sequences";
import { leadLabel, startPush } from "@/lib/showup";
import { anrufPush } from "@/lib/anruf-ausloeser";
import { BEISPIEL_KONTAKT } from "@/lib/ablauf";
import { ERSTINFO_FOOTER_V9, ersteFrageKnoepfe, erstanschreibenText, frageplan, outreachProdukt, type FormAntwort } from "@/lib/whatsapp/erstanschreiben";
import { offeneZwischenfrage, zwischenfrageText, ZWISCHENFRAGEN, ZWISCHENFRAGE_AKTIV } from "@/lib/whatsapp/zwischenfrage";
import {
  abschlussEinleitung,
  abschlussText,
  bereitlegenListe,
  buchungsText,
  EMAIL_KNOEPFE,
  einladungUnterwegs,
  eingetragenFrage,
  EINGETRAGEN_KNOEPFE,
  istFamilie,
  KOMPLETTCHECK_KNOEPFE,
  komplettcheckFrage,
  knoepfeFuerText,
  terminKnoepfe,
  terminVorschlagText,
  VERTRAEGE_BEREITLEGEN_RE,
  vertragsFrage,
  zeitKurz,
  type VermittlerName,
} from "@/lib/whatsapp/gespraech";
import { folgefragen, folgefrageText, spartenDesLeads } from "@/lib/preise/rechner-angaben";
import { nachEinwilligungText, policenBitte, type BitteVermittler } from "@/lib/policen/bitte";
import type { Salutation } from "@/lib/ansprache";

// ─── Zeitleiste ─────────────────────────────────────────────────────────

export type Spur = "lead" | "assistent" | "sie";

export const SPUR_NAME: Record<Spur, string> = { lead: "Kunde", assistent: "Assistent", sie: "Sie" };

export type Moment = {
  key: string;
  spur: Spur;
  /** „Sofort“, „nach 30 Min.“, „zum Termin“ … */
  wann: string;
  titel: string;
  /** Ein Satz */
  text: string;
  /** Nummer des Moments, in dem Sie gebraucht werden (1 bis 5) */
  nr?: number;
};

/** Tage des Nachfassens zum Angebot als Text: „Tag 2, 3, 5 und 10“ (aus SEQUENCES.offer, Tage ab dem Versand). */
export function nachfassTage(): string {
  const tage = [...new Set(SEQUENCES.offer.steps.map((s) => Math.round(s.day)).filter((d) => d > 0))].sort((x, y) => x - y);
  if (!tage.length) return "";
  return tage.length === 1 ? `Tag ${tage[0]}` : `Tag ${tage.slice(0, -1).join(", ")} und ${tage.at(-1)}`;
}

/**
 * Die Momente vom Eingang der Anfrage bis zum Abschluss. Der Kunde heißt im Beispiel „Frau Becker“ (Du: Julia).
 * Sie-Momente sind nummeriert (1 bis 5).
 */
export function assistentMomente(an: Ansprache): Moment[] {
  const label = leadLabel(BEISPIEL_KONTAKT, "Frau Becker");
  const tage = nachfassTage();
  const momente: Omit<Moment, "nr">[] = [
    { key: "anfrage", spur: "lead", wann: "Start", titel: "Anfrage kommt rein", text: `${label} füllt Ihr Formular aus.` },
    { key: "erstkontakt", spur: "assistent", wann: "Sofort", titel: "Schreibt per WhatsApp", text: "Eine Frage zum Bedarf, dann zwei Terminzeiten aus Ihrem Kalender." },
    {
      key: "anruf",
      spur: "sie",
      wann: "nach 30 Min.",
      titel: "Anrufen, wenn keine Antwort kommt",
      text: `Push: „${anrufPush({ leadId: "beispiel", name: label }).title}“ Bis zu ${CALL_ATTEMPTS_TARGET} Versuche über mindestens ${ANRUF_TAGE} Tage, jeder als Aufgabe auf „Heute“.`,
    },
    { key: "buchung", spur: "lead", wann: "im Chat", titel: "Bucht einen Termin", text: "Mit einem Tipp auf eine der Zeiten." },
    {
      key: "vorbereitung",
      spur: "assistent",
      wann: "danach",
      titel: "Bestätigt und bereitet vor",
      text: "Komplettcheck, Angaben fürs Angebot, Bitte um Policen, Einladung mit Kalendereintrag und Erinnerungen.",
    },
    { key: "termin", spur: "sie", wann: "Termin", titel: "Termin führen", text: "Die Terminvorbereitung mit allen Angaben liegt bereit." },
    {
      key: "da",
      spur: "sie",
      wann: "zum Beginn",
      titel: `„${startPush({ appointmentId: "beispiel", name: label, startsAt: new Date() }).title}“`,
      text: a(an, "Ein Tipp genügt. Fehlt Julia, schreibt der Assistent ihr sofort.", "Ein Tipp genügt. Fehlt Frau Becker, schreibt der Assistent ihr sofort."),
    },
    { key: "angebot", spur: "sie", wann: "nach dem Termin", titel: "Angebot senden", text: "Mit einem Tipp aus der App. Erst dann startet das Nachfassen." },
    {
      key: "nachfassen",
      spur: "assistent",
      wann: tage || "danach",
      titel: "Fasst nach",
      text: "Am Vorabend bekommen Sie einen Push und können anhalten.",
    },
    { key: "abschluss", spur: "sie", wann: "bei Zusage", titel: "Abschluss eintragen", text: "Ein Tipp, auf Wunsch mit Glückwunsch per WhatsApp." },
  ];
  let nr = 0;
  return momente.map((m) => (m.spur === "sie" ? { ...m, nr: ++nr } : m));
}

// ─── Beispielverlauf ────────────────────────────────────────────────────

export type ChatZeile =
  | { art: "nachricht"; von: "assistent" | "lead"; text: string; knoepfe?: string[]; fusszeile?: string | null; anhang?: string; zeit: string }
  | { art: "hinweis"; text: string };

export type BeispielEingabe = {
  an: Ansprache;
  person: VermittlerName;
  /** Vermittler mit Anrede und Namen (Policen-Bitte: er/sie, Einwilligung: Vor- und Nachname) */
  vermittler: { name: string | null; anrede: Salutation | null };
  /** Gewähltes Produkt (Lead.source), z. B. „Privatschutz“ */
  produkt: string;
  /** Formularangaben wie bei einem echten Lead des Produkts (lib/testlead.ts testLeadAnswers) */
  formular: FormAntwort[];
  /** Agentur für den Einwilligungstext */
  firma?: string | null;
  /** Policen-Modul an (lib/policen/server.ts policenAn) */
  policen: boolean;
  /** Kranken/BU/Leben für diesen Vermittler freigegeben */
  gesundheitAn?: boolean;
  now: Date;
};

export const BEISPIEL_EMAIL = "julia.becker@example.com";
const BEISPIEL_LINK = "https://meet.google.com/abc-defg-hij";

/** Berlin-Uhrzeit hh Uhr am Tag `plusTage` ab now. */
function berlinZeit(now: Date, plusTage: number, stunde: number): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date(now.getTime() + plusTage * 86_400_000));
  const probe = new Date(`${ymd}T12:00:00Z`);
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", hourCycle: "h23" }).format(probe));
  return new Date(probe.getTime() + (stunde - h) * 3_600_000);
}

const uhr = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" }).format(d);

/** Antwort von Frau Becker auf die erste Frage (Knopf, sonst kurz und passend zur Frage). */
function ersteAntwort(produkt: string, formular: FormAntwort[], an: Ansprache): string {
  const knoepfe = ersteFrageKnoepfe(produkt, formular);
  if (knoepfe[0]) return knoepfe[0];
  const offen = frageplan(produkt, formular).offen[0];
  const p = outreachProdukt(produkt);
  if (!offen) return a(an, "Ja, gern.", "Ja, gern.");
  if (offen.key === "vorhanden") return p?.purpose === "outreach_privatschutz" ? "Beides wäre neu." : "Noch nicht.";
  if (p?.purpose === "outreach_tkv") return "Am liebsten beides.";
  return "Noch nicht.";
}

/** Antwort von Frau Becker auf die erste Angebotsfrage (erfunden, passend zur Frage). */
function beispielAngabe(key: string, frage: string): string {
  if (key === "geburt" || /geburtsdatum/i.test(frage)) return "14.05.1985";
  if (/wohnfl|quadratmeter|m²/i.test(frage)) return "Etwa 95 m²";
  if (/postleitzahl|plz/i.test(frage)) return "80331";
  return "Weiß ich gerade nicht genau.";
}

/** Formular ohne die Angaben, die die Zwischenfrage beantworten (damit das Beispiel sie zeigt). */
function ohneZwischenAngaben(produkt: string, formular: FormAntwort[]): FormAntwort[] {
  const p = outreachProdukt(produkt);
  if (!p || !ZWISCHENFRAGE_AKTIV.includes(p.purpose)) return formular;
  const def = (ZWISCHENFRAGEN[p.purpose] ?? []).find((d) => !d.tier || d.tier === p.tier);
  return def ? formular.filter((f) => !def.bekannt.test(f.label)) : formular;
}

/**
 * Beispielchat aus Sicht von Frau Becker (WhatsApp auf ihrem Handy): Nachrichten des Assistenten links, ihre rechts.
 * Alle Texte des Assistenten kommen aus denselben Funktionen wie beim echten Versand.
 */
export function beispielVerlauf(o: BeispielEingabe): ChatZeile[] {
  const { an, person, produkt, now } = o;
  const kontakt = BEISPIEL_KONTAKT;
  const formular = ohneZwischenAngaben(produkt, o.formular);
  const out: ChatZeile[] = [];
  let t = berlinZeit(now, 0, 9).getTime() + 12 * 60_000; // heute 9:12 Uhr
  const zeit = (plusMin = 1) => {
    t += plusMin * 60_000;
    return uhr(new Date(t));
  };
  const assistent = (text: string, extra: { knoepfe?: string[]; fusszeile?: string | null; anhang?: string } = {}, plusMin = 0) =>
    out.push({ art: "nachricht", von: "assistent", text, ...extra, zeit: zeit(plusMin) });
  const lead = (text: string, plusMin = 1) => out.push({ art: "nachricht", von: "lead", text, zeit: zeit(plusMin) });

  // 1. Erstanschreiben v9 (Vorlage mit der Erstinformation als PDF im Kopf, KI-Kennzeichnung in der Fußzeile)
  out.push({ art: "hinweis", text: "Heute" });
  assistent(erstanschreibenText({ an, kontakt, name: person.nom, vermittler: person.dat, vermittlerNom: person.nom, source: produkt, formular }, { ohneFuss: true }), {
    anhang: "Erstinformation.pdf",
    knoepfe: ersteFrageKnoepfe(produkt, formular),
    fusszeile: ERSTINFO_FOOTER_V9,
  });
  lead(ersteAntwort(produkt, formular, an), 3);

  // 2. Genau eine Zwischenfrage (nur wo aktiv, z. B. Privatschutz)
  const zwischen = offeneZwischenfrage(produkt, formular, null);
  let angaben: Record<string, string> | null = null;
  if (zwischen) {
    assistent(zwischenfrageText(zwischen, an, person), { knoepfe: zwischen.knoepfe });
    lead(zwischen.knoepfe[0], 1);
    angaben = { [zwischen.feld]: zwischen.knoepfe[0] };
  }

  // 3. Terminvorschlag mit zwei Zeiten (früheste und früheste an einem anderen Tag)
  const z1 = berlinZeit(now, 1, 10);
  const z2 = berlinZeit(now, 2, 16);
  const vorschlagJetzt = new Date(t);
  assistent(
    terminVorschlagText({ an, source: produkt, formular, angaben, person, zeiten: [zeitKurz(z1, vorschlagJetzt), zeitKurz(z2, vorschlagJetzt)], video: true }),
    { knoepfe: terminKnoepfe([z1.toISOString(), z2.toISOString()], vorschlagJetzt).map((k) => k.title) },
  );
  const gewaehlt = terminKnoepfe([z1.toISOString(), z2.toISOString()], vorschlagJetzt)[1].title;
  lead(gewaehlt, 2);

  // 4. Kurze Bestätigung, dann Komplettcheck
  assistent(buchungsText({ an, start: z2, mode: "video", meetUrl: BEISPIEL_LINK, person }));
  const familie = istFamilie(formular, angaben);
  assistent(komplettcheckFrage(an, person, familie), { knoepfe: KOMPLETTCHECK_KNOEPFE.map((k) => k.title) });
  lead(KOMPLETTCHECK_KNOEPFE[0].title, 1);

  // 5. Angaben fürs Angebot (erste Frage mit Nutzen, eine pro Nachricht; hier nur die erste)
  const quelle = { formular, angaben };
  const sparten = spartenDesLeads(produkt, quelle);
  const fragen = folgefragen(sparten, quelle);
  if (fragen[0]) {
    const frage = folgefrageText(fragen[0], an, person.nom, true, { nutzenGesagt: !!zwischen });
    assistent(`Super! ${frage}`, { knoepfe: knoepfeFuerText(frage, fragen)?.map((k) => k.title) });
    lead(fragen[0].knoepfe?.[0] ?? beispielAngabe(fragen[0].key, fragen[0].sie), 2);
    if (fragen.length > 1) out.push({ art: "hinweis", text: fragen.length === 2 ? "Noch eine Frage fürs Angebot" : `Noch ${fragen.length - 1} kurze Fragen fürs Angebot` });
  }

  // 6. Komplettcheck „Ja“: bestehende Verträge
  assistent(vertragsFrage(an, familie, fragen[0] ? "Danke!" : "Super!", person));
  lead("Kfz bei der Allianz und eine Unfallversicherung bei der HUK.", 3);

  // 7. Policen-Bitte (Policen-Modul, mit „Danke!“ nach der Antwort) und die Einwilligung als eigene Nachricht; auf
  // „Einverstanden“ folgt sofort der Schluss (lib/whatsapp/termin-strecke.ts nachPolicenAntwort)
  const vermittler: BitteVermittler = { ...person, anrede: o.vermittler.anrede, name: o.vermittler.name };
  if (o.policen) {
    const b = policenBitte({ an, vermittler, gesundheitAn: o.gesundheitAn, firma: o.firma });
    assistent(`Danke! ${b.text}`);
    assistent(b.einwilligung.text, { knoepfe: b.einwilligung.knoepfe.map((k) => k.title), fusszeile: b.einwilligung.fusszeile });
    lead(b.einwilligung.knoepfe[0].title, 2);
    assistent(nachEinwilligungText(an));
  }

  // 8. Schluss: Bereitlegen in einer Zeile, Frage nach der Adresse für die Einladung
  const liste = bereitlegenListe(produkt, sparten, an, { quelle, komplettcheck: true }).map((x) =>
    o.policen && VERTRAEGE_BEREITLEGEN_RE.test(x) ? a(an, "deine übrigen Policen, falls du sie nicht geschickt hast", "Ihre übrigen Policen, falls Sie sie nicht geschickt haben") : x,
  );
  const einleitung = abschlussEinleitung(an, person, o.policen ? "ohne_antwort" : "vertraege");
  assistent(abschlussText({ an, person, bereitlegen: liste, email: BEISPIEL_EMAIL, nachFragen: true, einleitung }), { knoepfe: EMAIL_KNOEPFE.map((k) => k.title) });
  lead(EMAIL_KNOEPFE[0].title, 1);
  assistent(einladungUnterwegs(an));
  assistent(eingetragenFrage(an), { knoepfe: EINGETRAGEN_KNOEPFE.map((k) => k.title) });
  lead(EINGETRAGEN_KNOEPFE[0].title, 1);
  return out;
}
