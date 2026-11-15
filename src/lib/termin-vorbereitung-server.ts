// Terminvorbereitung laden (Datenbank), siehe lib/termin-vorbereitung.ts.

import { prisma } from "@/lib/prisma";
import { appointmentScope, type TeamCtx } from "@/lib/team";
import { displayProduct } from "@/lib/products";
import { currentStammdaten } from "@/lib/lead-stammdaten";
import { personFromCustomerName } from "@/lib/advisor-name";
import { abschnitte, offenePunkte, VORBEREITUNG_VORLAUF_MS, type VorbereitungDaten } from "@/lib/termin-vorbereitung";

const formAnswers = (raw: unknown): { label: string; value: string }[] =>
  Array.isArray(raw)
    ? raw.flatMap((x) =>
        x && typeof x === "object" && typeof (x as { label?: unknown }).label === "string" && typeof (x as { value?: unknown }).value === "string" && (x as { value: string }).value.trim()
          ? [{ label: (x as { label: string }).label, value: (x as { value: string }).value }]
          : [],
      )
    : [];

/** Daten für Seite und PDF; null, wenn der Termin nicht in den Sichtbereich dieses Logins gehört. */
export async function loadVorbereitung(appointmentId: string, ctx: TeamCtx): Promise<(VorbereitungDaten & { id: string; leadId: string | null }) | null> {
  const appt = await prisma.appointment.findFirst({
    where: { id: appointmentId, ...appointmentScope(ctx) },
    select: {
      id: true,
      leadId: true,
      conversationId: true,
      startsAt: true,
      mode: true,
      meetUrl: true,
      calendarKey: true,
      preparedAt: true,
      customer: { select: { name: true } },
      lead: { select: { name: true, phone: true, email: true, source: true, formData: true, contactOverrides: true, assignedUserId: true } },
    },
  });
  if (!appt) return null;
  const conv = appt.conversationId
    ? await prisma.conversation.findUnique({ where: { id: appt.conversationId }, select: { qualificationSummary: true, qualificationData: true, contactName: true, contactPhone: true } })
    : appt.leadId
      ? await prisma.conversation.findFirst({ where: { leadId: appt.leadId }, orderBy: { lastMessageAt: "desc" }, select: { qualificationSummary: true, qualificationData: true, contactName: true, contactPhone: true } })
      : null;
  const beraterId = appt.calendarKey?.startsWith("user:") ? appt.calendarKey.slice(5) : appt.lead?.assignedUserId ?? null;
  const berater = beraterId ? (await prisma.user.findUnique({ where: { id: beraterId }, select: { displayName: true } }))?.displayName : null;
  const st = appt.lead ? currentStammdaten({ ...appt.lead }) : null;
  const adresse = st ? [st.street, [st.zip, st.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null : null;
  return {
    id: appt.id,
    leadId: appt.leadId,
    lead: {
      name: appt.lead?.name ?? conv?.contactName ?? "Kontakt",
      telefon: appt.lead?.phone ?? conv?.contactPhone ?? null,
      email: appt.lead?.email ?? null,
      adresse,
      produkt: appt.lead?.source ? displayProduct(appt.lead.source) : "Beratung",
    },
    termin: { startsAt: appt.startsAt, mode: appt.mode, berater: berater || personFromCustomerName(appt.customer.name), meetUrl: appt.meetUrl },
    zusammenfassung: conv?.qualificationSummary ?? null,
    formular: formAnswers(appt.lead?.formData),
    angaben: conv?.qualificationData ?? null,
    vorbereitetAm: appt.preparedAt,
  };
}

export type VorbereitungAufgabe = { id: string; leadId: string | null; name: string; produkt: string; startsAt: Date; mode: string; offen: number; heute: boolean };

/** Aufgaben „Termin vorbereiten“: gebuchte Termine in den nächsten 36 Std., noch nicht als vorbereitet abgehakt. */
export async function listVorbereitungen(ctx: TeamCtx, now = new Date()): Promise<VorbereitungAufgabe[]> {
  const appts = await prisma.appointment.findMany({
    where: { ...appointmentScope(ctx), status: "booked", preparedAt: null, startsAt: { gt: now, lte: new Date(now.getTime() + VORBEREITUNG_VORLAUF_MS) } },
    orderBy: { startsAt: "asc" },
    take: 20,
    select: { id: true },
  });
  const day = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", dateStyle: "short" }).format(d);
  const out: VorbereitungAufgabe[] = [];
  for (const a of appts) {
    const d = await loadVorbereitung(a.id, ctx);
    if (!d) continue;
    out.push({
      id: d.id,
      leadId: d.leadId,
      name: d.lead.name,
      produkt: d.lead.produkt,
      startsAt: d.termin.startsAt,
      mode: d.termin.mode,
      offen: offenePunkte(abschnitte(d)).length,
      heute: day(d.termin.startsAt) === day(now),
    });
  }
  return out;
}

/** Als vorbereitet abhaken bzw. zurücknehmen. */
export async function setPrepared(appointmentId: string, ctx: TeamCtx & { userId?: string | null }, prepared: boolean): Promise<boolean> {
  const n = await prisma.appointment.updateMany({
    where: { id: appointmentId, ...appointmentScope(ctx) },
    data: prepared ? { preparedAt: new Date(), preparedById: ctx.userId ?? null } : { preparedAt: null, preparedById: null },
  });
  return n.count > 0;
}
