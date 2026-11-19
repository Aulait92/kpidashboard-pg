"use server";

// Vertragsseite (Policen auslesen): Werte korrigieren, als geprüft markieren (einzeln bzw. alle angezeigten), Sparte
// wählen, geprüfte Verträge in den Bestand übernehmen (nur mit Bestandsmodul, K7).
// Nur der zuständige Vermittler bzw. Inhaber (appointmentScope + writableCustomerId), nie in der Vorschau.

import { revalidatePath } from "next/cache";
import { getBuyerContext } from "@/lib/buyer-context";
import { writableCustomerId } from "@/lib/buyer-write";
import { prisma } from "@/lib/prisma";
import { appointmentScope } from "@/lib/team";
import { isAuslesenSparte } from "@/lib/policen/auslesen/felder";
import { bestaetigeAlle, bestaetigeAuszug, korrigiereAuszug, nachEingang, uebernimmAlle, waehleSparte } from "@/lib/policen/auslesen/server";

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

/** „Alle als geprüft markieren“: nur die angezeigten, ausgelesenen, ungeprüften Auszüge (Prüfung im Server). */
export async function alleGeprueftAction(terminId: string, auszugIds: string[]): Promise<Antwort & { anzahl?: number }> {
  const x = await wer(terminId);
  if ("error" in x) return { ok: false, error: x.error };
  const anzahl = await bestaetigeAlle(x.w, auszugIds);
  revalidatePath(pfad(terminId));
  return anzahl ? { ok: true, anzahl } : { ok: false, error: "Nichts zu markieren. Bitte Seite neu laden." };
}

/** „n Verträge in Bestand übernehmen“: nur geprüfte, nur mit sichtbarem Bestandsmodul. */
export async function alleUebernehmenAction(terminId: string, auszugIds: string[]): Promise<Antwort & { anzahl?: number }> {
  const x = await wer(terminId);
  if ("error" in x) return { ok: false, error: x.error };
  const r = await uebernimmAlle(x.w, auszugIds);
  revalidatePath(pfad(terminId));
  if (!r) return { ok: false, error: "Übernahme ist für Ihr Konto nicht verfügbar." };
  if (!r.uebernommen) return { ok: false, error: "Nichts übernommen. Bitte zuerst prüfen." };
  return r.fehler ? { ok: true, anzahl: r.uebernommen, error: `${r.fehler} konnten nicht übernommen werden.` } : { ok: true, anzahl: r.uebernommen };
}

export async function sparteAction(terminId: string, documentId: string, sparte: string): Promise<Antwort> {
  const x = await wer(terminId);
  if ("error" in x) return { ok: false, error: x.error };
  if (!isAuslesenSparte(sparte)) return { ok: false, error: "Sparte unbekannt." };
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
