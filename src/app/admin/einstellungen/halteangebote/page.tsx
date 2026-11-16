import Link from "next/link";
import { connection } from "next/server";
import { loadHalteSettings } from "@/lib/halteangebote-server";
import { requireAuth } from "@/lib/vertrieb/auth";
import { HalteForm } from "./form";
import { AdminBack } from "@/components/admin/admin-back";

export const metadata = { title: "Halteangebote | performancegrowth Admin" };

// Halteangebote beim Kündigen (Ole, 15.11.2026): je Angebot an/aus, Werte. Regeln: lib/halteangebote.ts.
export default async function HalteangebotePage() {
  await connection();
  await requireAuth();
  const s = await loadHalteSettings();
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6">
      <AdminBack href="/admin/einstellungen">Einstellungen</AdminBack>
      <h1 className="mb-1 mt-1 text-2xl font-semibold tracking-tight">Halteangebote</h1>
      <p className="mb-6 text-sm text-[color:var(--muted)]">
        Was Kunden im Kündigungsfenster je Grund angeboten wird. „Trotzdem kündigen“ steht immer auf jedem Schritt. Jede Annahme erzeugt Push und Aufgabe; die
        Auswertung steht unter <Link href="/admin/zahlen/lebenszyklus" className="underline">Zahlen → Kündigung & Rückkehr</Link>.
      </p>
      <HalteForm s={s} />
    </main>
  );
}
