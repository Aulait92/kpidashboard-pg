"use server";

import { revalidatePath } from "next/cache";
import {
  fetchAllStornogruende,
  fetchBezugStornogruendeMap,
  markLeadAsCancelled,
  updateLeadEditableFields,
} from "@/lib/airtable-write";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  CLOSED_STATUS,
  isReachedStatus,
  isValidLeadStatus,
  type LeadStatus,
} from "@/lib/products";

export type CancelLeadState = {
  ok?: boolean;
  error?: string;
  leadId?: string;
};

// Storno aus dem Buyer-Dashboard. Schreibt:
//   - Bearbeitungsstatus = "Storno"
//   - Stornogrund        = Linked-Record auf die Stornogründe-Tabelle
//                          (vom Buyer aus den für seinen Bezug erlaubten
//                          Gründen ausgewählt)
//   - Storno-Bemerkung   = Freitext-Begründung
// Spiegelt das Ergebnis lokal in der DB, damit das UI sofort den neuen
// Status zeigt und nicht erst beim nächsten Sync nachzieht.
export async function cancelLeadAction(
  _prev: CancelLeadState,
  formData: FormData,
): Promise<CancelLeadState> {
  const session = await getCurrentSession();
  if (!session || session.role !== "BUYER" || !session.customerId) {
    return { error: "Nicht eingeloggt." };
  }

  const leadId = String(formData.get("leadId") ?? "");
  const stornogrundRecordId = String(formData.get("stornogrundId") ?? "").trim();
  const bemerkung = String(formData.get("bemerkung") ?? "").trim();
  if (!leadId) return { error: "Lead fehlt.", leadId };
  if (!stornogrundRecordId) {
    return { error: "Bitte einen Stornogrund auswählen.", leadId };
  }

  // Zugriffsschutz: Buyer darf nur eigene Leads stornieren.
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, customerId: session.customerId },
    select: {
      id: true,
      airtableId: true,
      bezugAirtableId: true,
      status: true,
    },
  });
  if (!lead) {
    return { error: "Lead nicht gefunden.", leadId };
  }
  if (!lead.airtableId) {
    return {
      error: "Lead ohne Airtable-Referenz — bitte den Admin informieren.",
      leadId,
    };
  }
  if (lead.status && lead.status.toLowerCase().startsWith("storno")) {
    // Idempotent: schon storniert → erfolgreich quittieren.
    return { ok: true, leadId };
  }

  // Validieren: der ausgewählte Grund muss in den für den Bezug
  // zugelassenen Stornogründen enthalten sein. Verhindert, dass ein
  // manipuliertes Formular einen fremden Grund einreicht.
  if (lead.bezugAirtableId) {
    const allowedMap = await fetchBezugStornogruendeMap();
    const allowed = allowedMap.get(lead.bezugAirtableId) ?? [];
    if (allowed.length > 0 && !allowed.includes(stornogrundRecordId)) {
      return {
        error: "Dieser Stornogrund ist für diesen Bezug nicht zugelassen.",
        leadId,
      };
    }
  }

  try {
    await markLeadAsCancelled({
      airtableId: lead.airtableId,
      stornogrundRecordId,
      bemerkung,
    });
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Storno fehlgeschlagen.",
      leadId,
    };
  }

  // Lokal sofort spiegeln, damit das Dashboard die Änderung anzeigt.
  await prisma.$transaction([
    prisma.lead.update({
      where: { id: lead.id },
      data: { status: "Storno", reached: false, closedAt: null },
    }),
    prisma.revenue.updateMany({
      where: { leadId: lead.id, cancelled: false },
      data: { cancelled: true },
    }),
  ]);

  revalidatePath("/buyer");
  return { ok: true, leadId };
}

export type UpdateLeadState = {
  ok?: boolean;
  error?: string;
};

// Focused-Action für den Pipeline-Drag: setzt den Bearbeitungsstatus und
// (optional, beim Drop auf "Abschluss") den Abschlusswert in EUR. Wird vom
// Pipeline-Board direkt programmatisch aufgerufen (kein <form>), darum
// ohne useActionState-Signatur. Storno ist explizit nicht erlaubt — dafür
// gibt es den StornoDialog.
//
// Spiegelt zusätzlich die abgeleiteten DB-Felder, damit die KPI-Kacheln
// auf /buyer (Erreichbarkeit / Termin / Abschluss) sofort stimmen und
// nicht erst beim nächsten Airtable-Sync nachziehen:
//   - reached    aus dem REACHED-Set
//   - closedAt   gesetzt wenn status = "Abschluss", sonst null
//   - closeValue nur wenn opts.closeValue gesetzt (sonst unverändert)
export async function setLeadStatusAction(
  leadId: string,
  status: LeadStatus,
  opts?: { closeValue?: number | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getCurrentSession();
  if (!session || session.role !== "BUYER" || !session.customerId) {
    return { ok: false, error: "Nicht eingeloggt." };
  }
  if (!isValidLeadStatus(status)) {
    return { ok: false, error: `Ungültiger Status: ${status}` };
  }

  const lead = await prisma.lead.findFirst({
    where: { id: leadId, customerId: session.customerId },
    select: { id: true, airtableId: true },
  });
  if (!lead) return { ok: false, error: "Lead nicht gefunden." };
  if (!lead.airtableId) return { ok: false, error: "Lead ohne Airtable-ID." };

  const closeValue = opts?.closeValue;
  try {
    await updateLeadEditableFields({
      airtableId: lead.airtableId,
      bearbeitungsstatus: status,
      ...(closeValue !== undefined ? { closeValue } : {}),
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Status-Update fehlgeschlagen.",
    };
  }

  const isClosed = status === CLOSED_STATUS;
  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      status,
      reached: isReachedStatus(status),
      closedAt: isClosed ? new Date() : null,
      ...(closeValue !== undefined
        ? { closeValue: closeValue == null ? null : closeValue }
        : {}),
    },
  });

  revalidatePath("/buyer");
  revalidatePath("/buyer/kanban");
  revalidatePath("/buyer/leads");
  revalidatePath(`/buyer/leads/${lead.id}`);
  return { ok: true };
}

