"use server";

// Link zur Vertriebspräsentation (Ole, 15.11.2026): nur Admins; 14 Tage gültig, verlängerbar, beendbar.

import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/lib/auth";
import { getAppUrl } from "@/lib/email";
import { isVerkaufsAudience } from "@/lib/vertrieb/verkaufspraesentation";
import { verkaufsLinkBeenden, verkaufsLinkErstellen } from "@/lib/vertrieb/verkaufspraesentation-server";

const datum = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "numeric", month: "long" }).format(d);

export async function verkaufsLinkAction(contactId: string, audience: string): Promise<{ ok: true; url: string; bis: string } | { ok: false; error: string }> {
  const s = await getCurrentSession();
  if (!s || s.role !== "ADMIN") return { ok: false, error: "Nicht berechtigt." };
  if (!isVerkaufsAudience(audience)) return { ok: false, error: "Ungültige Fassung." };
  const l = await verkaufsLinkErstellen(contactId, audience, s.userId);
  if (!l) return { ok: false, error: "Kontakt nicht gefunden." };
  revalidatePath(`/admin/vertrieb/kontakte/${contactId}`);
  return { ok: true, url: `${getAppUrl()}/praesentation/${l.token}`, bis: datum(l.bis) };
}

export async function verkaufsLinkBeendenAction(contactId: string): Promise<{ ok: boolean; error?: string }> {
  const s = await getCurrentSession();
  if (!s || s.role !== "ADMIN") return { ok: false, error: "Nicht berechtigt." };
  await verkaufsLinkBeenden(contactId);
  revalidatePath(`/admin/vertrieb/kontakte/${contactId}`);
  return { ok: true };
}
