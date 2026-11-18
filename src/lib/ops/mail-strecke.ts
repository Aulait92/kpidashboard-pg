// Diagnose der Mail-Strecke für Leads ohne WhatsApp (Ole, 18.11.2026, E0): GET /api/ops/diagnose?q=mail-strecke[&tage=7].
// Nur lesend, ohne Namen, Adressen oder Inhalte: Schalter, Zählung je Schritt und Auslöser, Gründe ohne Erstmail,
// Termine über die Strecke, Takt und SMS, offene Kandidaten der letzten Stunde, letzte Strecken.

import { prisma } from "@/lib/prisma";
import { streckeAn } from "@/lib/mail-strecke/server";
import { smsStreckeAn } from "@/lib/mail-strecke/texte";

export async function mailStreckeDiagnose(params: URLSearchParams) {
  const tage = Math.min(90, Math.max(1, Number(params.get("tage")) || 7));
  const seit = new Date(Date.now() - tage * 86_400_000);
  const where = { createdAt: { gte: seit } };
  const [jeSchritt, jeAusloeser, ohneMail, termine, sms, letzte, offen, stopp] = await Promise.all([
    prisma.leadMailStrecke.groupBy({ by: ["schritt"], where, _count: { _all: true } }),
    prisma.leadMailStrecke.groupBy({ by: ["ausloeser"], where, _count: { _all: true } }),
    prisma.leadMailStrecke.groupBy({ by: ["erstmailGrund"], where: { ...where, erstmailAt: null }, _count: { _all: true } }),
    prisma.appointment.count({ where: { bookedVia: "mail_strecke", createdAt: { gte: seit } } }),
    prisma.leadMailStrecke.aggregate({ where, _sum: { smsZahl: true } }),
    prisma.leadMailStrecke.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, customerId: true, createdAt: true, ausloeser: true, schritt: true, erstmailAt: true, erstmailGrund: true, stufe: true, smsZahl: true, reaktionAt: true, gebuchtAt: true, stopGrund: true },
    }),
    // Neue Leads der letzten Stunde ohne Nummer bzw. ohne Einwilligung und ohne Strecke (sollten binnen Minuten starten)
    prisma.lead.count({
      where: { createdAt: { gte: new Date(Date.now() - 3600_000), lte: new Date(Date.now() - 5 * 60_000) }, erasedAt: null, email: { not: null }, mailStrecke: { is: null }, OR: [{ phone: null }, { waConsent: "nein" }] },
    }),
    prisma.leadMailStrecke.groupBy({ by: ["stopGrund"], where: { ...where, stopGrund: { not: null } }, _count: { _all: true } }),
  ]);
  const zaehl = <T extends { _count: { _all: number } }>(rows: T[], key: keyof T) => Object.fromEntries(rows.map((r) => [String(r[key] ?? "ohne"), r._count._all]));
  return {
    schalter: streckeAn() ? "an" : "aus",
    sms: smsStreckeAn() ? "an" : "aus",
    sevenSchluessel: process.env.SEVEN_API_KEY ? "gesetzt" : "fehlt",
    tage,
    jeSchritt: zaehl(jeSchritt, "schritt"),
    jeAusloeser: zaehl(jeAusloeser, "ausloeser"),
    ohneErstmailGrund: zaehl(ohneMail, "erstmailGrund"),
    stoppGruende: zaehl(stopp, "stopGrund"),
    termineUeberStrecke: termine,
    smsGesendet: sms._sum.smsZahl ?? 0,
    kandidatenOhneStartAelterAls5Min: offen,
    letzte,
  };
}
