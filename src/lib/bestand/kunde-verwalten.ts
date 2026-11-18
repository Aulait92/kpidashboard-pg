// Einzelne Bestandskunden löschen und sperren (Ole, 18.11.2026, nach Modultest):
// - Löschen (DSGVO-Löschanfrage): Datensatz mit Verträgen, Kampagnen-Empfängern, Mails und Empfehlungslink weg.
//   E-Mail und Telefon kommen vorher als Hash auf die Sperrliste (BestandOptOut, alle Kanäle), damit ein erneuter
//   Import den Kontakt nicht wieder anschreibt. Das Einwilligungsprotokoll bleibt als Nachweis (ohne Verknüpfung).
// - Sperren („nicht mehr anschreiben“): bleibt gespeichert, bekommt keine Kampagnen und keine Glückwünsche mehr
//   (lib/bestand/einwilligung.ts → BLOCKED_REASON), wartende Nachrichten werden übersprungen. Entsperren erlaubt
//   künftige Kampagnen wieder.

import { prisma } from "@/lib/prisma";
import { optOutHash } from "@/lib/bestand/links";
import { BLOCKED_REASON } from "@/lib/bestand/einwilligung";
import { audit, type AuditActor } from "@/lib/audit";

export type ManageResult = { ok: true } | { ok: false; error: string };

/** Bestandskunden endgültig löschen und seine Adressen dauerhaft sperren (Sperrliste mit Hashwerten). */
export async function deleteExistingCustomer(customerId: string, existingCustomerId: string, actor?: AuditActor): Promise<ManageResult> {
  const ec = await prisma.existingCustomer.findFirst({ where: { id: existingCustomerId, customerId }, select: { id: true, email: true, phone: true } });
  if (!ec) return { ok: false, error: "Kunde nicht gefunden." };
  const entries: { kind: "email" | "phone"; hash: string }[] = [
    ...(ec.email ? [{ kind: "email" as const, hash: optOutHash("email", ec.email) }] : []),
    ...(ec.phone ? [{ kind: "phone" as const, hash: optOutHash("phone", ec.phone) }] : []),
  ];
  await prisma.$transaction([
    ...entries.map((e) =>
      prisma.bestandOptOut.upsert({
        where: { customerId_kind_hash: { customerId, kind: e.kind, hash: e.hash } },
        create: { customerId, kind: e.kind, hash: e.hash, scope: "all" },
        update: { scope: "all" },
      }),
    ),
    // Verträge, Kampagnen-Empfänger, Mails und Empfehlungslink hängen per Cascade dran; Protokoll bleibt (SetNull)
    prisma.existingCustomer.delete({ where: { id: ec.id } }),
  ]);
  // Protokoll ohne personenbezogene Daten (nur die frühere ID und was gesperrt wurde)
  await audit("bestand.kunde_geloescht", { entity: "ExistingCustomer", entityId: ec.id, customerId, details: { sperrliste: entries.map((e) => e.kind) }, actor });
  return { ok: true };
}

/** Sperren bzw. entsperren. Sperren überspringt sofort alle noch wartenden Kampagnen-Nachrichten. */
export async function setExistingCustomerBlocked(
  customerId: string,
  existingCustomerId: string,
  blocked: boolean,
  actorUserId: string | null,
  opts: { now?: Date; actor?: AuditActor } = {},
): Promise<ManageResult> {
  const now = opts.now ?? new Date();
  const ec = await prisma.existingCustomer.findFirst({ where: { id: existingCustomerId, customerId }, select: { id: true, blockedAt: true } });
  if (!ec) return { ok: false, error: "Kunde nicht gefunden." };
  let skipped = 0;
  if (blocked) {
    const [, r] = await prisma.$transaction([
      prisma.existingCustomer.update({ where: { id: ec.id }, data: { blockedAt: ec.blockedAt ?? now, blockedById: actorUserId } }),
      prisma.campaignRecipient.updateMany({ where: { existingCustomerId: ec.id, status: "queued" }, data: { status: "skipped", reason: BLOCKED_REASON } }),
    ]);
    skipped = r.count;
  } else {
    await prisma.existingCustomer.update({ where: { id: ec.id }, data: { blockedAt: null, blockedById: null } });
  }
  await audit(blocked ? "bestand.kunde_gesperrt" : "bestand.kunde_entsperrt", { entity: "ExistingCustomer", entityId: ec.id, customerId, details: blocked ? { wartendUebersprungen: skipped } : {}, actor: opts.actor });
  return { ok: true };
}
