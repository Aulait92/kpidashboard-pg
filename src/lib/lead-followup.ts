// Wiedervorlagen: Fälligkeits-Datum + Notiz am Lead. Automatik:
// - „Angebot gesendet" ohne Wiedervorlage → in 3 Werktagen „Angebot nachfassen"
// - Abschluss / Kein Interesse / Disqualifiziert → Wiedervorlage entfällt

import { prisma } from "@/lib/prisma";
import { onLeadStatus } from "@/lib/lead-sequences";
import { isCallPlanNote } from "@/lib/call-plan";
import { NACH_ABSCHLUSS_TODOS } from "@/lib/vertraege-shared";

/** Wiedervorlage nach dem Abschluss (gleicher Text wie lib/lead-history POLICY_TODO). */
export const POLICY_TODO = "Police fertig machen";

const DONE_STATUSES = new Set(["abschluss", "kein interesse", "disqualifiziert"]);
/** Status, mit denen der Lead erreicht ist (Anrufplan endet). */
const FORTSCHRITT = new Set(["im gespräch", "termin vereinbart", "in beratung", "angebot gesendet", "abschluss"]);

/** Aufgaben nach dem Abschluss: unabhängig von Terminen, bleiben immer stehen. */
const istNachAbschlussAufgabe = (note: string | null | undefined) => !!note && (note === POLICY_TODO || NACH_ABSCHLUSS_TODOS.some((t) => note.startsWith(t)));

/**
 * Termin vor Wiedervorlage (Usability-Check 18.11.2026, „Heute“ zeigt niemanden doppelt): Solange ein Termin läuft bzw.
 * auf sein Ergebnis wartet, steht der Kontakt auf „Heute“ nur mit dem Termin (lib/inbox.ts). Wird das Ergebnis
 * eingetragen, ist eine Wiedervorlage, die bis zum Terminbeginn fällig war, durch den Termin erledigt; der nächste
 * Schritt kommt aus dem Ergebnis. Spätere Wiedervorlagen und Aufgaben nach dem Abschluss bleiben. Ist der Termin
 * abgesagt, bleibt die Wiedervorlage ohnehin stehen und erscheint wieder.
 */
export async function wiedervorlageVorTerminErledigen(leadId: string, terminBeginn: Date): Promise<boolean> {
  const l = await prisma.lead.findUnique({ where: { id: leadId }, select: { followUpAt: true, followUpNote: true } });
  if (!l?.followUpAt || l.followUpAt.getTime() > terminBeginn.getTime() || istNachAbschlussAufgabe(l.followUpNote)) return false;
  const r = await prisma.lead.updateMany({ where: { id: leadId, followUpAt: l.followUpAt }, data: { followUpAt: null, followUpNote: null } });
  return r.count > 0;
}

/** Steht der Kontakt wegen eines Termins schon auf „Heute“? Dann keine zweite Zeile für die Wiedervorlage. */
export const wiedervorlageHinterTermin = (note: string | null | undefined) => !istNachAbschlussAufgabe(note);

/** Datum in N Werktagen, 9:00 Uhr (Berlin ≈ 8:00 UTC). */
export function workdaysFromNow(n: number): Date {
  const d = new Date();
  let added = 0;
  while (added < n) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) added++;
  }
  d.setUTCHours(8, 0, 0, 0);
  return d;
}

export async function syncFollowUpWithStatus(leadId: string, status: string | null | undefined, now = new Date()) {
  const s = (status ?? "").trim().toLowerCase();
  // Nachfass-Abfolgen (falls beim Kunden an): Phase prüfen (lib/lead-phase-server.ts phasenWechsel), Angebot → Abfolge
  // starten, Ende → stoppen.
  const seq = await onLeadStatus(leadId, status, now).catch((e) => {
    console.error("[lead-sequences]", e);
    return { started: false };
  });
  // Erreicht (Ole, 27.11.2026): geht der Lead nach vorn, endet der Anrufplan; die Plan-Wiedervorlage „Anrufversuch X von 6“
  // bleibt sonst als veraltete Aufgabe liegen
  if (FORTSCHRITT.has(s)) {
    const l = await prisma.lead.findUnique({ where: { id: leadId }, select: { followUpNote: true } });
    if (isCallPlanNote(l?.followUpNote)) {
      await prisma.lead.updateMany({ where: { id: leadId, followUpNote: l!.followUpNote }, data: { followUpAt: null, followUpNote: null, callbackSnoozedUntil: null } });
    }
  }
  if (s === "abschluss") {
    // Nach dem Abschluss kommt noch die Police (Ole, 13.11.2026): Wiedervorlage für heute,
    // „Erledigt“ hakt sie ab. Ist die Police schon fertig, entfällt die Wiedervorlage.
    const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { policyDoneAt: true } });
    await prisma.lead.update({
      where: { id: leadId },
      data: lead?.policyDoneAt ? { followUpAt: null, followUpNote: null } : { followUpAt: new Date(), followUpNote: POLICY_TODO },
    });
    // Paket M6: Aufgabe „Alten Vertrag kündigen“, wenn der Komplettcheck einen zu ersetzenden Vertrag zeigt (wartet dahinter)
    await import("@/lib/lead-aufgaben")
      .then((m) => m.planeKuendigung(leadId))
      .catch((e) => console.error("[kuendigung]", e));
  } else if (DONE_STATUSES.has(s)) {
    await prisma.lead.updateMany({
      where: { id: leadId, followUpAt: { not: null } },
      data: { followUpAt: null, followUpNote: null },
    });
  } else if (s === "angebot gesendet" && !seq.started) {
    // Ohne Abfolge: klassische Wiedervorlage. Mit Abfolge plant diese das Nachfassen.
    await prisma.lead.updateMany({
      where: { id: leadId, followUpAt: null },
      data: { followUpAt: workdaysFromNow(3), followUpNote: "Angebot nachfassen" },
    });
  }
}
