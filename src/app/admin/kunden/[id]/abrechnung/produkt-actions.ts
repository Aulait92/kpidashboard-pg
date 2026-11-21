"use server";

// Admin: gebuchte Produkte starten (Budget + Monatspreis gelten ab dann), Anfragen
// übernehmen oder Buchungen ablehnen (Einrichtung wird zurückgenommen).

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminZiel } from "@/components/admin-neu/ui/rueckweg";
import { getCurrentSession } from "@/lib/auth";
import { acceptProductRequest, adminProduktAnlegen, rejectProduct, startProduct } from "@/lib/produkt-buchen";

export async function decideProductAction(fd: FormData): Promise<void> {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") throw new Error("Nur Admins.");
  const customerId = String(fd.get("customerId") ?? "");
  const bookingId = String(fd.get("bookingId") ?? "");
  const decision = String(fd.get("decision") ?? "");
  const note = String(fd.get("note") ?? "").trim() || null;
  const actor = { id: session.userId, email: session.email, role: session.role };
  const r =
    decision === "start"
      ? await startProduct(bookingId, actor)
      : decision === "accept"
        ? await acceptProductRequest(bookingId, note, actor)
        : await rejectProduct(bookingId, note, actor);
  revalidatePath(`/admin/neu/kunden/${customerId}`, "layout");
  revalidatePath("/admin/neu", "layout"); // neuer Admin (Kundenakte)
  const done = decision === "start" ? "Produkt gestartet, Kunde informiert." : decision === "accept" ? "Anfrage übernommen, Kunde informiert." : "Buchung abgelehnt, Kunde informiert.";
  const msg = r.ok ? (r.note ? `${done} ${r.note}` : done) : r.error;
  redirect(await adminZiel(`/admin/neu/kunden/${customerId}/abrechnung?produkt=${encodeURIComponent(msg)}${r.ok ? "" : "&fehler=1"}`));
}

/** Admin: Produkt für den Kunden anlegen, ohne Aufpreis (Ole, 21.11.2026). */
export async function adminProduktAnlegenAction(fd: FormData): Promise<void> {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") throw new Error("Nur Admins.");
  const customerId = String(fd.get("customerId") ?? "");
  const r = await adminProduktAnlegen({
    customerId,
    product: String(fd.get("product") ?? ""),
    dailyBudget: Number(String(fd.get("dailyBudget") ?? "").replace(",", ".")),
    actor: { id: session.userId, email: session.email, role: session.role },
  });
  revalidatePath(`/admin/neu/kunden/${customerId}`, "layout");
  revalidatePath("/admin/neu", "layout");
  const msg = r.ok ? `Produkt angelegt (In Einrichtung). ${r.note ?? ""}`.trim() : r.error;
  redirect(await adminZiel(`/admin/neu/kunden/${customerId}/abrechnung?produkt=${encodeURIComponent(msg)}${r.ok ? "" : "&fehler=1"}`));
}
