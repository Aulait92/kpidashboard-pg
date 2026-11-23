// Nachfassen nach jeder Absage durch den Lead (Ole, 23.11.2026: „Ja, bei jeder Absage nachfassen.“). Sagt ein Lead seinen
// Termin selbst ab (Link „Termin verwalten“, im Chat beim Assistenten, Absage der Kalendereinladung), kommt kurz danach
// genau eine WhatsApp mit dem Angebot eines neuen Termins. Technisch eine Nachfass-Abfolge (lib/lead-sequences.ts, Art
// „absage“ bzw. „absage_b“) mit einem Schritt: steht vorher in „Nächste Nachrichten“ (überspringen, verschieben, jetzt
// senden), läuft nur im Versandfenster (Mo bis Sa 9 bis 19 Uhr) und endet bei Antwort, neuer Buchung, „Stopp“ usw.
// (stopReasonFor). Gestartet in lib/calendar cancelAppointment (nur by „lead“ und nicht beim Verschieben), Prüfung und
// Start in lib/absage-nachfassen-server.ts. Antworten verarbeitet der Assistent wie immer ([Ja, neuer Termin] →
// Zeiten, [Kein Bedarf mehr] → Absage-Grund, lib/whatsapp/knopf.ts).
//
// Splittest absage_nachfassen (lib/experimente.ts, Lernbuch docs/firma/ab-tests.md), Einheit Lead-ID, Ziel termin_gebucht:
//   A (Standard, Ole 23.11.2026): „Schade, dass es mit dem Termin nicht geklappt hat. Sollen wir einen neuen Termin mit
//     Herrn Kannapinn finden?“ [Ja, neuer Termin] [Kein Bedarf mehr]; außerhalb des 24-h-Fensters die freigegebene Vorlage
//     followup_noshow (gleiche Frage und Knöpfe).
//   B: gleich, aber direkt mit zwei konkreten neuen Zeiten (Zeit-Knöpfe); außerhalb des Fensters die freigegebene Vorlage
//     followup (zwei Terminvorschläge). Hypothese: Wer nach einer Absage gleich zwei konkrete Zeiten sieht, muss nichts
//     überlegen und bucht öfter neu als nach der offenen Frage.
//
// Rein, ohne Datenbank (Texte und Ausschlussregeln, getestet in tests/unit/absage-nachfassen.test.ts).

import { a, type Ansprache } from "@/lib/ansprache";
import type { VermittlerName } from "@/lib/vermittler-nennung";

/** Splittest-Schlüssel (lib/experimente.ts). */
export const ABSAGE_EXPERIMENT = "absage_nachfassen";

/** Abstand nach der Absage: wer sofort neu bucht, bekommt nichts. */
export const ABSAGE_VERZOEGERUNG_MIN = 20;
/**
 * Absage im Chat: Der Assistent hat gerade selbst einen neuen Termin angeboten, das Nachfassen kommt erst, wenn der Lead
 * darauf nicht reagiert (wie der erste Schritt von „Chat ruht“).
 */
export const ABSAGE_IM_CHAT_VERZOEGERUNG_MIN = 120;

export const ABSAGE_FALLBACK_NOTE = "Termin abgesagt: neuen Termin vereinbaren";

const SCHADE = "schade, dass es mit dem Termin nicht geklappt hat.";

/** Fassung A: offene Frage nach einem neuen Termin (Knöpfe [Ja, neuer Termin] [Kein Bedarf mehr]). */
export function absageText(o: { an: Ansprache; hi: string; person: VermittlerName }): string {
  // Du und Sie gleich lautend: die Frage hat kein Pronomen, nur die Nennung des Vermittlers folgt der Ansprache
  return a(o.an, `${o.hi} ${SCHADE} Sollen wir einen neuen Termin mit ${o.person.dat} finden?`, `${o.hi} ${SCHADE} Sollen wir einen neuen Termin mit ${o.person.dat} finden?`);
}

/** Fassung B: direkt zwei konkrete neue Zeiten (Zeit-Knöpfe); ohne freie Zeiten wie Fassung A. */
export function absageZeitenText(o: { an: Ansprache; hi: string; person: VermittlerName }, [z1, z2]: [string, string]): string {
  return a(
    o.an,
    `${o.hi} ${SCHADE} Passt dir ${z1} oder ${z2} für einen neuen Termin mit ${o.person.dat}?`,
    `${o.hi} ${SCHADE} Passt Ihnen ${z1} oder ${z2} für einen neuen Termin mit ${o.person.dat}?`,
  );
}

/** Lead-Phasen, nach denen nicht mehr nachgefasst wird (wie lib/lead-sequences.ts). */
const FERTIG = new Set(["abschluss", "kein interesse", "disqualifiziert"]);

export type AbsageLage = {
  /** Termin vom Lead abgesagt (cancelledBy „lead“), nicht verschoben */
  vomLead: boolean;
  verschoben?: boolean;
  lead: { erased: boolean; status: string | null; storniert: boolean; abschlussGemeldet: boolean; ohneAutoNachrichten: boolean; waUnavailable: boolean; waConsentNein: boolean; phone: string | null } | null;
  /** Noch ein anderer gebuchter, künftiger Termin */
  weitererTermin: boolean;
  kunde: { ruhend: boolean; nurPayPerLead: boolean; assistentAktiv: boolean; outreachAn: boolean; nachfassenAn: boolean; whatsappVerbunden: boolean };
  /** „Stopp“ im Chat, Sperrliste bzw. Sperre nach Betroffenenrechten */
  abgemeldet: boolean;
};

/** Grund, warum nach dieser Absage NICHT nachgefasst wird, sonst null (rein). */
export function absageNachfassenAusschluss(l: AbsageLage): string | null {
  if (!l.vomLead) return "nicht vom Lead abgesagt";
  if (l.verschoben) return "verschoben";
  const lead = l.lead;
  if (!lead || lead.erased) return "Lead nicht gefunden";
  if (FERTIG.has((lead.status ?? "").trim().toLowerCase())) return `Phase: ${lead.status}`;
  if (lead.storniert) return "Lead reklamiert";
  if (lead.abschlussGemeldet) return "Lead meldet: schon abgeschlossen";
  if (lead.ohneAutoNachrichten) return "Produkt ohne automatische Nachrichten";
  if (!lead.phone) return "keine Handynummer";
  if (lead.waUnavailable) return "kein WhatsApp";
  if (lead.waConsentNein) return "keine WhatsApp-Einwilligung";
  if (l.weitererTermin) return "weiterer Termin gebucht";
  const k = l.kunde;
  if (k.ruhend) return "Konto ruht";
  if (k.nurPayPerLead) return "Pay-per-Lead";
  if (!k.assistentAktiv || !k.outreachAn) return "Assistent aus";
  if (!k.nachfassenAn) return "Automatisches Nachfassen aus";
  if (!k.whatsappVerbunden) return "WhatsApp nicht verbunden";
  if (l.abgemeldet) return "abgemeldet";
  return null;
}
