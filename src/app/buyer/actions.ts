"use server";

import { revalidatePath } from "next/cache";
import {
  fetchAllStornogruende,
  fetchBezugStornogruendeMap,
  markLeadAsCancelled,
  updateLeadEditableFields,
} from "@/lib/airtable-write";
import { getCurrentSession } from "@/lib/auth";
import { writableCustomerId } from "@/lib/buyer-write";
import { syncFollowUpWithStatus } from "@/lib/lead-followup";
import { recordUsage } from "@/lib/usage";
import { prisma } from "@/lib/prisma";
import {
  CLOSED_STATUS,
  isReachedStatus,
  isValidLeadStatus,
  type LeadStatus,
} from "@/lib/products";
import { sendToAdmins } from "@/lib/push";
import { audit } from "@/lib/audit";

// Admin-Vorschau („Als Kunde ansehen") ist bewusst schreibgeschützt.
function previewError(session: { role: string } | null): string {
  return session?.role === "ADMIN"
    ? "In der Vorschau sind Änderungen deaktiviert."
    : "Nicht eingeloggt.";
}

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
    return { error: previewError(session) };
  }

  const leadId = String(formData.get("leadId") ?? "");
  const stornogrundRecordId = String(formData.get("stornogrundId") ?? "").trim();
  const bemerkung = String(formData.get("bemerkung") ?? "").trim();
  if (!leadId) return { error: "Lead fehlt.", leadId };
  if (!stornogrundRecordId) {
    return { error: "Bitte einen Stornogrund auswählen.", leadId };
  }

  // Zugriffsschutz: Buyer darf nur eigene Leads stornieren (Berater nur zugewiesene).
  const writeCustomerId = await writableCustomerId(leadId);
  if (!writeCustomerId) return { error: "Lead nicht gefunden.", leadId };
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, customerId: writeCustomerId },
    select: {
      id: true,
      airtableId: true,
      bezugAirtableId: true,
      status: true,
      name: true,
      source: true,
      customer: { select: { name: true } },
    },
  });
  if (!lead) {
    return { error: "Lead nicht gefunden.", leadId };
  }
  if (lead.status && lead.status.toLowerCase().startsWith("storno")) {
    // Idempotent: schon storniert → erfolgreich quittieren.
    return { ok: true, leadId };
  }

  // Storno nur, wenn für den Bezug „Erlaubte Stornogründe" vertraglich
  // hinterlegt sind (z. B. Retainer-Kunden: keine → kein Storno). Der
  // gewählte Grund muss in dieser Liste stehen — verhindert auch, dass ein
  // manipuliertes Formular einen fremden Grund einreicht.
  const allowed = lead.bezugAirtableId
    ? ((await fetchBezugStornogruendeMap()).get(lead.bezugAirtableId) ?? [])
    : [];
  if (allowed.length === 0) {
    return {
      error: "Für diesen Vertrag sind keine Stornos vorgesehen.",
      leadId,
    };
  }
  if (!allowed.includes(stornogrundRecordId)) {
    return {
      error: "Dieser Stornogrund ist für diesen Bezug nicht zugelassen.",
      leadId,
    };
  }

  try {
    // Direkt eingegangene Leads (ohne Airtable-Datensatz) werden nur in der
    // App storniert; Airtable-Leads zusätzlich dort.
    if (lead.airtableId) {
      await markLeadAsCancelled({
        airtableId: lead.airtableId,
        stornogrundRecordId,
        bemerkung,
      });
    }
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

  await audit("lead.storno", { entity: "Lead", entityId: lead.id, customerId: writeCustomerId, details: { grund: stornogrundRecordId } });

  // Push-Notification an Admins. Fehler hier dürfen den Storno nicht
  // scheitern lassen — nur warnen. Stornogrund-Label aus der vorab
  // gefetchten Map lesen, damit Admin gleich den Grund mitsieht.
  try {
    const allGruende = await fetchAllStornogruende();
    const grundLabel = allGruende.get(stornogrundRecordId)?.grund ?? "-";
    const bodyParts = [lead.customer.name, lead.source, grundLabel].filter(
      (s): s is string => !!s,
    );
    await sendToAdmins({
      title: `🚫 Storno: ${lead.name ?? "Lead"}`,
      body: bemerkung ? `${bodyParts.join(" · ")}: ${bemerkung}` : bodyParts.join(" · "),
      tag: `storno:${lead.airtableId ?? lead.id}`,
      url: "/",
    });
  } catch (err) {
    console.warn("[storno] admin notification failed:", err);
  }

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
  const writeCustomerId = await writableCustomerId(leadId);
  if (!writeCustomerId) {
    return { ok: false, error: previewError(await getCurrentSession()) };
  }
  if (!isValidLeadStatus(status)) {
    return { ok: false, error: `Ungültiger Status: ${status}` };
  }

  const lead = await prisma.lead.findFirst({
    where: { id: leadId, customerId: writeCustomerId },
    select: { id: true, airtableId: true, firstContactAt: true, contactAttempts: true },
  });
  if (!lead) return { ok: false, error: "Lead nicht gefunden." };

  // Verlässt der Lead „Neuer Lead" zum ersten Mal, hat ein Kontaktversuch
  // stattgefunden → „Erster Kontaktversuch" automatisch setzen (sonst bleiben
  // „Zeit bis Erstkontakt" und Speed-to-Lead leer, wenn der Kunde das Feld
  // nicht manuell pflegt). Bereits gesetzte Werte bleiben unangetastet.
  const autoFirstContact =
    !lead.firstContactAt && status !== "Neuer Lead" ? new Date() : null;

  const isClosed = status === CLOSED_STATUS;
  // Beim Abschluss: den (optional) übergebenen Abschlusswert setzen. Verlässt
  // der Lead die Abschluss-Phase (z. B. zurück auf „Neuer Lead"), den
  // Abschlusswert IMMER löschen — sonst zeigt die Karte weiter einen „Umsatz".
  const closeValue: number | null | undefined = isClosed ? opts?.closeValue : null;
  try {
    // Leads ohne Airtable-Referenz (z. B. Demo) nur in der DB pflegen.
    if (lead.airtableId) await updateLeadEditableFields({
      airtableId: lead.airtableId,
      bearbeitungsstatus: status,
      ...(closeValue !== undefined ? { closeValue } : {}),
      ...(autoFirstContact
        ? {
            ersterKontaktversuch: autoFirstContact.toISOString(),
            kontaktversuche: Math.max(1, lead.contactAttempts),
          }
        : {}),
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Status-Update fehlgeschlagen.",
    };
  }

  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      status,
      reached: isReachedStatus(status),
      closedAt: isClosed ? new Date() : null,
      ...(autoFirstContact
        ? {
            firstContactAt: autoFirstContact,
            contactAttempts: Math.max(1, lead.contactAttempts),
          }
        : {}),
      ...(closeValue !== undefined
        ? { closeValue: closeValue == null ? null : closeValue }
        : {}),
    },
  });

  await syncFollowUpWithStatus(lead.id, status);
  await recordUsage("action", "pipeline.move", { meta: { to: status } });
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
  const leadId = String(formData.get("leadId") ?? "");
  if (!leadId) return { error: "Lead fehlt." };
  const writeCustomerId = await writableCustomerId(leadId);
  if (!writeCustomerId) {
    return { error: previewError(await getCurrentSession()) };
  }

  const lead = await prisma.lead.findFirst({
    where: { id: leadId, customerId: writeCustomerId },
    select: { id: true, airtableId: true },
  });
  if (!lead) return { error: "Lead nicht gefunden." };

  // Inputs parsen — leere Strings bedeuten "leer setzen".
  const hasContactFields = formData.has("kontaktversuche");
  const kvRaw = String(formData.get("kontaktversuche") ?? "").trim();
  const kontaktversuche = kvRaw === "" ? 0 : Math.max(0, Math.round(Number(kvRaw)));
  if (!Number.isFinite(kontaktversuche)) {
    return { error: "Kontaktversuche muss eine Zahl sein." };
  }

  const ersterRaw = String(formData.get("ersterKontaktversuch") ?? "").trim();
  // datetime-local-Input liefert "YYYY-MM-DDTHH:mm" (oder mit Sekunden).
  // Wir interpretieren den Wert als UTC (analog zum Airtable-„GMT"-Display),
  // damit Dashboard und Airtable dieselben Ziffern zeigen — unabhängig
  // vom Viewer-Browser. Datum-only („YYYY-MM-DD") wird als 00:00 Uhr UTC
  // akzeptiert, damit alte Records nicht hängenbleiben.
  let ersterKontaktversuchIso: string | null = null;
  if (ersterRaw !== "") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(ersterRaw)) {
      ersterKontaktversuchIso = `${ersterRaw}T00:00:00.000Z`;
    } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(ersterRaw)) {
      const withSeconds = /T\d{2}:\d{2}$/.test(ersterRaw)
        ? `${ersterRaw}:00`
        : ersterRaw;
      ersterKontaktversuchIso = `${withSeconds.replace(/\.\d+$/, "")}.000Z`;
    } else {
      return { error: "Erster Kontaktversuch: ungültiges Datum/Zeit." };
    }
  }

  const hasNotes = formData.has("notizen");
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
    // Ohne Airtable-Referenz nur DB-Felder (Notizen leben nur in Airtable).
    // Kontaktversuche / Erster Kontakt nur schreiben, wenn das Formular sie
    // mitschickt (im Kunden-CRM ausgeblendet → Werte bleiben unverändert).
    if (lead.airtableId) await updateLeadEditableFields({
      airtableId: lead.airtableId,
      ...(hasContactFields ? { kontaktversuche, ersterKontaktversuch: ersterKontaktversuchIso } : {}),
      ...(hasNotes ? { notizen } : {}),
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
      ...(hasContactFields
        ? {
            contactAttempts: kontaktversuche,
            firstContactAt: ersterKontaktversuchIso ? new Date(ersterKontaktversuchIso) : null,
          }
        : {}),
      ...(bearbeitungsstatus ? { status: bearbeitungsstatus } : {}),
      ...(hasNotes ? { notes: notizen.trim() || null } : {}),
    },
  });

  if (bearbeitungsstatus) await syncFollowUpWithStatus(lead.id, bearbeitungsstatus);
  await recordUsage("action", "lead.save", { meta: { status: bearbeitungsstatus ?? null, notes: notizen.length > 0 } });
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

