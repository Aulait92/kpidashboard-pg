// Diagnose q=nutzung-woche[&tage=7] (Ole, 18.11.2026, nur lesend): wöchentliche Usability-Auswertung des
// Vermittlerbereichs für die UX-Runde. Vergleicht die letzten N Tage (Standard 7, höchstens 30) mit den N Tagen davor.
//
// Anonym und zusammengefasst: nur Anzahlen und Prozentwerte. Keine Namen, E-Mails, Telefonnummern, keine IDs von
// Personen, Kunden oder Leads, keine Lead-Inhalte. Freitext gibt es nur aus der KI-Hilfe, und der wird ausschließlich
// über feste Stichwortregeln einem Thema zugeordnet (hilfeThema); ausgegeben wird nur die Anzahl je Thema.
// Feedback-Texte und Kommentare werden gar nicht erst geladen. Kunden-IDs dienen nur intern zum Zählen (distinct).
//
// Echte Kunden: nicht Test, nicht intern (plan „internal“), nicht archiviert, nicht Demo- oder Support-Kunde.
// Admin in „Als Kunde ansehen“ (UsageEvent.preview) zählt nicht.
//
// Aufbau: ladeRohdaten (begrenzte, datumsgefilterte Abfragen) → auswerten (rein, Unit-Tests in
// tests/unit/nutzung-woche.test.ts) → Bericht. Integrationstest: tests/integration/nutzung-woche.test.ts.

import { adminNutzung } from "@/lib/ops/admin-nutzung";
import { openForNextStepWhere, resultMissingWhere, withoutNextStepWhere } from "@/lib/lead-next-step";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { NUR_PPL_WHERE } from "@/lib/customer-package";
import { REASON_LABEL, type EscalationReason } from "@/lib/support";
import { SUPPORT_CUSTOMER_ID } from "@/lib/whatsapp/support-inbox";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Demo-Kunden (Google-Prüfung, öffentliche App-Demo) und interne Support-Nummer zählen nie. */
const AUSGESCHLOSSEN = ["cust_google_review_demo", "app_demo_max_berger", SUPPORT_CUSTOMER_ID];
const TOP = 15;
const UNGENUTZT_MAX = 30;
/** Fenster für „ungenutzt“: Seiten/Aktionen, die in den letzten 60 Tagen genutzt wurden (mindestens 2 × tage). */
const FENSTER_TAGE = 60;

/** a = aktueller Zeitraum, v = Zeitraum davor, f = früher (nur für „ungenutzt“) */
export type Periode = "a" | "v" | "f";

export function tageAus(params: URLSearchParams): number {
  const n = Number.parseInt(params.get("tage") ?? "", 10);
  if (!Number.isFinite(n) || n < 1) return 7;
  return Math.min(30, n);
}

// ─── Rohdaten (nur intern, nie ausgegeben) ──────────────────────────────────────────────────────────

export type Rohdaten = {
  tage: number;
  now: Date;
  kunden: { gesamt: number; software: number };
  aktiv: { periode: Periode; kunden: number; nutzer: number; kundentage: number }[];
  /** UsageEvent page | action | error | feedback, gruppiert je Name und Kunde (Kunde nur zum Zählen) */
  ereignisse: { periode: Periode; type: string; name: string; kunde: string; anzahl: number }[];
  audit: { periode: Periode; action: string; ergebnis: string | null; kunde: string; anzahl: number }[];
  /** Fragen an die KI-Hilfe: nur für die Themenzuordnung im Speicher */
  hilfe: { periode: Periode; frage: string | null; bewertung: string | null }[];
  support: { periode: Periode; name: string; grund: string | null; kanal: string | null; anzahl: number }[];
  umfrage: { periode: Periode; art: string; wert: number }[];
  aufgaben: {
    wiedervorlagenOffen: number;
    wiedervorlagenFaellig: number;
    wiedervorlagenUeber24h: number;
    aufgabenWartend: number;
    aufgabenWartendFaellig: number;
    termine30Tage: number;
    termineOhneErgebnis: number;
  };
  naechsterSchritt: { offen: number; ohne: number; ergebnisFehlt: number };
  /** Neue Leads: Anlage und erste Reaktionen (nur Zeitpunkte) */
  reaktion: { periode: Periode; angelegt: Date; kontakt: Date | null; nachricht: Date | null; agent: Date | null; verlauf: Date | null }[];
  admin: AdminRoh | null;
};

type AdminRoh = {
  seit: string | null;
  summen: Record<string, number>;
  aktionenAdmin: { aktion: string; text: string | null; anzahl: number }[];
  funktionen: { id: string; anzahl: number; admins: number }[];
  inGruppe: { id: string; anzahl: number; admins: number }[];
  seiten: { pfad: string; anzahl: number; admins: number }[];
};

