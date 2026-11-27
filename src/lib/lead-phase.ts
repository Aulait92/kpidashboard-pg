// Phase eines Kontakts für das automatische Nachfassen (Ole, 27.11.2026, Live-Test: Kontakt mit „Angebot gesendet“
// bekam weiter „Chat ruht, ich melde mich ein letztes Mal: Ist das Thema noch aktuell?“, dazu Anrufversuch 1 bis 6:
// „Das Follow-up muss smart sein, den Verlauf lesen und den Status kennen.“).
//
// Jede Abfolge (lib/lead-sequences.ts) und der Anrufplan („Anrufversuch X von 6“, lib/call-plan.ts) gehört zu Phasen, in
// denen sie Sinn ergibt. Geprüft wird zentral (lib/lead-phase-server.ts passtNochZurPhase): beim Planen, beim Statuswechsel
// (alte Strecke stoppen, neue starten) und direkt vor jedem Versand bzw. jeder Anruf-Aufgabe (runSequences über
// stopReasonFor). Rein, ohne Datenbank.
//
//   offen        kein Termin, kein Angebot     Nicht erreicht, Chat ruht („Ist das Thema noch aktuell?“), Anrufplan
//   termin       Termin steht an               nichts (Erinnerungen zum Termin laufen am Termin)
//   nach_termin  Termin war, noch kein Angebot  Rückfragen des Assistenten, neuer Termin nach Absage bzw. No-Show
//   angebot      Angebot gesendet              Nachfassen zum Angebot (offer*), Bedenkzeit
//   abschluss    Abschluss                     nur die Erinnerung „Unterlagen fehlen“
//   verloren     Kein Interesse, Disqualifiziert, Storno: nichts

import type { SequenceKind } from "@/lib/lead-sequences";

export type LeadPhase = "offen" | "termin" | "nach_termin" | "angebot" | "abschluss" | "verloren";

/** Abfolgen zum Angebot (Nachfassen, Vorab-Check, Thema aus dem Termin). offer_status: nur der Status wurde gesetzt. */
export const ANGEBOT_KINDS: SequenceKind[] = ["offer", "offer_selbst", "offer_bedenkzeit", "offer_selbst_bedenkzeit", "offer_status"];

/** Der Anrufplan („Anrufversuch X von 6“) samt Auslöser nach dem Erstanschreiben. */
export const ANRUFPLAN = "anrufplan";
export type PhasenArt = SequenceKind | typeof ANRUFPLAN;

const TERMIN_FOLGE: PhasenArt[] = ["recall", "no_show", "absage", "absage_b", "unterlagen"];

const ERLAUBT: Record<LeadPhase, ReadonlySet<PhasenArt>> = {
  offen: new Set<PhasenArt>(["not_reached", "silent", "recall", "no_show", "absage", "absage_b", "nicht_erreicht_mail", "unterlagen", ANRUFPLAN]),
  termin: new Set<PhasenArt>(["unterlagen"]),
  nach_termin: new Set<PhasenArt>(TERMIN_FOLGE),
  angebot: new Set<PhasenArt>([...ANGEBOT_KINDS, ...TERMIN_FOLGE]),
  abschluss: new Set<PhasenArt>(["unterlagen"]),
  verloren: new Set<PhasenArt>(),
};

/** Darf diese Abfolge bzw. der Anrufplan in der Phase laufen? */
export function passtZurPhase(art: string, phase: LeadPhase): boolean {
  return ERLAUBT[phase].has(art as PhasenArt);
}

const VERLOREN = new Set(["kein interesse", "disqualifiziert"]);

export type PhasenStand = {
  status: string | null | undefined;
  /** Reklamation bzw. Storno am Lead */
  storno?: boolean;
  /** Gebuchter Termin in der Zukunft */
  kommenderTermin: boolean;
  /** Termin in der Vergangenheit, nicht abgesagt und nicht „nicht erschienen“ */
  terminWar: boolean;
  /** Angebot liegt beim Lead: Status „Angebot gesendet“, laufendes Nachfassen zum Angebot oder kürzlich gesendet */
  angebot: boolean;
};

/** Phase aus Status, Terminen und Angebot. Reihenfolge: Ende, anstehender Termin, Angebot, Termin war, offen. */
export function leadPhase(s: PhasenStand): LeadPhase {
  const st = (s.status ?? "").trim().toLowerCase();
  if (st === "abschluss") return "abschluss";
  if (VERLOREN.has(st) || st.startsWith("storno") || s.storno) return "verloren";
  if (s.kommenderTermin) return "termin";
  if (st === "angebot gesendet" || s.angebot) return "angebot";
  if (s.terminWar) return "nach_termin";
  return "offen";
}

/** Kurz für Verlauf und Stopp-Grund (Vermittler-Oberfläche, ohne Personendaten). */
export const PHASE_LABEL: Record<LeadPhase, string> = {
  offen: "noch kein Termin",
  termin: "Termin vereinbart",
  nach_termin: "Termin war",
  angebot: "Angebot gesendet",
  abschluss: "Abschluss",
  verloren: "Verloren",
};

/** Anfang jedes Stopp-Grunds aus der Phasenprüfung (runSequences stoppt dann nur diese Abfolge). */
export const PHASE_GRUND_PREFIX = "Passt nicht mehr zum Stand";
export const phasenGrund = (phase: LeadPhase) => `${PHASE_GRUND_PREFIX}: ${PHASE_LABEL[phase]}`;
export const istPhasenGrund = (grund: string | null | undefined) => !!grund && grund.startsWith(PHASE_GRUND_PREFIX);
