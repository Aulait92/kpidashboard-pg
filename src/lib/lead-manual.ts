// Aus dem Kontakt heraus (Ole, 14.11.2026):
//  - Termin von Hand eintragen (ohne Kalender-Sync): erscheint auf Heute und im Kontakt wie gebuchte
//    Termine, Phase „In Beratung“. Keine automatische Erinnerung an den Lead (Text passt nicht immer).
//  - WhatsApp-Gespräch starten: freigegebene Vorlage „Erstkontakt“ (Sie/Du/ohne Namen je Lead), nur wenn
//    der Lead selbst angefragt hat (Formular), WhatsApp verbunden und eine Mobilnummer da ist.

import { prisma } from "@/lib/prisma";
import { logLeadHistory } from "@/lib/lead-history";
import { recordLeadProgress } from "@/lib/lead-progress";
import { asTerminArt, terminArtLabel, type TerminArt } from "@/lib/termin-art";

const TZ = "Europe/Berlin";
const VOR_TERMIN = new Set(["", "neuer lead", "nicht erreicht", "erreicht", "im gespräch", "qualifiziert", "kein interesse"]);

/** „2026-11-18“ + „10:30“ (Berliner Zeit) → Date */
export function berlinDateTime(date: string, time: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{1,2}:\d{2}$/.test(time)) return null;
  const [h, m] = time.split(":").map(Number);
  if (h > 23 || m > 59) return null;
  const guess = new Date(`${date}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`);
  // Abstand Berlin ↔ UTC an diesem Tag (Sommer/Winterzeit)
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(guess);
  const bh = Number(parts.find((p) => p.type === "hour")?.value);
  const bm = Number(parts.find((p) => p.type === "minute")?.value);
  const offsetMin = (bh * 60 + bm - (h * 60 + m) + 1440) % 1440;
  return new Date(guess.getTime() - (offsetMin > 720 ? offsetMin - 1440 : offsetMin) * 60_000);
}

const fmt = (d: Date) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: TZ, weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d);

export async function createManualAppointment(opts: {
  leadId: string;
  customerId: string;
  userId: string | null;
  date: string;
  time: string;
  mode: string;
  durationMin?: number;
  note?: string | null;
  now?: Date;
}): Promise<{ ok: true; appointmentId: string; startsAt: Date } | { ok: false; error: string }> {
  const startsAt = berlinDateTime(opts.date, opts.time);
  if (!startsAt) return { ok: false, error: "Bitte Datum und Uhrzeit angeben." };
  const now = opts.now ?? new Date();
  if (startsAt.getTime() < now.getTime() - 24 * 3600_000) return { ok: false, error: "Der Termin liegt in der Vergangenheit." };
  const lead = await prisma.lead.findFirst({ where: { id: opts.leadId, customerId: opts.customerId, erasedAt: null }, select: { id: true } });
  if (!lead) return { ok: false, error: "Lead nicht gefunden." };
  const mode: TerminArt = asTerminArt(opts.mode);
  const duration = Math.min(240, Math.max(15, Math.round(opts.durationMin ?? 30)));
  const appt = await prisma.appointment.create({
    data: {
      customerId: opts.customerId,
      leadId: lead.id,
      mode,
      startsAt,
      endsAt: new Date(startsAt.getTime() + duration * 60_000),
      status: "booked",
      // Von Hand eingetragen: keine automatische WhatsApp-Erinnerung an den Lead
      reminderSentAt: now,
    },
    select: { id: true },
  });
  await recordLeadProgress(lead.id, "booked");
  // Auch aus „Erreicht“/„Qualifiziert“ auf „Termin vereinbart“ (Status-Wert „In Beratung“); Angebot und Abschluss bleiben
  const cur = await prisma.lead.findUnique({ where: { id: lead.id }, select: { status: true, airtableId: true } });
  if (cur && VOR_TERMIN.has((cur.status ?? "").trim().toLowerCase())) {
    if (cur.airtableId) {
      const { updateLeadEditableFields } = await import("@/lib/airtable-write");
      await updateLeadEditableFields({ airtableId: cur.airtableId, bearbeitungsstatus: "In Beratung" }).catch(() => {});
    }
    await prisma.lead.update({ where: { id: lead.id }, data: { status: "In Beratung", reached: true } });
  }
  const note = (opts.note ?? "").trim().slice(0, 500);
  await logLeadHistory(lead.id, "status", `Termin von Hand eingetragen: ${fmt(startsAt)} Uhr, ${terminArtLabel(mode)}${note ? `. Notiz: ${note}` : ""}`, {
    customerId: opts.customerId,
    userId: opts.userId,
  });
  return { ok: true, appointmentId: appt.id, startsAt };
}

