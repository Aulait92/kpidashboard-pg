// Diagnose (nur lesend, Ole 18.11.2026): Neue Listenpreise 990/1.390/1.790 € (vorher 1.000/1.400/1.800 €).
//   GET /api/ops/diagnose?q=preise-offen
// - umgestellt: offene Angebote, die die Migration 20261118999500_listenpreise_990 auf den neuen Listenpreis gesetzt hat
//   (Änderungsprotokoll "offer.listenpreis_990"), mit heutigem Stand.
// - nochAlt: offene Angebote, die jetzt noch den alten Listenpreis haben (gleiche Regel wie die Migration,
//   listenpreisUmstellung). Sollte nach dem Livegang leer sein; sonst wurde das Angebot nach der Migration mit
//   altem Code angelegt und braucht eine neue Version.
// Nur Nummer, Ansprechpartner, Firma, Status und Beträge; keine Tokens, keine Kontaktdaten.

import { prisma } from "@/lib/prisma";
import { listenpreisUmstellung } from "@/lib/offer-pricing";

const n = (v: unknown) => (v == null ? null : Number(v));

export async function preiseOffenDiagnose() {
  const [offen, logs] = await Promise.all([
    prisma.offer.findMany({
      where: { status: { in: ["draft", "sent"] }, acceptedAt: null },
      orderBy: { number: "asc" },
      select: { id: true, number: true, contactName: true, company: true, status: true, validUntil: true, acceptedAt: true, isTest: true, package: true, products: true, monthlyFee: true, seats: true },
    }),
    prisma.auditLog.findMany({ where: { action: "offer.listenpreis_990" }, orderBy: { at: "asc" }, select: { at: true, entityId: true, details: true } }),
  ]);
  const nochAlt = offen.flatMap((o) => {
    const u = listenpreisUmstellung(o);
    return u ? [{ nummer: o.number, ansprechpartner: o.contactName, firma: o.company, status: o.status, gueltigBis: o.validUntil, alt: u.alt, neu: u.neu }] : [];
  });
  const ids = logs.map((l) => l.entityId).filter((v): v is string => !!v);
  const jetzt = new Map(
    (ids.length
      ? await prisma.offer.findMany({ where: { id: { in: ids } }, select: { id: true, number: true, contactName: true, company: true, status: true, monthlyFee: true } })
      : []
    ).map((o) => [o.id, o]),
  );
  const umgestellt = logs.map((l) => {
    const d = (l.details ?? {}) as { number?: string; alt?: number; neu?: number };
    const o = l.entityId ? jetzt.get(l.entityId) : undefined;
    return {
      nummer: o?.number ?? d.number ?? null,
      ansprechpartner: o?.contactName ?? null,
      firma: o?.company ?? null,
      statusJetzt: o?.status ?? "gelöscht",
      alt: n(d.alt),
      neu: n(d.neu),
      monatlichJetzt: n(o?.monthlyFee),
      am: l.at,
    };
  });
  return { offeneAngebote: offen.length, umgestellt: { anzahl: umgestellt.length, liste: umgestellt }, nochAlt: { anzahl: nochAlt.length, liste: nochAlt } };
}