// ─── Reine Helfer ───────────────────────────────────────────────────────────────────────────────

/** Prozent mit einer Nachkommastelle, null ohne Basis. */
export const prozent = (teil: number, basis: number): number | null => (basis > 0 ? Math.round((teil / basis) * 1000) / 10 : null);

export function vergleich(aktuell: number, vorher: number) {
  return { aktuell, vorher, veraenderungProzent: vorher > 0 ? Math.round(((aktuell - vorher) / vorher) * 100) : null };
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const ID_SEGMENT = /^(c[a-z0-9]{20,32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d+|(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{16,})$/;

/** Seitenpfad ohne IDs und Abfrage (gleiche Seiten zusammenzählen, keine Lead- oder Kunden-IDs ausgeben). */
export function seitenName(name: string): string {
  const pfad = name.split(/[?#]/)[0] || "/";
  return pfad
    .split("/")
    .map((s) => (s && ID_SEGMENT.test(s) ? "[id]" : s))
    .join("/")
    .slice(0, 120);
}

/**
 * Fehler-Toast als Typ: Präfix weg, E-Mails, Dateinamen, Nummern, Zahlen und Zitate („…“) ersetzt, damit keine Namen oder
 * Kontaktdaten aus eingesetzten Texten in die Auswertung gelangen.
 */
export function fehlerName(name: string): string {
  const s = name
    .replace(/^toast:\s*/i, "")
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[E-Mail]")
    .replace(/[^\s:„"]+\.(pdf|jpe?g|png|webp|gif|heic|docx?|xlsx?|csv|txt)\b/gi, "[Datei]")
    .replace(/\+?\d[\d\s/().-]{5,}\d/g, "[Nummer]")
    .replace(/„[^“”"]*[“”"]|"[^"]*"|«[^»]*»|»[^«]*«/g, "„…“")
    .replace(/\d+/g, "N")
    .replace(/\s+/g, " ")
    .trim();
  return s.slice(0, 80) || "(ohne Text)";
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");

/** Themen der KI-Hilfe: Stichwörter (Wortanfang, ohne Umlaute). Bei Gleichstand gewinnt das frühere Thema. */
export const HILFE_THEMEN: readonly (readonly [string, readonly string[]])[] = [
  ["Abrechnung/Rechnung", ["rechnung", "abrechnung", "zahlung", "bezahl", "zahle", "lastschrift", "sepa", "gebuehr", "kosten", "preis", "abo", "guthaben", "stripe"]],
  ["Policen", ["police", "versicherungsschein", "vertrag", "vertraege", "abschluss", "provision", "storno", "kuendig", "sparte"]],
  ["Angebot/Präsentation", ["angebot", "praesentation", "folie", "beratung", "vorbereitung", "tarif", "vergleich", "pdf"]],
  ["Termine/Kalender", ["termin", "kalender", "buchung", "buchungslink", "rueckruf", "verfuegbar", "outlook", "uhrzeit", "absage", "verschieb"]],
  ["WhatsApp", ["whatsapp", "chat", "nachricht", "assistent", "bot", "vorlage", "360dialog", "sms"]],
  ["Einstellungen/Konto", ["einstellung", "konto", "passwort", "login", "anmeld", "einlog", "profil", "team", "benutzer", "mitarbeiter", "postfach", "signatur", "benachrichtigung", "push", "zugang", "rolle"]],
  ["Leads", ["lead", "kontakt", "kunde", "anfrage", "interessent", "pipeline", "wiedervorlage", "erreicht", "verloren", "anruf", "telefon", "liste", "import", "bestand"]],
];
export const HILFE_SONSTIGES = "Sonstiges";
const THEMEN_REGEX = HILFE_THEMEN.map(([thema, woerter]) => [thema, woerter.map((w) => new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "g"))] as const);

/** Frage → Thema (nur feste Stichwortregeln, keine KI, kein Text in der Ausgabe). */
export function hilfeThema(frage: string | null | undefined): string {
  const t = norm(String(frage ?? ""));
  let best = HILFE_SONSTIGES;
  let bestN = 0;
  for (const [thema, regs] of THEMEN_REGEX) {
    let n = 0;
    for (const r of regs) n += t.match(r)?.length ?? 0;
    if (n > bestN) {
      best = thema;
      bestN = n;
    }
  }
  return best;
}

type Zaehler = { a: number; v: number; f: number; kundenA: Set<string>; kundenV: Set<string> };
const neuerZaehler = (): Zaehler => ({ a: 0, v: 0, f: 0, kundenA: new Set(), kundenV: new Set() });

/** Top-Liste und „ungenutzt“ (im Fenster genutzt, im aktuellen Zeitraum nicht) für einen Ereignistyp. */
export function rangliste(zeilen: Rohdaten["ereignisse"], type: string, name: (n: string) => string = (n) => n, top = TOP) {
  const m = new Map<string, Zaehler>();
  for (const z of zeilen) {
    if (z.type !== type) continue;
    const key = name(z.name);
    const c = m.get(key) ?? neuerZaehler();
    c[z.periode] += z.anzahl;
    if (z.periode === "a") c.kundenA.add(z.kunde);
    if (z.periode === "v") c.kundenV.add(z.kunde);
    m.set(key, c);
  }
  const alle = [...m.entries()];
  const summe = (p: "a" | "v") => alle.reduce((s, [, c]) => s + c[p], 0);
  return {
    gesamt: vergleich(summe("a"), summe("v")),
    verschiedene: vergleich(alle.filter(([, c]) => c.a > 0).length, alle.filter(([, c]) => c.v > 0).length),
    top: alle
      .filter(([, c]) => c.a > 0)
      .sort((x, y) => y[1].a - x[1].a || x[0].localeCompare(y[0]))
      .slice(0, top)
      .map(([n, c]) => ({ name: n, anzahl: c.a, vorher: c.v, kunden: c.kundenA.size })),
    ungenutzt: alle
      .filter(([, c]) => c.a === 0 && c.v + c.f > 0)
      .sort((x, y) => y[1].v + y[1].f - (x[1].v + x[1].f) || x[0].localeCompare(y[0]))
      .slice(0, UNGENUTZT_MAX)
      .map(([n, c]) => ({ name: n, anzahlDavor: c.v + c.f })),
  };
}

type Quelle = { art: "seite" | "aktion"; namen: string[] } | { art: "audit"; aktionen: string[]; ergebnis?: string };
type Trichter = { titel: string; start: Quelle | null; ziel: Quelle; startText: string; zielText: string };

/** Abbrüche: Start und Abschluss je Kunde (distinct). Ohne Startereignis oder ganz ohne Ereignisse: „keine Messung“. */
export const TRICHTER: Record<string, Trichter> = {
  import: {
    titel: "Bestandskunden importieren",
    start: { art: "seite", namen: ["/buyer/bestand/import"] },
    ziel: { art: "audit", aktionen: ["bestand.import"] },
    startText: "Seite Import geöffnet",
    zielText: "Import gespeichert",
  },
  whatsappVerbinden: {
    titel: "WhatsApp selbst verbinden",
    start: { art: "audit", aktionen: ["whatsapp.self_connect"] },
    ziel: { art: "audit", aktionen: ["whatsapp.self_connect"], ergebnis: "connected" },
    startText: "Rückkehr von 360dialog (der Klick auf „Verbinden“ selbst wird nicht gemessen)",
    zielText: "verbunden",
  },
  kampagneAnlegen: {
    titel: "Kampagne anlegen",
    start: { art: "seite", namen: ["/buyer/bestand/kampagne"] },
    ziel: { art: "audit", aktionen: ["bestand.campaign"] },
    startText: "Seite Kampagne geöffnet",
    zielText: "Kampagne gestartet",
  },
  angebotSenden: {
    titel: "Angebot senden",
    start: null,
    ziel: { art: "aktion", namen: ["angebot.app", "angebot.selbst"] },
    startText: "Öffnen des Dialogs wird nicht gemessen",
    zielText: "Angebot gesendet (App oder selbst)",
  },
};

function treffer(roh: Rohdaten, q: Quelle, periode: "a" | "v"): { kunden: Set<string>; anzahl: number } {
  const kunden = new Set<string>();
  let anzahl = 0;
  if (q.art === "audit") {
    for (const z of roh.audit) {
      if (z.periode !== periode || !q.aktionen.includes(z.action) || (q.ergebnis && z.ergebnis !== q.ergebnis)) continue;
      kunden.add(z.kunde);
      anzahl += z.anzahl;
    }
  } else {
    const type = q.art === "seite" ? "page" : "action";
    for (const z of roh.ereignisse) {
      if (z.periode !== periode || z.type !== type || !q.namen.includes(q.art === "seite" ? seitenName(z.name) : z.name)) continue;
      kunden.add(z.kunde);
      anzahl += z.anzahl;
    }
  }
  return { kunden, anzahl };
}

export function trichter(roh: Rohdaten, t: Trichter) {
  const ziel = { a: treffer(roh, t.ziel, "a"), v: treffer(roh, t.ziel, "v") };
  const abgeschlossen = vergleich(ziel.a.anzahl, ziel.v.anzahl);
  if (!t.start) return { titel: t.titel, messung: "keine Messung" as const, grund: t.startText, abgeschlossen, ziel: t.zielText };
  const start = { a: treffer(roh, t.start, "a"), v: treffer(roh, t.start, "v") };
  if (!start.a.anzahl && !start.v.anzahl && !ziel.a.anzahl && !ziel.v.anzahl) {
    return { titel: t.titel, messung: "keine Messung" as const, grund: "keine Ereignisse in beiden Zeiträumen", start: t.startText, ziel: t.zielText };
  }
  const je = (p: "a" | "v") => {
    const gestartet = start[p].kunden.size;
    const fertig = [...start[p].kunden].filter((k) => ziel[p].kunden.has(k)).length;
    return { gestartet, abgeschlossen: fertig, abgebrochen: gestartet - fertig, abbruchProzent: prozent(gestartet - fertig, gestartet), abgeschlossenGesamt: ziel[p].kunden.size };
  };
  return { titel: t.titel, messung: "ja" as const, einheit: "Kunden", start: t.startText, ziel: t.zielText, aktuell: je("a"), vorher: je("v") };
}

function umfrageAuswertung(werte: { art: string; wert: number }[]) {
  const start = werte.filter((w) => w.art === "day7" && w.wert >= 1 && w.wert <= 5).map((w) => w.wert);
  const nps = werte.filter((w) => w.art !== "day7" && w.wert >= 0 && w.wert <= 10).map((w) => w.wert);
  const schnitt = (xs: number[]) => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null);
  const verteilung = (xs: number[], von: number, bis: number) => Object.fromEntries(Array.from({ length: bis - von + 1 }, (_, i) => [String(von + i), xs.filter((x) => x === von + i).length]));
  const promotoren = nps.filter((x) => x >= 9).length;
  const kritiker = nps.filter((x) => x <= 6).length;
  return {
    antworten: start.length + nps.length,
    startTag7: { anzahl: start.length, schnitt: schnitt(start), skala: "1–5", verteilung: verteilung(start, 1, 5) },
    weiterempfehlung: {
      anzahl: nps.length,
      nps: nps.length ? Math.round(((promotoren - kritiker) / nps.length) * 100) : null,
      schnitt: schnitt(nps),
      promotoren,
      passive: nps.length - promotoren - kritiker,
      kritiker,
      verteilung: verteilung(nps, 0, 10),
    },
  };
}

function reaktionAuswertung(zeilen: Rohdaten["reaktion"]) {
  const minuten = (von: Date, bis: Date | null) => (bis && bis.getTime() >= von.getTime() ? (bis.getTime() - von.getTime()) / 60000 : null);
  const frueheste = (...xs: (number | null)[]) => {
    const ok = xs.filter((x): x is number => x !== null);
    return ok.length ? Math.min(...ok) : null;
  };
  const kennzahl = (xs: (number | null)[]) => {
    const ok = xs.filter((x): x is number => x !== null);
    const m = median(ok);
    return { gemessen: ok.length, ohne: xs.length - ok.length, medianMinuten: m === null ? null : Math.round(m) };
  };
  const nachricht = zeilen.map((z) => minuten(z.angelegt, z.nachricht));
  const vermittler = zeilen.map((z) => frueheste(minuten(z.angelegt, z.kontakt), minuten(z.angelegt, z.agent), minuten(z.angelegt, z.verlauf)));
  return {
    neueLeads: zeilen.length,
    ersteReaktion: kennzahl(zeilen.map((_, i) => frueheste(nachricht[i], vermittler[i]))),
    ersteNachricht: kennzahl(nachricht),
    ersteVermittlerAktion: kennzahl(vermittler),
  };
}

type AdminKurz = { seit: string | null; summen: Record<string, number>; topFunktionen: { id: string; anzahl: number; admins: number }[]; topSeiten: { pfad: string; anzahl: number }[]; topAktionen: { aktion: string; text: string | null; anzahl: number }[] };

function adminKurz(a: AdminRoh | null): AdminKurz | { messung: "keine Messung"; grund: string } {
  if (!a) return { messung: "keine Messung", grund: "Abfrage nicht möglich" };
  const funktionen = new Map<string, { anzahl: number; admins: number }>();
  for (const f of [...a.funktionen, ...a.inGruppe]) {
    const c = funktionen.get(f.id) ?? { anzahl: 0, admins: 0 };
    funktionen.set(f.id, { anzahl: c.anzahl + f.anzahl, admins: Math.max(c.admins, f.admins) });
  }
  return {
    seit: a.seit,
    summen: a.summen,
    topFunktionen: [...funktionen.entries()]
      .map(([id, c]) => ({ id, ...c }))
      .sort((x, y) => y.anzahl - x.anzahl || x.id.localeCompare(y.id))
      .slice(0, 10),
    topSeiten: [...a.seiten].sort((x, y) => y.anzahl - x.anzahl).slice(0, 10).map((s) => ({ pfad: s.pfad, anzahl: s.anzahl })),
    topAktionen: a.aktionenAdmin.slice(0, 10).map((x) => ({ aktion: x.aktion, text: x.text, anzahl: x.anzahl })),
  };
}

/** Reiner Kern: Rohdaten → anonymer Bericht (nur Anzahlen und Prozentwerte). */
export function auswerten(roh: Rohdaten) {
  const { tage, now } = roh;
  const aVon = new Date(now.getTime() - tage * DAY_MS);
  const vVon = new Date(now.getTime() - 2 * tage * DAY_MS);
  const aktiv = (p: "a" | "v") => roh.aktiv.find((x) => x.periode === p) ?? { kunden: 0, nutzer: 0, kundentage: 0 };
  const [aa, av] = [aktiv("a"), aktiv("v")];
  const nachPeriode = <T extends { periode: Periode }>(xs: T[], p: "a" | "v") => xs.filter((x) => x.periode === p);

  // KI-Hilfe: nur Themen
  const themen = new Map<string, { a: number; v: number }>();
  for (const [t] of HILFE_THEMEN) themen.set(t, { a: 0, v: 0 });
  themen.set(HILFE_SONSTIGES, { a: 0, v: 0 });
  for (const h of roh.hilfe) {
    if (h.periode === "f") continue;
    themen.get(hilfeThema(h.frage))![h.periode]++;
  }
  const bewertung = (p: "a" | "v", b: string) => nachPeriode(roh.hilfe, p).filter((h) => h.bewertung === b).length;

  // Support-Anfragen (Weitergabe aus der KI-Hilfe; UsageEvent „support“: offered → contacted)
  const sup = (p: "a" | "v", nurKontakt: boolean) => nachPeriode(roh.support, p).filter((s) => !nurKontakt || s.name === "contacted").reduce((n, s) => n + s.anzahl, 0);
  const supportGruppe = (key: "grund" | "kanal") => {
    const m = new Map<string, number>();
    for (const s of nachPeriode(roh.support, "a")) {
      if (s.name !== "contacted") continue;
      const k = key === "grund" ? (REASON_LABEL[s.grund as EscalationReason] ?? "Sonstiges") : (s.kanal ?? "unbekannt");
      m.set(k, (m.get(k) ?? 0) + s.anzahl);
    }
    return Object.fromEntries([...m.entries()].sort((x, y) => y[1] - x[1]));
  };

  const fehler = rangliste(roh.ereignisse, "error", fehlerName);
  const feedbackFormular = (p: "a" | "v") => nachPeriode(roh.ereignisse, p).filter((e) => e.type === "feedback").reduce((n, e) => n + e.anzahl, 0);
  const au = roh.aufgaben;
  const ns = roh.naechsterSchritt;

  return {
    tage,
    zeitraum: { von: aVon.toISOString(), bis: now.toISOString() },
    vergleichszeitraum: { von: vVon.toISOString(), bis: aVon.toISOString() },
    datenschutz: "Nur Anzahlen und Prozentwerte. Keine Namen, E-Mails, Telefonnummern, IDs oder Inhalte; Hilfe-Fragen nur als Themen.",
    basis: { echteKunden: roh.kunden.gesamt, davonSoftware: roh.kunden.software, ausgeschlossen: "Test, intern, archiviert, Demo, Support, Admin-Vorschau" },
    aktiv: {
      kunden: vergleich(aa.kunden, av.kunden),
      kundenProzent: { aktuell: prozent(aa.kunden, roh.kunden.gesamt), vorher: prozent(av.kunden, roh.kunden.gesamt) },
      nutzer: vergleich(aa.nutzer, av.nutzer),
      aktiveTageJeKunde: {
        aktuell: aa.kunden ? Math.round((aa.kundentage / aa.kunden) * 10) / 10 : null,
        vorher: av.kunden ? Math.round((av.kundentage / av.kunden) * 10) / 10 : null,
      },
    },
    seiten: rangliste(roh.ereignisse, "page", seitenName),
    aktionen: rangliste(roh.ereignisse, "action"),
    abbrueche: Object.fromEntries(Object.entries(TRICHTER).map(([k, t]) => [k, trichter(roh, t)])),
    fehlerToasts: { gesamt: fehler.gesamt, verschiedene: fehler.verschiedene, top: fehler.top },
    feedback: {
      formularEtwasUnklar: vergleich(feedbackFormular("a"), feedbackFormular("v")),
      umfrage: {
        aktuell: umfrageAuswertung(nachPeriode(roh.umfrage, "a")),
        vorher: umfrageAuswertung(nachPeriode(roh.umfrage, "v")),
      },
      hilfeBewertung: { hilfreich: vergleich(bewertung("a", "up"), bewertung("v", "up")), nichtHilfreich: vergleich(bewertung("a", "down"), bewertung("v", "down")) },
    },
    support: {
      quelle: "Weitergabe aus der KI-Hilfe („Mit Mensch sprechen“)",
      angeboten: vergleich(sup("a", false), sup("v", false)),
      kontaktiert: vergleich(sup("a", true), sup("v", true)),
      nachGrund: supportGruppe("grund"),
      nachKanal: supportGruppe("kanal"),
    },
    hilfeFragen: {
      gesamt: vergleich(nachPeriode(roh.hilfe, "a").length, nachPeriode(roh.hilfe, "v").length),
      themen: [...themen.entries()].map(([thema, c]) => ({ thema, anzahl: c.a, vorher: c.v })).sort((x, y) => y.anzahl - x.anzahl || y.vorher - x.vorher),
    },
    aufgaben: {
      stand: "jetzt",
      wiedervorlagenOffen: au.wiedervorlagenOffen,
      faellig: au.wiedervorlagenFaellig,
      ueberfaelligUeber24h: au.wiedervorlagenUeber24h,
      ueberfaelligProzent: prozent(au.wiedervorlagenUeber24h, au.wiedervorlagenOffen),
      wartendeAufgaben: au.aufgabenWartend,
      wartendeAufgabenFaellig: au.aufgabenWartendFaellig,
      termineOhneErgebnis: au.termineOhneErgebnis,
      termineOhneErgebnisProzent: prozent(au.termineOhneErgebnis, au.termine30Tage),
      termineBasis: "Termine der letzten 30 Tage, älter als 24 Stunden, nicht abgesagt",
    },
    naechsterSchritt: {
      stand: "jetzt",
      offeneLeads: ns.offen,
      mitSchritt: ns.offen - ns.ohne,
      ohneSchritt: ns.ohne,
      davonErgebnisFehlt: ns.ergebnisFehlt,
      mitSchrittProzent: prozent(ns.offen - ns.ohne, ns.offen),
      definition: "lib/lead-next-step.ts (Termin, Wiedervorlage/Aufgabe oder laufendes Assistenten-Gespräch)",
    },
    ersteReaktion: {
      definition: "Minuten von der Anlage eines neuen Leads bis zur ersten ausgehenden Nachricht (auch Assistent) bzw. ersten Vermittler-Aktion (Kontaktversuch, eigene Nachricht, Verlaufseintrag)",
      aktuell: reaktionAuswertung(nachPeriode(roh.reaktion, "a")),
      vorher: reaktionAuswertung(nachPeriode(roh.reaktion, "v")),
    },
    adminNutzungSeitGestern: adminKurz(roh.admin),
  };
}

export type NutzungWoche = ReturnType<typeof auswerten>;

// ─── Laden (begrenzte Abfragen mit Datumsfilter) ───────────────────────────────────────────────────

const AUDIT_AKTIONEN = [...new Set(Object.values(TRICHTER).flatMap((t) => [t.start, t.ziel].flatMap((q) => (q?.art === "audit" ? q.aktionen : []))))];

/** opts.kunden: nur diese Kunden (Tests); sonst alle echten Kunden. */
export async function ladeRohdaten(tage: number, opts: { now?: Date; kunden?: string[] } = {}): Promise<Rohdaten> {
  const now = opts.now ?? new Date();
  const aVon = new Date(now.getTime() - tage * DAY_MS);
  const vVon = new Date(now.getTime() - 2 * tage * DAY_MS);
  const fVon = new Date(now.getTime() - Math.max(FENSTER_TAGE, 2 * tage) * DAY_MS);

  const kunden = await prisma.customer.findMany({
    where: { AND: [{ isTest: false, archived: false, plan: { not: "internal" }, id: { notIn: AUSGESCHLOSSEN } }, ...(opts.kunden ? [{ id: { in: opts.kunden } }] : [])] },
    select: { id: true, plan: true },
  });
  const ids = kunden.map((k) => k.id);
  // Leeres Array lässt Postgres den Typ nicht erkennen: Platzhalter, der zu keinem Kunden passt
  const idsSql = ids.length ? ids : ["-"];
  const leadScope = { customerId: { in: ids }, isTest: false };
  const periode = (d: Date): Periode => (d >= aVon ? "a" : d >= vVon ? "v" : "f");

  const [aktiv, ereignisse, audit, hilfe, support, umfrage, reaktion, aufgaben, naechsterSchritt, admin] = await Promise.all([
    prisma.$queryRaw<Rohdaten["aktiv"]>`
      SELECT CASE WHEN "at" >= ${aVon} THEN 'a' ELSE 'v' END AS periode,
             COUNT(DISTINCT "customerId")::int AS kunden, COUNT(DISTINCT "userId")::int AS nutzer,
             COUNT(DISTINCT "customerId" || ':' || to_char("at" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Berlin', 'YYYY-MM-DD'))::int AS kundentage
      FROM "UsageEvent"
      WHERE "preview" = false AND "at" >= ${vVon} AND "at" < ${now} AND "customerId" = ANY(${idsSql})
      GROUP BY 1`,
    prisma.$queryRaw<Rohdaten["ereignisse"]>`
      SELECT CASE WHEN "at" >= ${aVon} THEN 'a' WHEN "at" >= ${vVon} THEN 'v' ELSE 'f' END AS periode,
             "type", "name", "customerId" AS kunde, COUNT(*)::int AS anzahl
      FROM "UsageEvent"
      WHERE "preview" = false AND "type" IN ('page', 'action', 'error', 'feedback') AND "at" >= ${fVon} AND "at" < ${now}
        AND "customerId" = ANY(${idsSql})
      GROUP BY 1, 2, 3, 4
      LIMIT 100000`,
    prisma.$queryRaw<Rohdaten["audit"]>`
      SELECT CASE WHEN "at" >= ${aVon} THEN 'a' ELSE 'v' END AS periode,
             "action", "details"->>'result' AS ergebnis, "customerId" AS kunde, COUNT(*)::int AS anzahl
      FROM "AuditLog"
      WHERE "action" = ANY(${AUDIT_AKTIONEN}) AND "at" >= ${vVon} AND "at" < ${now} AND "customerId" = ANY(${idsSql})
      GROUP BY 1, 2, 3, 4`,
    prisma.$queryRaw<Rohdaten["hilfe"]>`
      SELECT CASE WHEN "at" >= ${aVon} THEN 'a' ELSE 'v' END AS periode,
             "meta"->>'question' AS frage, "meta"->>'rating' AS bewertung
      FROM "UsageEvent"
      WHERE "type" = 'help' AND "preview" = false AND "at" >= ${vVon} AND "at" < ${now} AND "customerId" = ANY(${idsSql})
      ORDER BY "at" DESC
      LIMIT 5000`,
    prisma.$queryRaw<Rohdaten["support"]>`
      SELECT CASE WHEN "at" >= ${aVon} THEN 'a' ELSE 'v' END AS periode,
             "name", "meta"->>'reason' AS grund, "meta"->>'channel' AS kanal, COUNT(*)::int AS anzahl
      FROM "UsageEvent"
      WHERE "type" = 'support' AND "preview" = false AND "at" >= ${vVon} AND "at" < ${now} AND "customerId" = ANY(${idsSql})
      GROUP BY 1, 2, 3, 4`,
    prisma.customerFeedback
      .findMany({
        where: { customerId: { in: ids }, score: { not: null }, answeredAt: { gte: vVon, lt: now } },
        select: { kind: true, score: true, answeredAt: true },
        take: 5000,
      })
      .then((rows) => rows.map((r) => ({ periode: periode(r.answeredAt!), art: r.kind, wert: r.score! }))),
    prisma.$queryRaw<Omit<Rohdaten["reaktion"][number], "periode">[]>`
      WITH l AS (
        SELECT "id", "customerId", "createdAt", "firstContactAt" FROM "Lead"
        WHERE "customerId" = ANY(${idsSql}) AND "isTest" = false AND "createdAt" >= ${vVon} AND "createdAt" < ${now}
        ORDER BY "createdAt" DESC LIMIT 20000
      ),
      m AS (
        SELECT l."id", MIN(m."createdAt") AS erste, MIN(m."createdAt") FILTER (WHERE m."sentBy" = 'agent') AS agent
        FROM l
        JOIN "Conversation" c ON c."customerId" = l."customerId" AND c."leadId" = l."id"
        JOIN "Message" m ON m."conversationId" = c."id" AND m."direction" = 'outbound' AND m."createdAt" >= l."createdAt"
        GROUP BY l."id"
      ),
      h AS (
        SELECT l."id", MIN(h."createdAt") AS erste
        FROM l JOIN "LeadHistory" h ON h."leadId" = l."id" AND h."userId" IS NOT NULL AND h."createdAt" >= l."createdAt"
        GROUP BY l."id"
      )
      SELECT l."createdAt" AS angelegt, l."firstContactAt" AS kontakt, m.erste AS nachricht, m.agent AS agent, h.erste AS verlauf
      FROM l LEFT JOIN m ON m."id" = l."id" LEFT JOIN h ON h."id" = l."id"`.then((rows) => rows.map((r) => ({ ...r, periode: periode(r.angelegt) }))),
    Promise.all([
      prisma.lead.count({ where: { ...leadScope, erasedAt: null, followUpAt: { not: null } } }),
      prisma.lead.count({ where: { ...leadScope, erasedAt: null, followUpAt: { lte: now } } }),
      prisma.lead.count({ where: { ...leadScope, erasedAt: null, followUpAt: { lt: new Date(now.getTime() - DAY_MS) } } }),
      prisma.leadTask.count({ where: { customerId: { in: ids }, status: "wartet" } }),
      prisma.leadTask.count({ where: { customerId: { in: ids }, status: "wartet", dueAt: { lte: now } } }),
      prisma.appointment.count({ where: { customerId: { in: ids }, status: { not: "cancelled" }, startsAt: { gte: new Date(now.getTime() - 30 * DAY_MS), lt: new Date(now.getTime() - DAY_MS) } } }),
      prisma.appointment.count({ where: { customerId: { in: ids }, status: "booked", startsAt: { gte: new Date(now.getTime() - 30 * DAY_MS), lt: new Date(now.getTime() - DAY_MS) } } }),
    ]).then(([wiedervorlagenOffen, wiedervorlagenFaellig, wiedervorlagenUeber24h, aufgabenWartend, aufgabenWartendFaellig, termine30Tage, termineOhneErgebnis]) => ({
      wiedervorlagenOffen,
      wiedervorlagenFaellig,
      wiedervorlagenUeber24h,
      aufgabenWartend,
      aufgabenWartendFaellig,
      termine30Tage,
      termineOhneErgebnis,
    })),
    Promise.all([
      prisma.lead.count({ where: { AND: [leadScope, openForNextStepWhere()] } }),
      prisma.lead.count({ where: { AND: [leadScope, withoutNextStepWhere(now)] } }),
      prisma.lead.count({ where: { AND: [leadScope, resultMissingWhere(now)] } }),
    ]).then(([offen, ohne, ergebnisFehlt]) => ({ offen, ohne, ergebnisFehlt })),
    // Admin-Nutzung seit gestern (letzte 24 Stunden), nur zusammengefasst
    adminNutzung(new URLSearchParams({ tage: "1" })).catch(() => null),
  ]);

  return {
    tage,
    now,
    kunden: { gesamt: kunden.length, software: kunden.filter((k) => k.plan === "software").length },
    aktiv,
    ereignisse,
    audit,
    hilfe,
    support,
    umfrage,
    aufgaben,
    naechsterSchritt,
    reaktion,
    admin,
  };
}

export async function nutzungWoche(params: URLSearchParams, opts: { now?: Date; kunden?: string[] } = {}): Promise<NutzungWoche> {
  return auswerten(await ladeRohdaten(tageAus(params), opts));
}

/**
 * Getrennt nach Kundenart (Ole, 18.11.2026: „ja trennen!“): Software-Kunden (Betreuung + Software bzw. Onboarding/Retainer)
 * und reine Pay-per-Lead-Kunden (NUR_PPL_WHERE). &gruppe=software|ppl liefert nur eine Gruppe, sonst beide plus gesamt.
 */
export async function nutzungWocheGetrennt(params: URLSearchParams, opts: { now?: Date } = {}) {
  const basis: Prisma.CustomerWhereInput = { isTest: false, archived: false, plan: { not: "internal" }, id: { notIn: AUSGESCHLOSSEN } };
  const ppl = (await prisma.customer.findMany({ where: { AND: [basis, NUR_PPL_WHERE] }, select: { id: true } })).map((k) => k.id);
  const pplSet = new Set(ppl);
  const software = (await prisma.customer.findMany({ where: basis, select: { id: true } })).map((k) => k.id).filter((id) => !pplSet.has(id));
  const gruppe = params.get("gruppe");
  const tage = tageAus(params);
  const lauf = async (kunden: string[]) => auswerten(await ladeRohdaten(tage, { ...opts, kunden }));
  if (gruppe === "software") return { gruppe: "software", ...(await lauf(software)) };
  if (gruppe === "ppl") return { gruppe: "ppl", ...(await lauf(ppl)) };
  return {
    hinweis: "software = Kunden mit Software/Betreuung (Onboarding oder Monatsbetrag), ppl = reine Pay-per-Lead-Kunden",
    software: await lauf(software),
    ppl: await lauf(ppl),
    gesamt: await lauf([...software, ...ppl]),
  };
}
