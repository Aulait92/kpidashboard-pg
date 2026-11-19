"use server";

// Vergleichsblatt (Policen auslesen): Werte korrigieren, als geprüft markieren, Sparte wählen, in den Bestand übernehmen.
// Nur der zuständige Vermittler bzw. Inhaber (appointmentScope + writableCustomerId), nie in der Vorschau.

import { revalidatePath } from "next/cache";
import { getBuyerContext } from "@/lib/buyer-context";
import { writableCustomerId } from "@/lib/buyer-write";
import { prisma } from "@/lib/prisma";
import { appointmentScope } from "@/lib/team";
import { isAuslesenSparte } from "@/lib/policen/auslesen/felder";
import { bestaetigeAuszug, korrigiereAuszug, nachEingang, uebernimmInBestand, waehleSparte } from "@/lib/policen/auslesen/server";

type Antwort = { ok: boolean; error?: string; status?: string };

async function wer(terminId: string) {
  const ctx = await getBuyerContext();
  if (!ctx) return { error: "Bitte neu anmelden." } as const;
  if (ctx.preview) return { error: "In der Vorschau nicht möglich." } as const;
  const t = await prisma.appointment.findFirst({ where: { id: terminId, ...appointmentScope(ctx) }, select: { leadId: true } });
  if (!t?.leadId) return { error: "Termin nicht gefunden." } as const;
  const customerId = await writableCustomerId(t.leadId);
  if (!customerId || customerId !== ctx.customerId) return { error: "Nur für den zuständigen Vermittler." } as const;
  return { w: { customerId, userId: ctx.userId, leadId: t.leadId } } as const;
}

const pfad = (terminId: string) => `/buyer/termine/${terminId}/vorbereitung/vertraege`;

export async function korrigierenAction(terminId: string, auszugId: string, eingaben: Record<string, unknown>): Promise<Antwort> {
  const x = await wer(terminId);
  if ("error" in x) return { ok: false, error: x.error };
  const ok = await korrigiereAuszug(x.w, auszugId, eingaben && typeof eingaben === "object" ? eingaben : {});
  revalidatePath(pfad(terminId));
  return ok ? { ok: true } : { ok: false, error: "Nicht gefunden." };
}

export async function geprueftAction(terminId: string, auszugId: string, ja: boolean): Promise<Antwort> {
  const x = await wer(terminId);
  if ("error" in x) return { ok: false, error: x.error };
  const ok = await bestaetigeAuszug(x.w, auszugId, ja);
  revalidatePath(pfad(terminId));
  return ok ? { ok: true } : { ok: false, error: "Nicht gefunden." };
}

export async function bestandAction(terminId: string, auszugId: string): Promise<Antwort> {
  const x = await wer(terminId);
  if ("error" in x) return { ok: false, error: x.error };
  const r = await uebernimmInBestand(x.w, auszugId);
  revalidatePath(pfad(terminId));
  return r ? { ok: true } : { ok: false, error: "Konnte nicht übernommen werden." };
}

export async function sparteAction(terminId: string, documentId: string, sparte: string): Promise<Antwort> {
  const x = await wer(terminId);
  if ("error" in x) return { ok: false, error: x.error };
  if (!isAuslesenSparte(sparte) && sparte !== "andere") return { ok: false, error: "Sparte unbekannt." };
  const r = await waehleSparte(x.w, documentId, sparte);
  revalidatePath(pfad(terminId));
  return r ? { ok: true, status: r.status } : { ok: false, error: "Nicht gefunden." };
}

/** Offene Unterlagen jetzt auslesen (z. B. Einwilligung kam nach den Unterlagen). */
export async function auslesenAction(terminId: string): Promise<Antwort & { anzahl?: number }> {
  const x = await wer(terminId);
  if ("error" in x) return { ok: false, error: x.error };
  const anzahl = await nachEingang(x.w.leadId);
  revalidatePath(pfad(terminId));
  return { ok: true, anzahl };
}
