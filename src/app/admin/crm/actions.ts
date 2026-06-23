"use server";

import { revalidatePath } from "next/cache";
import { updateSalesDeal } from "@/lib/airtable-sales-write";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { findSalesPhaseForStatus } from "@/lib/sales-phases";

async function requireAdmin() {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") {
    throw new Error("Nur Admins.");
  }
  return session;
}

// Pipeline-Drag: setzt den Status eines Deals + schreibt zurück nach
// Airtable (Source-of-Truth) + spiegelt wonAt/lostAt für die KPI-
// Berechnungen + loggt einen status_change-Activity-Eintrag.
//
// Reihenfolge: erst Airtable, dann DB. Schlägt der Airtable-PATCH fehl,
// passieren KEINE DB-Änderungen — Drift zwischen Dashboard und Airtable
// ist die schlimmere Variante als ein nicht-verschobener Lead.
export async function setDealStatusAction(
  dealId: string,
  status: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireAdmin();
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: {
      id: true,
      airtableId: true,
      status: true,
      wonAt: true,
      lostAt: true,
    },
  });
  if (!deal) return { ok: false, error: "Deal nicht gefunden." };

  const phase = findSalesPhaseForStatus(status);
  const isWon = phase?.terminal === "won";
  const isLost = phase?.terminal === "lost";

  // 1) Airtable-PATCH zuerst. Ohne airtableId (= Deal nur lokal angelegt)
  //    überspringen.
  if (deal.airtableId) {
    try {
      await updateSalesDeal({
        airtableId: deal.airtableId,
        status,
      });
    } catch (err) {
      return {
        ok: false,
        error:
          err instanceof Error
            ? `Airtable-Update: ${err.message}`
            : "Airtable-Update fehlgeschlagen.",
      };
    }
  }

  // 2) DB-Spiegel + Activity-Log.
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

// Edit-Form fürs CRM-Detail: erlaubt die Kern-Pflegefelder (Name,
// Firma, Wert, Owner, Close-Datum, Notizen). Schreibt nach Airtable
// UND ins DB-Mirror — wäre der Sync schneller, würde der Wert sonst
// verlorengehen. Wenn Airtable-Write scheitert, kommt der Fehler ins
// UI; der DB-Schreib wird in dem Fall NICHT durchgeführt, damit DB
// und Airtable konsistent bleiben.
export type UpdateDealState = {
  ok?: boolean;
  error?: string;
};

export async function updateDealAction(
  _prev: UpdateDealState,
  formData: FormData,
): Promise<UpdateDealState> {
  await requireAdmin();
  const dealId = String(formData.get("dealId") ?? "");
  if (!dealId) return { error: "Deal fehlt." };

  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: { id: true, airtableId: true },
  });
  if (!deal) return { error: "Deal nicht gefunden." };

  const name = optionalString(formData, "name");
  const company = optionalString(formData, "company");
  const notes = optionalString(formData, "notes");

  const valueRaw = String(formData.get("value") ?? "").trim();
  let value: number | null | undefined = undefined;
  if (formData.has("value")) {
    if (valueRaw === "") {
      value = null;
    } else {
      const n = Number.parseFloat(valueRaw.replace(",", "."));
      if (!Number.isFinite(n) || n < 0) {
        return { error: "Wert muss eine positive Zahl sein." };
      }
      value = n;
    }
  }

  const closeRaw = String(formData.get("closeDate") ?? "").trim();
  let closeDate: string | null | undefined = undefined;
  if (formData.has("closeDate")) {
    if (closeRaw === "") {
      closeDate = null;
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(closeRaw)) {
      closeDate = closeRaw;
    } else {
      return { error: "Close-Datum: ungültiges Format (YYYY-MM-DD)." };
    }
  }

  // 1) Airtable schreiben (Source-of-Truth). Wenn das scheitert, sofort
  //    raus — DB nicht ändern, sonst Drift.
  if (deal.airtableId) {
    try {
      await updateSalesDeal({
        airtableId: deal.airtableId,
        name,
        company,
        notes,
        value,
        closeDate,
      });
    } catch (err) {
      return {
        error:
          err instanceof Error
            ? `Airtable-Update: ${err.message}`
            : "Airtable-Update fehlgeschlagen.",
      };
    }
  }

  // 2) DB-Spiegel aktualisieren.
  await prisma.deal.update({
    where: { id: deal.id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(company !== undefined ? { company } : {}),
      ...(notes !== undefined ? { notes } : {}),
      ...(value !== undefined ? { value } : {}),
      ...(closeDate !== undefined
        ? {
            closeDate: closeDate ? new Date(`${closeDate}T12:00:00Z`) : null,
          }
        : {}),
    },
  });

  revalidatePath(`/admin/crm/${dealId}`);
  revalidatePath("/admin/crm");
  revalidatePath("/admin/kpis");
  return { ok: true };
}

// Liest einen FormData-String; "" wird als "leeren" interpretiert (=null).
// Wenn das Feld komplett fehlt, returnt undefined → "nicht ändern".
function optionalString(formData: FormData, key: string): string | null | undefined {
  if (!formData.has(key)) return undefined;
  const v = String(formData.get(key) ?? "").trim();
  return v === "" ? null : v;
}

export async function deleteDealActivityAction(formData: FormData) {
  await requireAdmin();
  const activityId = String(formData.get("activityId") ?? "");
  const dealId = String(formData.get("dealId") ?? "");
  if (!activityId) return;
  await prisma.dealActivity.delete({ where: { id: activityId } });
  if (dealId) revalidatePath(`/admin/crm/${dealId}`);
}