// Speichert die in der Lead-Detail-Ansicht editierbaren Felder zurück
// nach Airtable + spiegelt die DB-Spiegel-Felder (Kontaktversuche,
// firstContactAt). Notizen lebt ausschließlich in Airtable. Storno-
// Bemerkung und Stornogrund werden NICHT hier gepflegt — dafür gibt es
// den dedizierten StornoDialog.
export async function updateLeadDetailsAction(
  _prev: UpdateLeadState,
  formData: FormData,
): Promise<UpdateLeadState> {
  const session = await getCurrentSession();
  if (!session || session.role !== "BUYER" || !session.customerId) {
    return { error: "Nicht eingeloggt." };
  }

  const leadId = String(formData.get("leadId") ?? "");
  if (!leadId) return { error: "Lead fehlt." };

  const lead = await prisma.lead.findFirst({
    where: { id: leadId, customerId: session.customerId },
    select: { id: true, airtableId: true },
  });
  if (!lead) return { error: "Lead nicht gefunden." };
  if (!lead.airtableId) {
    return { error: "Lead ohne Airtable-Referenz." };
  }

  // Inputs parsen — leere Strings bedeuten "leer setzen".
  const kvRaw = String(formData.get("kontaktversuche") ?? "").trim();
  const kontaktversuche = kvRaw === "" ? 0 : Math.max(0, Math.round(Number(kvRaw)));
  if (!Number.isFinite(kontaktversuche)) {
    return { error: "Kontaktversuche muss eine Zahl sein." };
  }

  const ersterRaw = String(formData.get("ersterKontaktversuch") ?? "").trim();
  const ersterKontaktversuch = ersterRaw === "" ? null : ersterRaw;
  if (ersterKontaktversuch && !/^\d{4}-\d{2}-\d{2}$/.test(ersterKontaktversuch)) {
    return { error: "Erster Kontaktversuch: ungültiges Datum." };
  }

  const notizen = String(formData.get("notizen") ?? "");

  const statusRaw = String(formData.get("bearbeitungsstatus") ?? "").trim();
  // Leer = keine Änderung. Sonst gegen Whitelist validieren — verhindert
  // dass ein manipuliertes Formular freie Strings nach Airtable schreibt.
  // "Storno" wird hier bewusst ausgeschlossen, das geht nur über den
  // dedizierten Storno-Flow (mit Pflicht-Grund).
  const bearbeitungsstatus = statusRaw !== "" ? statusRaw : undefined;
  if (bearbeitungsstatus && !isValidLeadStatus(bearbeitungsstatus)) {
    return { error: `Ungültiger Bearbeitungsstatus: ${bearbeitungsstatus}` };
  }

  try {
    await updateLeadEditableFields({
      airtableId: lead.airtableId,
      kontaktversuche,
      ersterKontaktversuch,
      notizen,
      bearbeitungsstatus,
    });
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Speichern fehlgeschlagen.",
    };
  }

  // DB-Spiegel für die Felder, die wir lokal halten.
  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      contactAttempts: kontaktversuche,
      firstContactAt: ersterKontaktversuch
        ? new Date(`${ersterKontaktversuch}T12:00:00Z`)
        : null,
      ...(bearbeitungsstatus ? { status: bearbeitungsstatus } : {}),
    },
  });

  revalidatePath(`/buyer/leads/${lead.id}`);
  revalidatePath("/buyer/leads");
  return { ok: true };
}

// Wird vom Dashboard pro Render aufgerufen — liefert die für jeden Lead
// zugelassenen Stornogründe als Map<leadId, StornogrundOption[]>.
// Lädt Bezug + Stornogründe einmal komplett aus Airtable und joined
// gegen die DB-Lead-IDs. Bei API-Problemen still mit leerer Map zurück
// → Dropdown ist dann leer, Storno-Button trotzdem sichtbar.
export type LeadStornogrundOptions = Map<
  string,
  { recordId: string; grund: string; beschreibung: string | null }[]
>;

export async function getStornogruendePerLead(
  leadIds: string[],
): Promise<LeadStornogrundOptions> {
  const out: LeadStornogrundOptions = new Map();
  if (leadIds.length === 0) return out;
  const [allGruende, bezugMap] = await Promise.all([
    fetchAllStornogruende(),
    fetchBezugStornogruendeMap(),
  ]);
  if (allGruende.size === 0 || bezugMap.size === 0) return out;

  const leads = await prisma.lead.findMany({
    where: { id: { in: leadIds } },
    select: { id: true, bezugAirtableId: true },
  });
  for (const lead of leads) {
    if (!lead.bezugAirtableId) continue;
    const allowed = bezugMap.get(lead.bezugAirtableId) ?? [];
    const options = allowed
      .map((rid) => allGruende.get(rid))
      .filter((o): o is NonNullable<typeof o> => !!o)
      .map((o) => ({
        recordId: o.recordId,
        grund: o.grund,
        beschreibung: o.beschreibung,
      }));
    if (options.length > 0) out.set(lead.id, options);
  }
  return out;
}
