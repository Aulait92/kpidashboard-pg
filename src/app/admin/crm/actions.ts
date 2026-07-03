"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { deleteSalesDeal, updateSalesDeal } from "@/lib/airtable-sales-write";
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
  opts?: { lostReason?: string | null },
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
      closeDate: true,
    },
  });
  if (!deal) return { ok: false, error: "Deal nicht gefunden." };

  const phase = findSalesPhaseForStatus(status);
  const isWon = phase?.terminal === "won";
  const isLost = phase?.terminal === "lost";

  // Lost-Reason wird nur bei terminal-lost-Phasen geschrieben (sonst hat
  // er keine Bedeutung); leerer String → null = Feld leeren.
  const lostReasonNorm =
    isLost && opts?.lostReason !== undefined
      ? opts.lostReason && opts.lostReason.trim() !== ""
        ? opts.lostReason.trim()
        : null
      : undefined;

  // Abschluss-Datum auto-setzen, wenn der Deal frisch in Serienbetrieb
  // landet UND noch kein Abschluss-Datum gepflegt ist. Kein Auto-Clear
  // beim Zurückziehen — falls jemand das Datum manuell festhält.
  const autoCloseDateIso =
    isWon && !deal.closeDate ? new Date().toISOString().slice(0, 10) : null;

  // 1) Airtable-PATCH zuerst. Ohne airtableId (= Deal nur lokal angelegt)
  //    überspringen.
  if (deal.airtableId) {
    try {
      await updateSalesDeal({
        airtableId: deal.airtableId,
        status,
        ...(autoCloseDateIso ? { closeDate: autoCloseDateIso } : {}),
        ...(lostReasonNorm !== undefined
          ? { lostReason: lostReasonNorm }
          : {}),
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
  // Status ist Source-of-Truth: wonAt/lostAt reflektieren NUR den
  // aktuellen Terminal-Zustand. Bewegt sich ein Deal aus Serienbetrieb
  // wieder zurück (z. B. Testlauf), wird wonAt geleert. Erste Entry-
  // Zeit in den Terminal-Status bleibt erhalten (deal.wonAt ?? now),
  // damit Cycle-Time-Kennzahlen stabil bleiben.
  await prisma.$transaction([
    prisma.deal.update({
      where: { id: deal.id },
      data: {
        status,
        wonAt: isWon ? (deal.wonAt ?? new Date()) : null,
        lostAt: isLost ? (deal.lostAt ?? new Date()) : null,
        ...(autoCloseDateIso
          ? { closeDate: new Date(`${autoCloseDateIso}T12:00:00Z`) }
          : {}),
        ...(lostReasonNorm !== undefined ? { lostReason: lostReasonNorm } : {}),
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

const ACTIVITY_KINDS = [
  "note",
  "call",
  "settercall",
  "videosalescall",
  "whatsapp",
  "email",
  "meeting",
] as const;
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
  const scheduledRaw = String(formData.get("scheduledFor") ?? "").trim();

  if (!dealId) return { error: "Deal fehlt." };
  if (!isValidActivityKind(kindRaw))
    return { error: `Ungültiger Aktivitätstyp: ${kindRaw}` };
  if (title.length < 2)
    return { error: "Titel zu kurz (min. 2 Zeichen)." };

  // scheduledFor: datetime-local-Input liefert "YYYY-MM-DDTHH:mm". Wir
  // parsen als lokale Browser-Zeit (= das was der Admin meint). Leer →
  // null = keine Planung.
  let scheduledFor: Date | null = null;
  if (scheduledRaw !== "") {
    const d = new Date(scheduledRaw);
    if (Number.isNaN(d.getTime())) {
      return { error: "Geplant für: ungültiges Datum/Zeit." };
    }
    scheduledFor = d;
  }

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
      scheduledFor,
      createdById: session.userId,
    },
  });

  revalidatePath("/admin/crm");
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
  const session = await requireAdmin();
  const dealId = String(formData.get("dealId") ?? "");
  if (!dealId) return { error: "Deal fehlt." };

  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: {
      id: true,
      airtableId: true,
      status: true,
      wonAt: true,
      lostAt: true,
      closeDate: true,
    },
  });
  if (!deal) return { error: "Deal nicht gefunden." };

  const name = optionalString(formData, "name");
  const company = optionalString(formData, "company");
  const product = optionalString(formData, "product");
  const notes = optionalString(formData, "notes");
  const testCharge = optionalString(formData, "testCharge");
  // Status mitlesen — leer = "nicht gesetzt"; sonst nur akzeptieren wenn
  // der String einer Phase oder einem ihrer Aliasse entspricht (= externes
  // / unbekanntes "Sonstige"-Status bleibt durchgereicht, wenn der Buyer
  // ihn explizit so geschickt hat).
  const status = optionalString(formData, "status");
  if (
    status !== undefined &&
    status !== null &&
    status !== "" &&
    !findSalesPhaseForStatus(status)
  ) {
    // Status ist nicht in der Pipeline — wir lassen ihn trotzdem durch
    // (z. B. externer Wert), aber loggen warn.
    console.warn(
      `[crm] updateDealAction: Status "${status}" matched keine Pipeline-Phase.`,
    );
  }

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

  // Status-Change-Handling: Terminal-Felder + Activity-Log analog zu
  // setDealStatusAction (Drag im Pipeline-Board). Auto-Set Abschluss-
  // Datum, wenn Status auf Serienbetrieb wechselt UND weder Form-Wert
  // noch DB-Wert vorhanden. Form-Eingabe hat Vorrang.
  const statusChanged = status !== undefined && status !== deal.status;
  const phase = status ? findSalesPhaseForStatus(status) : null;
  const isWon = phase?.terminal === "won";
  const isLost = phase?.terminal === "lost";
  const autoCloseDateIso =
    statusChanged && isWon && closeDate === undefined && !deal.closeDate
      ? new Date().toISOString().slice(0, 10)
      : null;

  // 1) Airtable schreiben (Source-of-Truth). Wenn das scheitert, sofort
  //    raus — DB nicht ändern, sonst Drift.
  if (deal.airtableId) {
    try {
      await updateSalesDeal({
        airtableId: deal.airtableId,
        name,
        company,
        product,
        notes,
        testCharge,
        value,
        closeDate: autoCloseDateIso ?? closeDate,
        ...(status !== undefined ? { status } : {}),
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

  // 2) DB-Spiegel + ggf. Activity-Log in einer Transaktion.
  await prisma.$transaction([
    prisma.deal.update({
      where: { id: deal.id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(company !== undefined ? { company } : {}),
        ...(product !== undefined ? { product } : {}),
        ...(notes !== undefined ? { notes } : {}),
        ...(testCharge !== undefined ? { testCharge } : {}),
        ...(value !== undefined ? { value } : {}),
        ...(autoCloseDateIso
          ? { closeDate: new Date(`${autoCloseDateIso}T12:00:00Z`) }
          : closeDate !== undefined
            ? {
                closeDate: closeDate
                  ? new Date(`${closeDate}T12:00:00Z`)
                  : null,
              }
            : {}),
        ...(status !== undefined
          ? {
              status,
              wonAt: isWon ? (deal.wonAt ?? new Date()) : null,
              lostAt: isLost ? (deal.lostAt ?? new Date()) : null,
            }
          : {}),
      },
    }),
    ...(statusChanged
      ? [
          prisma.dealActivity.create({
            data: {
              dealId: deal.id,
              kind: "status_change",
              title: `Status: ${deal.status ?? "—"} → ${status ?? "—"}`,
              metadata: { fromStatus: deal.status, toStatus: status },
              createdById: session.userId,
            },
          }),
        ]
      : []),
  ]);

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

// Löscht einen Deal aus Airtable + DB. Reihenfolge: erst Airtable
// (Source-of-Truth), dann DB. Wenn Airtable-DELETE fehlschlägt, wird
// die DB nicht angefasst, damit kein "leeres" Loch im Dashboard
// entsteht. Cascading-Delete in Prisma räumt die Activities mit weg.
export async function deleteDealAction(formData: FormData) {
  await requireAdmin();
  const dealId = String(formData.get("dealId") ?? "");
  if (!dealId) return;
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: { id: true, airtableId: true },
  });
  if (!deal) return;

  // Airtable-DELETE versuchen, aber NICHT die DB-Löschung blockieren, wenn es
  // fehlschlägt (z. B. PAT ohne Delete-Scope auf der Sales-Base). Sonst crasht
  // die ganze Action und der Deal bleibt überall stehen — analog zum Deal-
  // Update, das Airtable-Fehler ebenfalls schluckt und die DB trotzdem schreibt.
  let airtableDeleted = true;
  if (deal.airtableId) {
    try {
      await deleteSalesDeal({ airtableId: deal.airtableId });
    } catch (err) {
      airtableDeleted = false;
      console.error("[crm] deleteDealAction Airtable-DELETE:", err);
    }
  }
  await prisma.deal.delete({ where: { id: deal.id } });
  revalidatePath("/admin/crm");
  revalidatePath("/admin/kpis");
  // Konnte der Record in Airtable NICHT gelöscht werden, würde der nächste
  // Sales-Sync ihn wieder anlegen — das melden wir per Query-Param, damit der
  // Admin den PAT-Scope prüfen kann.
  redirect(airtableDeleted ? "/admin/crm" : "/admin/crm?deleteWarning=airtable");
}

export async function deleteDealActivityAction(formData: FormData) {
  await requireAdmin();
  const activityId = String(formData.get("activityId") ?? "");
  const dealId = String(formData.get("dealId") ?? "");
  if (!activityId) return;
  await prisma.dealActivity.delete({ where: { id: activityId } });
  if (dealId) revalidatePath(`/admin/crm/${dealId}`);
}

// „Geschlossen"-Toggle: markiert einen Deal als geschlossen. Er verschwindet aus
// dem aktiven CRM-Kanban, bleibt aber in allen Sales-Statistiken enthalten.
// Reine DB-Kennzeichnung (kein Airtable-Write).
export async function setDealArchivedAction(dealId: string, archived: boolean) {
  await requireAdmin();
  if (!dealId) return;
  await prisma.deal.update({ where: { id: dealId }, data: { archived } });
  revalidatePath("/admin/crm");
  revalidatePath(`/admin/crm/${dealId}`);
  revalidatePath("/admin/kpis");
}

// Ändert den „Geplant für"-Zeitpunkt einer Aktivität (leer = Planung entfernen).
// datetime-local-Input liefert "YYYY-MM-DDTHH:mm" in Browser-Lokalzeit.
export async function updateDealActivityScheduleAction(formData: FormData) {
  await requireAdmin();
  const activityId = String(formData.get("activityId") ?? "");
  const dealId = String(formData.get("dealId") ?? "");
  if (!activityId) return;
  const scheduledRaw = String(formData.get("scheduledFor") ?? "").trim();
  let scheduledFor: Date | null = null;
  if (scheduledRaw !== "") {
    const d = new Date(scheduledRaw);
    if (Number.isNaN(d.getTime())) return; // ungültig → ignorieren
    scheduledFor = d;
  }
  await prisma.dealActivity.update({
    where: { id: activityId },
    data: { scheduledFor },
  });
  revalidatePath("/admin/crm");
  if (dealId) revalidatePath(`/admin/crm/${dealId}`);
}
