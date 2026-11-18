// „Nächster Schritt“ oben in der Chat-Seitenleiste (Ole, 17.11.2026): eine Aufgabe, ein Hauptknopf.
// Keine eigene Regel: der Zustand kommt aus lib/lead-next-step.ts (nextStepState), Termine, Wiedervorlage und
// „Wartet auf Sie“ wie im Kontakt und auf „Heute“. Hier wird nur entschieden, WAS oben steht. Rein, getestet.

import type { NextStepState } from "@/lib/lead-next-step";
import { terminKurz } from "@/lib/chat-ansicht";

export type ChatSchrittArt =
  | "lead_uebernehmen"
  | "ergebnis"
  | "antworten"
  | "anrufen"
  | "videocall"
  | "termin_vorbereiten"
  | "praesentation"
  | "nachfassen_senden"
  | "festlegen"
  | "termin_buchen"
  | "kontakt"
  | "keiner";

export type ChatSchritt = { art: ChatSchrittArt; titel: string; text: string | null; knopf: string | null; href?: string; /** Lead wartet: rot hervorheben */ dringend?: boolean };

export type ChatSchrittFakten = {
  leadId: string | null;
  status: string | null;
  stepState: NextStepState;
  botActive: boolean;
  wartet: { grund: string | null } | null;
  fensterOffen: boolean;
  optOut: boolean;
  /** Nächster gebuchter Termin (künftig oder gerade laufend) */
  termin: { id: string; startsAt: Date; endsAt: Date | null; mode: string; meetUrl: string | null; preparedAt: Date | null; komplettcheck: boolean | null } | null;
  /** Termin vorbei, Ergebnis fehlt */
  ergebnisTerminId: string | null;
  wiedervorlage: { at: Date; note: string | null } | null;
  /** Nachfass-Vorlage ist freigegeben und passt (Fenster zu) */
  nachfassenBereit: boolean;
  now: number;
};

const MIN = 60_000;
const VERLOREN = new Set(["kein interesse", "disqualifiziert"]);

export function chatNaechsterSchritt(f: ChatSchrittFakten): ChatSchritt {
  const status = (f.status ?? "").trim();
  const s = status.toLowerCase();
  if (!f.leadId) {
    return { art: "lead_uebernehmen", titel: "Neuer Kontakt", text: "Der Assistent antwortet erst, wenn Sie ihn als Lead übernehmen.", knopf: "Als Lead übernehmen" };
  }
  if (f.stepState === "result_missing" && f.ergebnisTerminId) {
    return { art: "ergebnis", titel: "Wie lief der Termin?", text: "Der Termin ist vorbei, das Ergebnis fehlt noch.", knopf: "Ergebnis eintragen" };
  }
  if (f.wartet) {
    const schreiben = f.fensterOffen && !f.optOut;
    return { art: schreiben ? "antworten" : "anrufen", dringend: true, titel: "Wartet auf Sie", text: f.wartet.grund ?? "Bitte melden Sie sich beim Kontakt.", knopf: schreiben ? "Antworten" : "Anrufen" };
  }
  if (f.termin) {
    const t = f.termin;
    const start = t.startsAt.getTime();
    const ende = t.endsAt?.getTime() ?? start + 60 * MIN;
    const komplett = t.komplettcheck ? " · Komplettcheck gewünscht" : "";
    if (f.now >= start - 15 * MIN && f.now <= ende) {
      return t.mode === "video" && t.meetUrl
        ? { art: "videocall", titel: f.now < start ? "Termin gleich" : "Termin läuft", text: `${terminKurz(t.startsAt, f.now)} · Videocall`, knopf: "Videocall starten", href: t.meetUrl }
        : { art: "anrufen", titel: f.now < start ? "Termin gleich" : "Termin läuft", text: `${terminKurz(t.startsAt, f.now)} · Telefonat, Sie rufen an`, knopf: "Anrufen" };
    }
    if (!t.preparedAt) {
      return { art: "termin_vorbereiten", titel: "Termin vorbereiten", text: `${terminKurz(t.startsAt, f.now)}${komplett}`, knopf: "Vorbereitung öffnen", href: `/buyer/termine/${t.id}/vorbereitung?von=kontakt` };
    }
    return { art: "praesentation", titel: "Termin ist vorbereitet", text: `${terminKurz(t.startsAt, f.now)}${komplett}`, knopf: "Präsentation öffnen", href: `/buyer/termine/${t.id}/praesentation` };
  }
  if (s === "abschluss") {
    return { art: "kontakt", titel: "Abschluss", text: "Verträge und Police finden Sie im Kontakt.", knopf: "Kontakt öffnen", href: `/buyer/leads/${f.leadId}` };
  }
  if (VERLOREN.has(s) || s.startsWith("storno")) {
    return { art: "keiner", titel: "Kein offener Schritt", text: status, knopf: null };
  }
  const angebot = /angebot (gesendet|verschickt|raus)/.test(s);
  if (f.wiedervorlage || angebot) {
    const titel = angebot ? "Angebot nachfassen" : "Nachfassen";
    const wann = f.wiedervorlage ? terminKurz(f.wiedervorlage.at, f.now) : null;
    const notiz = f.wiedervorlage?.note && f.wiedervorlage.note.toLowerCase() !== titel.toLowerCase() ? f.wiedervorlage.note : null;
    const text = [wann, notiz].filter(Boolean).join(" · ") || "Offene Fragen klären, Entscheidung festhalten.";
    return !f.fensterOffen && f.nachfassenBereit && !f.optOut
      ? { art: "nachfassen_senden", titel, text, knopf: "Nachfassen senden" }
      : { art: "anrufen", titel, text, knopf: "Anrufen" };
  }
  if (f.stepState === "missing") {
    return { art: "festlegen", titel: "Wie geht es weiter?", text: "Legen Sie den nächsten Schritt fest.", knopf: "Nächsten Schritt festlegen" };
  }
  if (f.botActive) {
    return { art: "termin_buchen", titel: "Assistent führt das Gespräch", text: "Ziel ist ein Termin. Sie müssen gerade nichts tun.", knopf: "Termin selbst buchen" };
  }
  return { art: "termin_buchen", titel: "Termin vereinbaren", text: "Buchen Sie einen Termin mit dem Kontakt.", knopf: "Termin buchen" };
}

/** Schritte, die am Handy keine eigene Leiste mehr bekommen: „Vorbereiten“ steht dort in der Kopfzeile (Ole, 18.11.2026). */
export const KOPF_STATT_LEISTE: ReadonlySet<ChatSchrittArt> = new Set(["termin_vorbereiten", "praesentation"]);

/**
 * Handy-Kopfzeile des Chats (Ole, 18.11.2026): Termin-Teil der zweiten Zeile („Termin heute 11:00“, „Termin morgen 10:00“,
 * „Termin Do., 20.11. 10:00“) und der kleine Knopf „Vorbereiten“, nur wenn der Termin in den nächsten 24 Stunden liegt
 * oder gerade läuft.
 */
export function chatKopfTermin(t: { id: string; startsAt: Date; endsAt: Date | null } | null, now: number): { text: string; vorbereiten: string | null } | null {
  if (!t) return null;
  const start = t.startsAt.getTime();
  const ende = t.endsAt?.getTime() ?? start + 60 * MIN;
  if (ende <= now) return null;
  const wann = terminKurz(t.startsAt, now).replace(/^(Heute|Morgen) /, (m) => m.toLowerCase());
  const bald = start - now <= 24 * 60 * MIN;
  return { text: `Termin ${wann}`, vorbereiten: bald ? `/buyer/termine/${t.id}/vorbereitung?von=kontakt` : null };
}
