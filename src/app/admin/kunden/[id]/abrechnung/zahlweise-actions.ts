"use server";

// Admin → Kundenakte → Abrechnung: Überweisung erlauben (Zahlungsziel) und Mahnungen je Kunde stoppen
// (Ole, 17.11.2026, lib/ueberweisung.ts und lib/mahnwesen-server.ts). Beides mit Audit-Eintrag.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminZiel } from "@/components/admin-neu/ui/rueckweg";
import { getCurrentSession } from "@/lib/auth";

async function admin() {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") throw new Error("Nur Admins.");
  return { id: session.userId, email: session.email ?? null, role: "ADMIN" };
}

async function back(id: string, msg: string, failed = false): Promise<never> {
  revalidatePath(`/admin/neu/kunden/${id}`, "layout");
  revalidatePath("/admin/neu", "layout");
  redirect(await adminZiel(`/admin/neu/kunden/${id}/abrechnung?zahlweise=${encodeURIComponent(msg)}${failed ? "&fehler=1" : ""}`));
}

export async function saveUeberweisungAction(fd: FormData): Promise<void> {
  const actor = await admin();
  const id = String(fd.get("customerId") ?? "");
  const { setzeUeberweisungKunde } = await import("@/lib/ueberweisung");
  const res = await setzeUeberweisungKunde(id, { allow: fd.get("allow") === "on", days: fd.get("days") }, actor);
  if (!res.ok) return back(id, res.error, true);
  return back(id, res.hinweis ? `Gespeichert. ${res.hinweis}` : "Zahlweise gespeichert.");
}

export async function saveMahnStoppAction(fd: FormData): Promise<void> {
  const actor = await admin();
  const id = String(fd.get("customerId") ?? "");
  const stop = fd.get("stop") === "on";
  const { setzeMahnStopp } = await import("@/lib/mahnwesen-server");
  const res = await setzeMahnStopp(id, stop, String(fd.get("grund") ?? ""), actor);
  if (!res.ok) return back(id, res.error, true);
  return back(id, stop ? "Mahnungen gestoppt." : "Mahnungen laufen wieder.");
}