// ─── Rückrufliste: Ergebnis des Anrufs ─────────────────────────────────────
// „Nicht erreicht": Kontaktversuch +1, 20 h aus der Liste (morgen wieder).
// „Verloren": Status „Kein Interesse" → fällt dauerhaft raus.
// (Neuer Termin läuft über die Buchungsseite → Lead springt automatisch auf
// „Termin vereinbart" und verschwindet aus der Liste.)
export async function callbackOutcomeAction(formData: FormData): Promise<void> {
  const leadId = String(formData.get("leadId") ?? "");
  const outcome = String(formData.get("outcome") ?? "");
  const writeCustomerId = await writableCustomerId(leadId);
  if (!writeCustomerId) return;
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, customerId: writeCustomerId },
    select: { id: true, airtableId: true, status: true, contactAttempts: true, firstContactAt: true },
  });
  if (!lead) return;
  const now = new Date();

  if (outcome === "not_reached") {
    const attempts = lead.contactAttempts + 1;
    // Wer schon im Gespräch war, bleibt dort; neue Leads → „Nicht erreicht".
    const s = (lead.status ?? "").trim().toLowerCase();
    const nextStatus = s === "" || s === "neuer lead" ? "Nicht erreicht" : null;
    if (lead.airtableId) {
      await updateLeadEditableFields({
        airtableId: lead.airtableId,
        kontaktversuche: attempts,
        ...(nextStatus ? { bearbeitungsstatus: nextStatus } : {}),
        ...(!lead.firstContactAt ? { ersterKontaktversuch: now.toISOString() } : {}),
      }).catch((e) => console.error("[callback outcome]", e));
    }
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        contactAttempts: attempts,
        callbackSnoozedUntil: new Date(now.getTime() + 20 * 60 * 60 * 1000),
        ...(nextStatus ? { status: nextStatus, reached: false } : {}),
        ...(!lead.firstContactAt ? { firstContactAt: now } : {}),
      },
    });
  } else if (outcome === "lost") {
    if (lead.airtableId) {
      await updateLeadEditableFields({
        airtableId: lead.airtableId,
        bearbeitungsstatus: "Kein Interesse",
      }).catch((e) => console.error("[callback outcome]", e));
    }
    await prisma.lead.update({
      where: { id: lead.id },
      data: { status: "Kein Interesse", reached: true },
    });
  }
  revalidatePath("/buyer/leads");
  revalidatePath("/buyer/kanban");
  revalidatePath("/buyer");
}

