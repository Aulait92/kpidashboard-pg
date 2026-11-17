"use server";

// Angebot nach dem Termin senden (Paket P3, Ole 17.11.2026): Blatt „Angebot senden“ auf „Heute“, im Blatt „Wie lief der
// Termin?“, am Kontakt und in der Terminvorbereitung (Schritt 4). Logik: lib/angebot-senden-server.ts.
// Hat der Termin noch kein Ergebnis, setzt das Senden es auf „Angebot gesendet“ (wie bisher über appointmentOutcomeResult),
// das Nachfassen startet aber erst mit dem Versand bzw. „Habe ich selbst gesendet“.

import { revalidatePath } from "next/cache";
import { getBuyerContext } from "@/lib/buyer-context";
import { writableCustomerId } from "@/lib/buyer-write";
import { prisma } from "@/lib/prisma";
import { appointmentScope } from "@/lib/team";
import { recordUsage } from "@/lib/usage";
import { angebotAblegen, angebotSelbst, angebotSenden, angebotWiedervorlageWeg, ladeAngebotInfo, type AngebotInfo } from "@/lib/angebot-senden-server";
import { appointmentOutcomeResult } from "@/app/buyer/inbox-actions";

type Ergebnis = { ok: true; message: string } | { ok: false; error: string };

async function zugriff(appointmentId: string) {
  const ctx = await getBuyerContext();
  if (!ctx) return { error: "Bitte neu anmelden." } as const;
  const t = await prisma.appointment.findFirst({
    where: { id: appointmentId, ...appointmentScope(ctx) },
    select: { id: true, leadId: true, status: true, startsAt: true, lead: { select: { status: true } } },
  });
  if (!t?.leadId) return { error: "Termin nicht gefunden." } as const;
  return { ctx, t, leadId: t.leadId } as const;
}

function aktualisieren(appointmentId: string, leadId: string) {
  revalidatePath("/buyer");
  revalidatePath(`/buyer/termine/${appointmentId}/vorbereitung`);
  revalidatePath(`/buyer/leads/${leadId}`);
  revalidatePath(`/buyer/kontakte/${leadId}`);
}

/** Termin ohne Ergebnis (vorbei): Ergebnis „Angebot gesendet“ setzen; danach die klassische Wiedervorlage wieder weg. */
async function ergebnisSetzen(t: { id: string; status: string; startsAt: Date }, leadId: string, nachfassen: boolean) {
  if (t.status !== "booked" || t.startsAt.getTime() > Date.now()) return;
  const r = await appointmentOutcomeResult(t.id, "offer", null);
  if (!r.ok) console.error("[angebot ergebnis]", r.error);
  if (nachfassen) await angebotWiedervorlageWeg(leadId);
}

export async function angebotInfoResult(appointmentId: string): Promise<{ ok: true; info: AngebotInfo } | { ok: false; error: string }> {
  const z = await zugriff(appointmentId);
  if ("error" in z) return { ok: false, error: z.error ?? "Termin nicht gefunden." };
  const info = await ladeAngebotInfo(appointmentId, z.ctx);
  return info ? { ok: true, info } : { ok: false, error: "Termin nicht gefunden." };
}

/** „Über die App senden“: WhatsApp und E-Mail mit dem PDF der Gesellschaft. */
export async function angebotSendenResult(appointmentId: string, input: { dateiId: string; kundenlink: boolean }): Promise<Ergebnis> {
  const z = await zugriff(appointmentId);
  if ("error" in z) return { ok: false, error: z.error ?? "Termin nicht gefunden." };
  if (!(await writableCustomerId(z.leadId))) return { ok: false, error: "In der Vorschau nur mit Demo-Leads möglich." };
  if (typeof input?.dateiId !== "string" || !input.dateiId) return { ok: false, error: "Bitte zuerst das Angebot als PDF hochladen." };
  const r = await angebotSenden(appointmentId, z.ctx, { dateiId: input.dateiId, kundenlink: !!input.kundenlink });
  if (!r.ok) return r;
  await ergebnisSetzen(z.t, z.leadId, r.nachfassen);
  await recordUsage("action", "angebot.app");
  aktualisieren(appointmentId, z.leadId);
  const wie = r.kanaele.length === 2 ? "per WhatsApp und E-Mail" : r.kanaele[0] === "whatsapp" ? "per WhatsApp" : "per E-Mail";
  return { ok: true, message: `Angebot ${wie} gesendet${r.hinweise.length ? `. ${r.hinweise.join(". ")}` : ""}` };
}

/** „Habe ich selbst gesendet“: ein Tipp, Nachfassen nur per WhatsApp und Anruf. */
export async function angebotSelbstResult(appointmentId: string, dateiId?: string | null): Promise<Ergebnis> {
  const z = await zugriff(appointmentId);
  if ("error" in z) return { ok: false, error: z.error ?? "Termin nicht gefunden." };
  if (!(await writableCustomerId(z.leadId))) return { ok: false, error: "In der Vorschau nur mit Demo-Leads möglich." };
  const r = await angebotSelbst(appointmentId, z.ctx, { dateiId: typeof dateiId === "string" ? dateiId : null });
  if (!r.ok) return r;
  await ergebnisSetzen(z.t, z.leadId, r.nachfassen);
  await recordUsage("action", "angebot.selbst");
  aktualisieren(appointmentId, z.leadId);
  return { ok: true, message: r.nachfassen ? "Vermerkt. Die App fasst per WhatsApp nach." : "Vermerkt" };
}

/** PDF zum Termin vermerken („Angebot abgelegt am“). */
export async function angebotAblegenResult(appointmentId: string, dateiId: string): Promise<Ergebnis> {
  const z = await zugriff(appointmentId);
  if ("error" in z) return { ok: false, error: z.error ?? "Termin nicht gefunden." };
  if (!(await writableCustomerId(z.leadId))) return { ok: false, error: "In der Vorschau nur mit Demo-Leads möglich." };
  if (typeof dateiId !== "string" || !(await angebotAblegen(appointmentId, z.ctx, dateiId))) return { ok: false, error: "Datei nicht gefunden." };
  aktualisieren(appointmentId, z.leadId);
  return { ok: true, message: "Angebot abgelegt" };
}
