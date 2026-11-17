"use server";

// Zahlen → Offene Posten: möglichen Zahlungseingang auf dem Geschäftskonto bestätigen oder verwerfen
// (Bankabgleich, lib/mahnwesen-server.ts). Bestätigen markiert die Rechnung in Stripe als außerhalb bezahlt.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";
import { vorschlagEntscheiden } from "@/lib/mahnwesen-server";

export async function vorschlagAction(fd: FormData): Promise<void> {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") throw new Error("Nur Admins.");
  const id = String(fd.get("id") ?? "");
  const bestaetigen = fd.get("entscheidung") === "ja";
  const res = await vorschlagEntscheiden(id, bestaetigen, { id: session.userId, email: session.email, role: "ADMIN" });
  revalidatePath("/admin/neu/zahlen/offene-posten");
  const msg = res.ok ? (bestaetigen ? "Zahlung zugeordnet, Mahnlauf beendet." : "Vorschlag verworfen.") : res.error;
  redirect(`/admin/neu/zahlen/offene-posten?${res.ok ? "ok" : "fehler"}=${encodeURIComponent(msg)}`);
}
