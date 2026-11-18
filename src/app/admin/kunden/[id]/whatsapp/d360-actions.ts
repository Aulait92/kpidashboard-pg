"use server";

import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/lib/auth";

export type D360AssignState = { ok?: boolean; message?: string; error?: string; schritte?: { ok: boolean; text: string }[] };

function describe(r: Awaited<ReturnType<typeof import("@/lib/whatsapp/dialog360-match").checkConnection>>): D360AssignState {
  if (r.status === "connected") return { ok: true, message: `Verbunden${r.phone ? `: +${r.phone.replace(/^\+/, "")}` : ""}. Vorlagen werden eingereicht.` };
  if (r.status === "pending") return { ok: true, message: r.activation ? "Zugeordnet. Die Nummer wartet auf Freischaltung bei 360dialog (Partner Hub), der Cron holt den Key danach." : "Zugeordnet, Nummer wird eingerichtet. Der Cron holt den Key." };
  if (r.status === "not_found") return { error: "Keine passende Nummer gefunden (Kunden-ID bzw. Login-E-Mail). Unten von Hand zuordnen." };
  if (r.status === "ambiguous") return { error: `${r.count} passende Nummern gefunden. Bitte unten von Hand zuordnen.` };
  return { error: r.reason };
}

/** Admin: „Verbindung prüfen“ für einen Kunden bzw. eine freie Nummer zuordnen. */
export async function d360AssignAction(_prev: D360AssignState, fd: FormData): Promise<D360AssignState> {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") return { error: "Nicht erlaubt." };
  const customerId = String(fd.get("customerId") ?? "");
  const channelId = String(fd.get("channelId") ?? "");
  if (!customerId) return { error: "Kunde fehlt." };
  const m = await import("@/lib/whatsapp/dialog360-match");
  const r = channelId ? await m.assignChannel(customerId, channelId, session.userId ?? null) : await m.checkConnection(customerId, { id: session.userId ?? undefined, role: "ADMIN" });
  revalidatePath(`/admin/kunden/${customerId}/whatsapp`);
  revalidatePath("/admin/neu", "layout"); // neuer Admin (Kundenakte)
  return describe(r);
}

/** Admin: halb fertige 360dialog-Verbindung zurücksetzen (lib/whatsapp/dialog360-match.ts). */
export async function d360ResetAction(_prev: D360AssignState, fd: FormData): Promise<D360AssignState> {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") return { error: "Nicht erlaubt." };
  const customerId = String(fd.get("customerId") ?? "");
  if (!customerId) return { error: "Kunde fehlt." };
  const { resetUnfinishedConnection } = await import("@/lib/whatsapp/dialog360-match");
  const r = await resetUnfinishedConnection(customerId, { id: session.userId ?? undefined, role: "ADMIN" });
  if (r.status === "none") return { ok: true, message: "Es gibt keine Verbindung, die zurückgesetzt werden müsste." };
  if (r.status === "connected") return { error: "WhatsApp ist verbunden. Eine aktive Verbindung wird hier nicht zurückgesetzt." };
  revalidatePath(`/admin/kunden/${customerId}/whatsapp`);
  revalidatePath("/buyer/einrichtung");
  revalidatePath("/admin/neu", "layout"); // neuer Admin (Kundenakte)
  return { ok: true, message: "Zurückgesetzt. Der Kunde sieht wieder „WhatsApp verbinden“." };
}

/**
 * Admin: „Verbindung reparieren“ (Admin v2 A5, Ole 18.11.2026): Nummer suchen bzw. Webhook neu setzen, notfalls neuer Key,
 * danach Vorlagen abgleichen (lib/whatsapp/dialog360-match.ts repairConnection). Ein Knopf, Ergebnis je Schritt ein Satz.
 */
export async function d360RepairAction(_prev: D360AssignState, fd: FormData): Promise<D360AssignState> {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") return { error: "Nicht erlaubt." };
  const customerId = String(fd.get("customerId") ?? "");
  if (!customerId) return { error: "Kunde fehlt." };
  const { repairConnection } = await import("@/lib/whatsapp/dialog360-match");
  const r = await repairConnection(customerId, { id: session.userId ?? undefined, role: "ADMIN" });
  revalidatePath(`/admin/kunden/${customerId}/whatsapp`);
  revalidatePath("/admin/neu", "layout"); // neuer Admin (Kundenakte)
  return { ok: r.ok, schritte: r.schritte, ...(r.ok ? { message: "Verbindung läuft." } : { error: "Nicht alles ließ sich beheben." }) };
}