// ─── „Wie lief's?" — Ergebnis eines vergangenen Termins ───────────────────
// Setzt Termin-Status (completed/no_show) und den Lead-Status in DB + Airtable,
// damit Abschlussquote und Kosten pro Abschluss stimmen.
const OUTCOME_STATUS: Record<string, string> = {
  offer: "Angebot gesendet",
  closed: "Abschluss",
  lost: "Kein Interesse",
  no_show: "Im Gespräch",
};

export async function appointmentOutcomeAction(formData: FormData): Promise<void> {
  const appointmentId = String(formData.get("appointmentId") ?? "");
  const outcome = String(formData.get("outcome") ?? "");
  const nextStatus = OUTCOME_STATUS[outcome];
  if (!appointmentId || !nextStatus) return;
  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { id: true, leadId: true, customerId: true },
  });
  if (!appt?.leadId) return;
  const writeCustomerId = await writableCustomerId(appt.leadId);
  if (!writeCustomerId || writeCustomerId !== appt.customerId) return;

  const rawValue = String(formData.get("closeValue") ?? "").replace(/\./g, "").replace(",", ".").trim();
  const closeValue = outcome === "closed" && rawValue ? Number.parseFloat(rawValue) : null;

  await prisma.appointment.update({
    where: { id: appt.id },
    data: { status: outcome === "no_show" ? "no_show" : "completed" },
  });
  const lead = await prisma.lead.findUnique({
    where: { id: appt.leadId },
    select: { airtableId: true },
  });
  if (lead?.airtableId) {
    await updateLeadEditableFields({
      airtableId: lead.airtableId,
      bearbeitungsstatus: nextStatus,
      ...(outcome === "closed" ? { closeValue: Number.isFinite(closeValue ?? NaN) ? closeValue : null } : {}),
    }).catch((e) => console.error("[appointment outcome]", e));
  }
  await prisma.lead.update({
    where: { id: appt.leadId },
    data: {
      status: nextStatus,
      reached: true,
      closedAt: outcome === "closed" ? new Date() : null,
      ...(outcome === "closed"
        ? { closeValue: closeValue != null && Number.isFinite(closeValue) ? closeValue : null }
        : {}),
      // Nicht erschienen → sofort in die Rückrufliste (kein Snooze).
      ...(outcome === "no_show" ? { callbackSnoozedUntil: null } : {}),
    },
  });
  revalidatePath("/buyer");
  revalidatePath("/buyer/leads");
  revalidatePath("/buyer/kanban");
}
