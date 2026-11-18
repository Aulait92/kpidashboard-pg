"use server";

// Abschluss mit einem Tipp (P4, Ole 17.11.2026): Entscheidungsblatt aus dem Vorabend-Push (/buyer/abschluss), Heute,
// Kontakt und Chat-Meldung. Der Tipp selbst läuft über die bestehenden Wege (appointmentOutcomeResult bzw.
// callbackOutcomeResult, Kontakt: Statuswechsel); danach zeigt das Blatt den gespeicherten Stand mit Stimmt/Ändern und
// dem Haken „Glückwunsch per WhatsApp senden“. Schreibrecht wie überall (lib/buyer-write.ts).

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { writableCustomerId } from "@/lib/buyer-write";
import { getBuyerContext } from "@/lib/buyer-context";
import { leadScope } from "@/lib/team";
import { recordUsage } from "@/lib/usage";
import { DANKE_ANLASS, aendereAbschluss, ladeAbschlussStand, pausiereNachfassen, sendeGlueckwunsch, setzeAbschlussBeitrag, type AbschlussStand } from "@/lib/abschluss-server";
import { appointmentOutcomeResult, callbackOutcomeResult, type UndoSnapshot } from "@/app/buyer/inbox-actions";

type Ok<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const VORSCHAU = "In der Vorschau nur mit Demo-Leads möglich.";

function refresh(leadId?: string) {
  revalidatePath("/buyer");
  revalidatePath("/buyer/abschluss");
  revalidatePath("/buyer/zahlen");
  if (leadId) revalidatePath("/buyer/kontakte", "layout");
}

/** Stand nach dem Tipp (Zeile, Chips, Glückwunsch); null, wenn der Kontakt nicht sichtbar ist. */
export async function abschlussStandAction(leadId: string): Promise<AbschlussStand | null> {
  const ctx = await getBuyerContext();
  if (!ctx) return null;
  const visible = await prisma.lead.count({ where: { AND: [leadScope(ctx), { id: leadId }] } });
  if (!visible) return null;
  return ladeAbschlussStand(leadId, ctx.customerId, new Date(), { userId: ctx.userId ?? null });
}

/** „Ja, abgeschlossen“ im Blatt: Termin ohne Ergebnis → Ergebnis am Termin, sonst wie „Abschluss“ auf Heute. */
export async function abschlussEintragenAction(leadId: string): Promise<Ok<{ undo?: UndoSnapshot }>> {
  const customerId = await writableCustomerId(leadId);
  if (!customerId) return { ok: false, error: VORSCHAU };
  const termin = await prisma.appointment.findFirst({
    where: { leadId, customerId, status: "booked", startsAt: { lte: new Date() } },
    orderBy: { startsAt: "desc" },
    select: { id: true },
  });
  const r = termin ? await appointmentOutcomeResult(termin.id, "closed", null) : await callbackOutcomeResult(leadId, "won", null);
  await recordUsage("action", "abschluss.blatt");
  refresh(leadId);
  return r.ok ? { ok: true, undo: r.undo } : r;
}

/** „Stimmt“ (eingabe null), Chip oder anderer Betrag (Eingabe-Einheit). */
export async function abschlussBeitragAction(leadId: string, eingabe: number | null): Promise<Ok> {
  const customerId = await writableCustomerId(leadId);
  if (!customerId) return { ok: false, error: VORSCHAU };
  const ctx = await getBuyerContext();
  const r = await setzeAbschlussBeitrag(leadId, customerId, eingabe, { userId: ctx?.userId ?? null });
  await recordUsage("action", eingabe == null ? "abschluss.stimmt" : "abschluss.beitrag");
  refresh(leadId);
  return r;
}

/** „Ändern“: Sparte und Beitrag aus dem bestehenden Abschluss-Blatt (gespeicherte Einheit). */
export async function abschlussAendernAction(leadId: string, value: number | null, sparte: string | null): Promise<Ok> {
  const customerId = await writableCustomerId(leadId);
  if (!customerId) return { ok: false, error: VORSCHAU };
  const r = await aendereAbschluss(leadId, customerId, value, sparte);
  await recordUsage("action", "abschluss.aendern");
  refresh(leadId);
  return r;
}

/** Haken „Glückwunsch per WhatsApp senden“ (nur im offenen 24-h-Fenster). */
export async function glueckwunschAction(leadId: string): Promise<Ok<{ gesendet: boolean }>> {
  const customerId = await writableCustomerId(leadId);
  if (!customerId) return { ok: false, error: VORSCHAU };
  const ctx = await getBuyerContext();
  const r = await sendeGlueckwunsch(leadId, customerId, { userId: ctx?.userId ?? null });
  await recordUsage("action", "abschluss.glueckwunsch");
  refresh(leadId);
  return r;
}

/** Haken „Danke-Mail senden“ (Paket M6, Vorlage „Nach dem Abschluss“, je Kontakt einmal). */
export async function dankeMailAction(leadId: string): Promise<Ok> {
  const customerId = await writableCustomerId(leadId);
  if (!customerId) return { ok: false, error: VORSCHAU };
  const ctx = await getBuyerContext();
  const { sendeEinTippMail } = await import("@/lib/mail/ein-tipp");
  const r = await sendeEinTippMail(leadId, "nach_abschluss", { anlass: DANKE_ANLASS, userId: ctx?.userId ?? null });
  await recordUsage("action", "abschluss.danke_mail");
  refresh(leadId);
  return r;
}

/** „Nachfassen pausieren“ im Blatt (eine Woche). */
export async function nachfassenPausierenAction(leadId: string): Promise<Ok<{ bis: string }>> {
  const customerId = await writableCustomerId(leadId);
  if (!customerId) return { ok: false, error: VORSCHAU };
  const ctx = await getBuyerContext();
  const r = await pausiereNachfassen(leadId, customerId, { userId: ctx?.userId ?? null });
  await recordUsage("action", "abschluss.pausieren");
  refresh(leadId);
  return r;
}
