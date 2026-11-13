// Wiedervorlagen: Fälligkeits-Datum + Notiz am Lead. Automatik:
// - „Angebot gesendet" ohne Wiedervorlage → in 3 Werktagen „Angebot nachfassen"
// - Abschluss / Kein Interesse / Disqualifiziert → Wiedervorlage entfällt

import { prisma } from "@/lib/prisma";
import { onLeadStatus } from "@/lib/lead-sequences";

/** Wiedervorlage nach dem Abschluss (gleicher Text wie lib/lead-history POLICY_TODO). */
export const POLICY_TODO = "Police fertig machen";

const DONE_STATUSES = new Set(["abschluss", "kein interesse", "disqualifiziert"]);

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

export async function syncFollowUpWithStatus(leadId: string, status: string | null | undefined) {
  const s = (status ?? "").trim().toLowerCase();
  // Nachfass-Abfolgen (falls beim Kunden an): Angebot → Abfolge starten, Ende → stoppen.
  const seq = await onLeadStatus(leadId, status).catch((e) => {
    console.error("[lead-sequences]", e);
    return { started: false };
  });
  if (s === "abschluss") {
    // Nach dem Abschluss kommt noch die Police (Ole, 13.11.2026): Wiedervorlage für heute,
    // „Erledigt“ hakt sie ab. Ist die Police schon fertig, entfällt die Wiedervorlage.
    const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { policyDoneAt: true } });
    await prisma.lead.update({
      where: { id: leadId },
      data: lead?.policyDoneAt ? { followUpAt: null, followUpNote: null } : { followUpAt: new Date(), followUpNote: POLICY_TODO },
    });
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