export type StartChatResult =
  | { ok: true; conversationId: string }
  | { ok: false; reason: "no_whatsapp" | "no_phone" | "no_consent" | "no_template" | "exists" | "not_found" | "send"; error: string; conversationId?: string };

export async function startLeadChat(opts: { leadId: string; customerId: string }): Promise<StartChatResult> {
  const lead = await prisma.lead.findFirst({
    where: { id: opts.leadId, customerId: opts.customerId, erasedAt: null },
    select: { id: true, name: true, phone: true, airtableId: true, externalId: true, formData: true, source: true, waConsent: true },
  });
  if (!lead) return { ok: false, reason: "not_found", error: "Lead nicht gefunden." };
  const account = await prisma.whatsAppAccount.findUnique({ where: { customerId: opts.customerId }, select: { status: true, apiKeyEnc: true } });
  if (!account || account.status !== "connected" || !account.apiKeyEnc) return { ok: false, reason: "no_whatsapp", error: "WhatsApp ist in Ihrem Konto noch nicht verbunden." };
  if (!lead.phone) return { ok: false, reason: "no_phone", error: "Für diesen Lead ist keine Mobilnummer hinterlegt." };
  const existing = await prisma.conversation.findFirst({ where: { customerId: opts.customerId, OR: [{ leadId: lead.id }, { contactPhone: lead.phone }] }, select: { id: true } });
  if (existing) return { ok: false, reason: "exists", error: "Es gibt schon ein Gespräch.", conversationId: existing.id };
  // Rechtsgrundlage: Der Lead hat selbst angefragt (Formular bzw. Empfehlung mit Einwilligung)
  const asked = !!(lead.airtableId || lead.externalId || lead.formData);
  if (!asked) return { ok: false, reason: "no_consent", error: "Für diesen Kontakt liegt keine Anfrage über ein Formular vor. Bitte zuerst anrufen oder per E-Mail schreiben." };
  // Häkchen zur Einwilligung im Leadformular fehlt: kein WhatsApp (lib/einwilligung-leadformular.ts)
  if (lead.waConsent === "nein") return { ok: false, reason: "no_consent", error: "Der Lead hat im Formular nicht in WhatsApp eingewilligt. Bitte anrufen oder per E-Mail zu seiner Anfrage melden." };

  const { NoTemplateError } = await import("@/lib/whatsapp/templates");
  const { sendOutreach } = await import("@/lib/whatsapp/outreach");
  const { anspracheOf } = await import("@/lib/whatsapp/reminders");
  try {
    const an = await anspracheOf(opts.customerId);
    // Erstanschreiben je Produkt mit erster Frage und Erstinformation als PDF (lib/whatsapp/outreach.ts)
    const res = await sendOutreach({ customerId: opts.customerId, leadId: lead.id, phone: lead.phone, name: lead.name, an, source: lead.source });
    await prisma.lead.update({ where: { id: lead.id }, data: { outreachAt: new Date(), outreachStatus: "sent" } });
    await recordLeadProgress(lead.id, "contact_attempt");
    return { ok: true, conversationId: res.conversationId };
  } catch (e) {
    if (e instanceof NoTemplateError) return { ok: false, reason: "no_template", error: "Die WhatsApp-Vorlage für den Erstkontakt ist noch nicht freigegeben. Das dauert nach dem Verbinden meist ein paar Stunden." };
    return { ok: false, reason: "send", error: "Die Nachricht konnte nicht gesendet werden. Bitte später noch einmal versuchen." };
  }
}
