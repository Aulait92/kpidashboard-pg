// Wiedervorlagen: Fälligkeits-Datum + Notiz am Lead. Automatik:
// - „Angebot gesendet" ohne Wiedervorlage → in 3 Werktagen „Angebot nachfassen"
// - Abschluss / Kein Interesse / Disqualifiziert → Wiedervorlage entfällt

import { prisma } from "@/lib/prisma";

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
  if (DONE_STATUSES.has(s)) {
    await prisma.lead.updateMany({
      where: { id: leadId, followUpAt: { not: null } },
      data: { followUpAt: null, followUpNote: null },
    });
  } else if (s === "angebot gesendet") {
    await prisma.lead.updateMany({
      where: { id: leadId, followUpAt: null },
      data: { followUpAt: workdaysFromNow(3), followUpNote: "Angebot nachfassen" },
    });
  }
}
