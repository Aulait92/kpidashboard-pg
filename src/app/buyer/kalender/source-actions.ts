"use server";

import { revalidatePath } from "next/cache";
import { getBuyerContext } from "@/lib/buyer-context";
import { userCalendarKey } from "@/lib/calendar/tokens";
import { prisma } from "@/lib/prisma";
import { sendToAdmins } from "@/lib/push";
import { audit } from "@/lib/audit";
import {
  addBlock,
  connectAllianz,
  deleteBlock,
  disconnectAllianz,
  removeIcsLink,
  saveIcsLink,
  updateLeadTimes,
  type SourceResult,
} from "@/lib/calendar/sources";

// Verfügbarkeit im Kundenbereich: Inhaber stellt den Agentur-Kalender ein,
// ein Berater seinen eigenen (Lead-Zeiten und „Zeit blockieren").

async function ctxOrError(ownerOnly: boolean) {
  const ctx = await getBuyerContext();
  if (!ctx || ctx.preview) return { error: "In der Vorschau nicht möglich." } as const;
  if (ownerOnly && ctx.teamRole !== "owner") return { error: "Nur der Inhaber kann das ändern." } as const;
  // Inhaber → Agentur-Kalender, Berater → eigener Kalender.
  const key = ctx.teamRole === "owner" || !ctx.userId ? ctx.customerId : userCalendarKey(ctx.userId);
  return { ctx, key } as const;
}

function refresh() {
  revalidatePath("/buyer/kalender");
  revalidatePath("/buyer/einrichtung");
  revalidatePath("/buyer", "layout");
}

/** Ohne Buchungskalender kann noch nichts eingetragen werden → wir verbinden ihn. */
async function nudgeBookingCalendar(customerId: string, what: string) {
  const [conn, customer] = await Promise.all([
    prisma.calendarConnection.findUnique({ where: { customerId }, select: { status: true } }),
    prisma.customer.findUnique({ where: { id: customerId }, select: { name: true } }),
  ]);
  if (conn?.status === "connected") return;
  await sendToAdmins({ title: `📅 ${what}: ${customer?.name ?? "Kunde"}`, body: "Bitte Buchungskalender verbinden (Kundenakte → WhatsApp-Assistent).", url: `/admin/kunden/${customerId}/whatsapp` }).catch(() => {});
}

export async function connectAllianzAction(_prev: SourceResult, fd: FormData): Promise<SourceResult> {
  const c = await ctxOrError(true);
  if ("error" in c) return { error: c.error };
  const res = await connectAllianz(c.ctx.customerId, String(fd.get("vertretung") ?? ""), fd.get("consent") === "on");
  if (res.ok) {
    await audit("calendar.allianz_connect", { customerId: c.ctx.customerId, entity: "AgentConfig" });
    await nudgeBookingCalendar(c.ctx.customerId, "Allianz-Online-Kalender verbunden");
    refresh();
  }
  return res;
}

export async function disconnectAllianzAction(): Promise<void> {
  const c = await ctxOrError(true);
  if ("error" in c) return;
  await disconnectAllianz(c.ctx.customerId);
  await audit("calendar.allianz_disconnect", { customerId: c.ctx.customerId, entity: "AgentConfig" });
  refresh();
}

export async function saveIcsAction(_prev: SourceResult, fd: FormData): Promise<SourceResult> {
  const c = await ctxOrError(true);
  if ("error" in c) return { error: c.error };
  const res = await saveIcsLink(c.ctx.customerId, String(fd.get("icsUrl") ?? ""));
  if (res.ok) {
    await audit("calendar.ics_save", { customerId: c.ctx.customerId, entity: "AgentConfig" });
    await nudgeBookingCalendar(c.ctx.customerId, "Kalender-Link hinterlegt");
    refresh();
  }
  return res;
}

export async function removeIcsAction(): Promise<void> {
  const c = await ctxOrError(true);
  if ("error" in c) return;
  await removeIcsLink(c.ctx.customerId);
  refresh();
}

export async function saveLeadTimesAction(_prev: SourceResult, fd: FormData): Promise<SourceResult> {
  const c = await ctxOrError(false);
  if ("error" in c) return { error: c.error };
  const res = await updateLeadTimes(c.ctx.customerId, c.key, fd);
  if (res.ok) refresh();
  return res;
}

export async function addBlockAction(_prev: SourceResult, fd: FormData): Promise<SourceResult> {
  const c = await ctxOrError(false);
  if ("error" in c) return { error: c.error };
  const res = await addBlock(c.ctx.customerId, c.key, fd);
  if (res.ok) refresh();
  return res;
}

export async function deleteBlockAction(fd: FormData): Promise<void> {
  const c = await ctxOrError(false);
  if ("error" in c) return;
  // Nur eigene Blöcke (Berater) bzw. die des Agentur-Kalenders (Inhaber).
  const id = String(fd.get("id") ?? "");
  const row = await prisma.calendarBlock.findUnique({ where: { id }, select: { calendarKey: true } });
  if (row?.calendarKey !== c.key) return;
  await deleteBlock(c.ctx.customerId, id);
  refresh();
}
