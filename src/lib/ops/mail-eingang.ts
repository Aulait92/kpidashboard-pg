// Diagnose „Antwortadresse mit Eingang“ (Paket M2, lib/mail/eingang.ts): GET /api/ops/diagnose?q=mail-eingang[&tage=7].
// Nur lesend, ohne Inhalte, Adressen, Namen oder Kunden: Schalter, Einrichtung, Zählung je Ergebnis und Zuordnung,
// letzte Eingänge (Zeit, Zuordnung, Ergebnis, Kurzgrund, Anzahl Anhänge) und die letzten Fehler.

import { prisma } from "@/lib/prisma";
import { ANTWORT_DOMAIN, antwortEingangAn } from "@/lib/mail/antwort-adresse";
import { leadMailAdresse } from "@/lib/mail/lead-absender";

export async function mailEingangDiagnose(params: URLSearchParams) {
  const tage = Math.min(90, Math.max(1, Number(params.get("tage")) || 7));
  const seit = new Date(Date.now() - tage * 86_400_000);
  const [jeErgebnis, jeZuordnung, letzte, fehler, codes] = await Promise.all([
    prisma.mailEingang.groupBy({ by: ["ergebnis"], where: { createdAt: { gte: seit } }, _count: { _all: true } }),
    prisma.mailEingang.groupBy({ by: ["zuordnung"], where: { createdAt: { gte: seit } }, _count: { _all: true } }),
    prisma.mailEingang.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { createdAt: true, zuordnung: true, ergebnis: true, grund: true, anhaenge: true, weitergeleitetAt: true, pushAt: true, versuche: true },
    }),
    prisma.mailEingang.findMany({ where: { ergebnis: "fehler" }, orderBy: { updatedAt: "desc" }, take: 10, select: { updatedAt: true, grund: true, versuche: true } }),
    prisma.lead.count({ where: { antwortCode: { not: null } } }),
  ]);
  return {
    schalter: antwortEingangAn() ? "an" : "aus",
    domain: ANTWORT_DOMAIN,
    absender: leadMailAdresse() ? "gesetzt" : "fehlt",
    webhookSignatur: process.env.RESEND_WEBHOOK_SECRET ? "gesetzt" : "fehlt",
    resendSchluessel: process.env.RESEND_API_KEY ? "gesetzt" : "fehlt",
    leadsMitAntwortadresse: codes,
    tage,
    jeErgebnis: Object.fromEntries(jeErgebnis.map((r) => [r.ergebnis, r._count._all])),
    jeZuordnung: Object.fromEntries(jeZuordnung.map((r) => [r.zuordnung, r._count._all])),
    letzte: letzte.map((r) => ({
      at: r.createdAt.toISOString(),
      zuordnung: r.zuordnung,
      ergebnis: r.ergebnis,
      grund: r.grund,
      anhaenge: Array.isArray(r.anhaenge) ? r.anhaenge.length : 0,
      weitergeleitet: !!r.weitergeleitetAt,
      push: !!r.pushAt,
      versuche: r.versuche,
    })),
    fehler: fehler.map((r) => ({ at: r.updatedAt.toISOString(), grund: r.grund, versuche: r.versuche })),
  };
}
