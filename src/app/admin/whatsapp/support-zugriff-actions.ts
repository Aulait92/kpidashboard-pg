"use server";

import { getCurrentSession } from "@/lib/auth";
import { starteSupportZugriff } from "@/lib/support-zugriff";

// Support-Zugriff auf ein Dokument im Admin-Chat (Ole, 25.11.2026, lib/support-zugriff.ts): Grund prüfen, Protokoll,
// Mitteilung an den Vermittler, dann signierter Link (15 Minuten). Nur Admins.
export async function supportZugriffAction(messageId: string, grund: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") return { ok: false, error: "Nicht erlaubt." };
  if (typeof messageId !== "string" || !messageId) return { ok: false, error: "Datei nicht gefunden." };
  const r = await starteSupportZugriff({ admin: { userId: session.userId, email: session.email }, messageId, grund });
  return r.ok ? { ok: true, url: r.url } : { ok: false, error: r.fehler };
}
