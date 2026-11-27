"use server";

// Neue Leads: Wahl „nur meine / alle im Team“ je Login, getrennt für E-Mail und Push (Ole, 26.11.2026).

import { revalidatePath } from "next/cache";
import { getBuyerContext } from "@/lib/buyer-context";
import { prisma } from "@/lib/prisma";
import type { LeadScope } from "@/lib/lead-benachrichtigung-shared";

export async function setLeadBenachrichtigungAction(kanal: "mail" | "push", wert: LeadScope): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getBuyerContext();
  if (!ctx?.userId || ctx.preview) return { ok: false, error: "In der Vorschau nicht möglich." };
  const erlaubt: LeadScope[] = ctx.teamRole === "advisor" ? (kanal === "mail" ? ["aus", "meine"] : ["meine"]) : kanal === "mail" ? ["aus", "meine", "alle"] : ["meine", "alle"];
  if (!erlaubt.includes(wert)) return { ok: false, error: "Diese Auswahl ist nicht möglich." };
  await prisma.user.update({ where: { id: ctx.userId }, data: kanal === "mail" ? { leadMailScope: wert } : { leadPushScope: wert } });
  revalidatePath("/buyer/einstellungen/erinnerungen");
  return { ok: true };
}

/** Wochen-Mail „Ihr Team diese Woche“ an bzw. aus (nur Inhaber, Ole 27.11.2026). */
export async function setTeamWocheMailAction(an: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getBuyerContext();
  if (!ctx?.userId || ctx.preview) return { ok: false, error: "In der Vorschau nicht möglich." };
  if (ctx.teamRole === "advisor") return { ok: false, error: "Nur der Inhaber bekommt die Wochen-Mail." };
  await prisma.user.update({ where: { id: ctx.userId }, data: { teamWocheMailOff: !an } });
  revalidatePath("/buyer/einstellungen/erinnerungen");
  return { ok: true };
}
