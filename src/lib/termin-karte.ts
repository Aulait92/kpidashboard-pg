// Terminkarte im Kontakt (Ole, 17.11.2026): ein Hauptknopf je nach Zeit, höchstens zwei Zweitknöpfe, der Rest unter „Mehr“.
//   vorher   (bis 10 Minuten vor Beginn)      Vorbereiten; schon vorbereitet: kein blauer Hauptknopf (ruhig), Präsentation zuerst
//   jetzt    (ab 10 Minuten vorher bis Ende)  Videocall starten, beim Telefontermin Anrufen
//   nachher  (ab Ende)                         Ergebnis eintragen; erschienen (Show-up-Paket) und Angebot offen: Angebot senden
// Beratungsdokumentation (Paket B, Ole 18.11.2026, nur mit Schalter): nach dem Termin „Dokumentation“ als erster Zweitknopf,
// solange sie offen ist (erledigt: unter „Mehr“). Ist das Ergebnis schon eingetragen und die Dokumentation offen, zeigt der
// Kontakt die Karte noch BD_KARTE_TAGE Tage mit „Beratungsdokumentation erstellen“ als Hauptknopf.
// Ende = endsAt bzw. Beginn + 30 Minuten (lib/showup.ts terminEnde). Grenzen: genau 10 Minuten vorher gilt schon „jetzt“,
// genau zum Ende schon „nachher“.
// Rein (ohne Datenbank), Tests: tests/unit/termin-karte.test.ts

import { terminEnde } from "@/lib/showup";

export const TERMIN_VORLAUF_MS = 10 * 60 * 1000;

export type TerminPhase = "vorher" | "jetzt" | "nachher";
export type TerminAktion = "vorbereiten" | "videocall" | "anrufen" | "ergebnis" | "angebot" | "praesentation" | "verschieben" | "beratungsdoku";

export type KartenTermin = {
  startsAt: Date;
  endsAt?: Date | null;
  /** phone | video */
  mode: string;
  meetUrl?: string | null;
  /** Anwesenheit aus dem Show-up-Paket: erschienen | fehlt | nicht_erschienen */
  attendance?: string | null;
};

export function terminPhase(t: Pick<KartenTermin, "startsAt" | "endsAt">, now: Date): TerminPhase {
  const n = now.getTime();
  if (n < t.startsAt.getTime() - TERMIN_VORLAUF_MS) return "vorher";
  if (n < terminEnde(t).getTime()) return "jetzt";
  return "nachher";
}

/** Status, bei denen das Angebot schon raus bzw. erledigt ist. */
const ANGEBOT_ERLEDIGT = new Set(["angebot gesendet", "angebot verschickt", "angebot raus", "abschluss", "kein interesse", "disqualifiziert"]);

/** Angebot offen: Lead hat noch kein Angebot bekommen und ist weder gewonnen noch verloren. */
export function angebotOffen(status: string | null | undefined): boolean {
  const s = (status ?? "").trim().toLowerCase();
  return !ANGEBOT_ERLEDIGT.has(s) && !s.startsWith("storn");
}

export type TerminKartenAktionen = {
  phase: TerminPhase;
  haupt: TerminAktion;
  /** Höchstens zwei, sichtbar neben dem Hauptknopf */
  zweit: TerminAktion[];
  /** Unter „Mehr“ */
  mehr: TerminAktion[];
  /** Nächster Wechsel der Phase (für eine sanfte Aktualisierung), null nach dem Termin */
  naechsterWechsel: Date | null;
  /** true: nichts Dringendes, Hauptknopf nicht hervorheben (z. B. schon vorbereitet, Ole 18.11.2026) */
  ruhig: boolean;
};

export function terminKartenAktionen(
  t: KartenTermin,
  f: {
    now: Date;
    telefon: boolean;
    angebotOffen: boolean;
    /** Beratungsdokumentation zu diesem Termin (null = Schalter aus) */
    beratungsdoku?: "offen" | "erledigt" | null;
    /** false: Ergebnis steht schon (Karte nur noch für die Dokumentation) */
    ergebnisFehlt?: boolean;
    /** Termin als vorbereitet markiert (Appointment.preparedAt) */
    vorbereitet?: boolean;
  },
): TerminKartenAktionen {
  const phase = terminPhase(t, f.now);
  const video = t.mode === "video" && !!t.meetUrl;
  const vorBeginn = f.now.getTime() < t.startsAt.getTime();
  let haupt: TerminAktion;
  let reihe: TerminAktion[];
  let ruhig = false;
  if (phase === "vorher" && f.vorbereitet) {
    haupt = "praesentation";
    ruhig = true;
    reihe = ["vorbereiten", "verschieben", ...(video ? (["videocall"] as const) : [])];
  } else if (phase === "vorher") {
    haupt = "vorbereiten";
    reihe = ["praesentation", "verschieben", ...(video ? (["videocall"] as const) : [])];
  } else if (phase === "jetzt") {
    haupt = video ? "videocall" : f.telefon ? "anrufen" : "vorbereiten";
    reihe = ["praesentation", "vorbereiten", ...(video && f.telefon ? (["anrufen"] as const) : []), ...(vorBeginn ? (["verschieben"] as const) : [])];
  } else if (f.ergebnisFehlt === false && f.beratungsdoku === "offen") {
    haupt = "beratungsdoku";
    reihe = ["praesentation", "vorbereiten"];
  } else {
    haupt = t.attendance === "erschienen" && f.angebotOffen ? "angebot" : "ergebnis";
    reihe = haupt === "angebot" ? ["ergebnis", "praesentation", "vorbereiten"] : ["praesentation", "vorbereiten"];
    // Offen: gleich nach dem Ergebnis bzw. als erster Zweitknopf; erledigt: zum Nachsehen unter „Mehr“
    if (f.beratungsdoku === "offen") reihe.splice(haupt === "angebot" ? 1 : 0, 0, "beratungsdoku");
    else if (f.beratungsdoku === "erledigt") reihe.push("beratungsdoku");
  }
  const rest = reihe.filter((a) => a !== haupt);
  return {
    phase,
    haupt,
    zweit: rest.slice(0, 2),
    mehr: rest.slice(2),
    naechsterWechsel: phase === "vorher" ? new Date(t.startsAt.getTime() - TERMIN_VORLAUF_MS) : phase === "jetzt" ? terminEnde(t) : null,
    ruhig,
  };
}
