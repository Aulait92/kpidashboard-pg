"use server";

import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/lib/auth";

export type D360AssignState = { ok?: boolean; message?: string; error?: string };

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
  return { ok: true, message: "Zurückgesetzt. Der Kunde sieht wieder „WhatsApp verbinden“." };
}
