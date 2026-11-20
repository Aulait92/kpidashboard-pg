"use server";

// Datenschutz und Recht in der Kontaktakte (Ole, 19.11.2026): Antwortvorlage als Entwurf laden, nach Prüfung senden
// oder ohne Senden als beantwortet vermerken (lib/vertrieb/datenschutz-recht-server.ts). Nichts geht automatisch raus.

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/vertrieb/auth";
import { audit } from "@/lib/audit";
import { istVorlagenArt, type VorlagenArt } from "@/lib/vertrieb/datenschutz-recht";
import type { Entwurf } from "@/lib/vertrieb/datenschutz-recht-server";

function refresh(contactId: string) {
  revalidatePath("/admin/neu/vertrieb", "layout");
  revalidatePath("/admin/neu", "layout");
  revalidatePath(`/admin/neu/vertrieb/kontakte/${contactId}`);
}

/** Entwurf einer Vorlage (Widerspruch, Löschung, Auskunft) aus der Akte. */
export async function rechtsEntwurfAction(contactId: string, vorlage: VorlagenArt): Promise<Entwurf> {
  await requireAuth();
  if (!contactId || !istVorlagenArt(vorlage)) return { ok: false, fehler: "Vorlage unbekannt." };
  const { rechtsVorlageEntwurf } = await import("@/lib/vertrieb/datenschutz-recht-server");
  return rechtsVorlageEntwurf(contactId, vorlage);
}

/** Geprüften Entwurf im Instantly-Thread senden (nur auf Knopfdruck). */
export async function rechtsSendenAction(input: { contactId: string; fallId: string; vorlage: VorlagenArt; betreff: string; text: string }): Promise<{ ok: true } | { ok: false; fehler: string }> {
  const session = await requireAuth();
  if (!input.contactId || !input.fallId || !istVorlagenArt(input.vorlage)) return { ok: false, fehler: "Angaben fehlen." };
  const { rechtsVorlageSenden } = await import("@/lib/vertrieb/datenschutz-recht-server");
  const r = await rechtsVorlageSenden(input.contactId, { fallId: input.fallId, vorlage: input.vorlage, betreff: String(input.betreff ?? ""), text: String(input.text ?? ""), wer: session.email });
  refresh(input.contactId);
  return r;
}

/** Ohne Senden als beantwortet vermerken (z. B. im Postfach geantwortet, Abmahnung erledigt). */
export async function rechtsBeantwortetAction(contactId: string, fallId: string): Promise<{ ok: true } | { ok: false; fehler: string }> {
  const session = await requireAuth();
  const fall = await prisma.datenschutzFallEreignis.findFirst({ where: { fallId, contactId, ereignis: "eingang" }, select: { art: true } });
  if (!fall) return { ok: false, fehler: "Fall nicht gefunden." };
  const { antwortProtokollieren } = await import("@/lib/vertrieb/datenschutz-recht-server");
  await antwortProtokollieren(fallId, { at: new Date(), wer: session.email, detail: "manuell" });
  await audit("vertrieb.datenschutz_antwort", { entity: "SalesContact", entityId: contactId, details: { fallId, vorlage: "manuell" } });
  refresh(contactId);
  return { ok: true };
}
