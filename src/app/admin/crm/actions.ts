"use server";

import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { findSalesPhaseForStatus } from "@/lib/sales";

async function requireAdmin() {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") {
    throw new Error("Nur Admins.");
  }
  return session;
}

// Pipeline-Drag: setzt den Status eines Deals + spiegelt wonAt/lostAt für
// die KPI-Berechnungen + loggt einen status_change-Activity-Eintrag.
//
// Hinweis: schreibt vorerst NICHT zurück nach Airtable — der Sales-
// Workflow läuft umgekehrt (Airtable ist Source-of-Truth, wir spiegeln).
// Wenn der Sync läuft, wird der Status vom nächsten Lauf konsolidiert
// (Konflikt-Auflösung: Airtable gewinnt). Für Schreib-Back müssten wir
// den Sales-Base-PAT um write-Scope erweitern und einen Sales-Airtable-
// Write-Helper bauen — kann im nächsten Schritt folgen.
export async function setDealStatusAction(
  dealId: string,
  status: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireAdmin();
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: { id: true, status: true, wonAt: true, lostAt: true },
  });
  if (!deal) return { ok: false, error: "Deal nicht gefunden." };

  const phase = findSalesPhaseForStatus(status);
  const isWon = phase?.terminal === "won";
  const isLost = phase?.terminal === "lost";

  await prisma.$transaction([
    prisma.deal.update({
      where: { id: deal.id },
      data: {
        status,
        ...(isWon && !deal.wonAt ? { wonAt: new Date() } : {}),
        ...(isLost && !deal.lostAt ? { lostAt: new Date() } : {}),
      },
    }),
    ...(deal.status !== status
      ? [
          prisma.dealActivity.create({
            data: {
              dealId: deal.id,
              kind: "status_change",
              title: `Status: ${deal.status ?? "—"} → ${status}`,
              metadata: { fromStatus: deal.status, toStatus: status },
              createdById: session.userId,
            },
          }),
        ]
      : []),
  ]);

  revalidatePath("/admin/crm");
  revalidatePath(`/admin/crm/${dealId}`);
  revalidatePath("/admin/kpis");
  return { ok: true };
}

export type CreateActivityState = {
  ok?: boolean;
  error?: string;
};

const ACTIVITY_KINDS = ["note", "call", "email", "meeting"] as const;
type ActivityKind = (typeof ACTIVITY_KINDS)[number];

function isValidActivityKind(v: string): v is ActivityKind {
  return (ACTIVITY_KINDS as readonly string[]).includes(v);
}

export async function createDealActivityAction(
  _prev: CreateActivityState,
  formData: FormData,
): Promise<CreateActivityState> {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") {
    return { error: "Nur Admins." };
  }
  const dealId = String(formData.get("dealId") ?? "");
  const kindRaw = String(formData.get("kind") ?? "note").trim();
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();

  if (!dealId) return { error: "Deal fehlt." };
  if (!isValidActivityKind(kindRaw))
    return { error: `Ungültiger Aktivitätstyp: ${kindRaw}` };
  if (title.length < 2)
    return { error: "Titel zu kurz (min. 2 Zeichen)." };

  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: { id: true },
  });
  if (!deal) return { error: "Deal nicht gefunden." };

  await prisma.dealActivity.create({
    data: {
      dealId: deal.id,
      kind: kindRaw,
      title,
      body: body || null,
      createdById: session.userId,
    },
  });

  revalidatePath(`/admin/crm/${dealId}`);
  return { ok: true };
}

export async function deleteDealActivityAction(formData: FormData) {
  await requireAdmin();
  const activityId = String(formData.get("activityId") ?? "");
  const dealId = String(formData.get("dealId") ?? "");
  if (!activityId) return;
  await prisma.dealActivity.delete({ where: { id: activityId } });
  if (dealId) revalidatePath(`/admin/crm/${dealId}`);
}
