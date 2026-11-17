"use server";

import { revalidatePath } from "next/cache";
import { getBuyerContext } from "@/lib/buyer-context";
import { prisma } from "@/lib/prisma";

/**
 * Terminart (Ole, 17.11.2026): Der Assistent bietet nur Videotermine an (Standard an). Aus = Video zuerst, Telefon auf
 * Wunsch. Nur Inhaber.
 */
export async function setVideoOnlyAction(videoOnly: boolean): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getBuyerContext();
  if (!ctx || ctx.preview) return { ok: false, error: "In der Vorschau nicht möglich." };
  if (ctx.teamRole !== "owner") return { ok: false, error: "Nur der Inhaber kann das ändern." };
  const n = await prisma.agentConfig.updateMany({ where: { customerId: ctx.customerId }, data: { videoOnly } });
  if (!n.count) return { ok: false, error: "Der Assistent ist noch nicht eingerichtet." };
  const { audit } = await import("@/lib/audit");
  await audit("kunde.termin_nur_video", { entity: "Customer", entityId: ctx.customerId, customerId: ctx.customerId, details: { videoOnly } });
  revalidatePath("/buyer/kalender");
  return { ok: true };
}

/** Persönlichen Kalender (Berater bzw. alter Inhaber-Eintrag) trennen. Termine gehen dann in den Kalender des Inhabers. */
export async function disconnectOwnCalendarAction(): Promise<void> {
  const ctx = await getBuyerContext();
  if (!ctx || ctx.preview || !ctx.userId) return;
  await prisma.advisorCalendar.deleteMany({ where: { userId: ctx.userId } });
  revalidatePath("/buyer/kalender");
  revalidatePath("/buyer/team");
}

/** Kurzname der Buchungsseite ändern (Ole, 17.11.2026). Nur Inhaber; der alte Link leitet weiter. */
export async function setBookingSlugAction(eingabe: string): Promise<{ ok: boolean; slug?: string; url?: string; error?: string }> {
  const ctx = await getBuyerContext();
  if (!ctx || ctx.preview) return { ok: false, error: "In der Vorschau nicht möglich." };
  if (ctx.teamRole !== "owner") return { ok: false, error: "Nur der Inhaber kann den Link ändern." };
  const { setzeBuchungsSlug } = await import("@/lib/calendar/buchungslink");
  const r = await setzeBuchungsSlug(ctx.customerId, eingabe);
  if (!r.ok) return { ok: false, error: r.error };
  const { audit } = await import("@/lib/audit");
  await audit("kunde.buchungslink_geaendert", { entity: "Customer", entityId: ctx.customerId, customerId: ctx.customerId, details: { slug: r.slug } });
  const { bookingPageUrl } = await import("@/lib/public-url");
  revalidatePath("/buyer/kalender");
  return { ok: true, slug: r.slug, url: bookingPageUrl(r.slug) ?? `/book/${r.slug}` };
}
