"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteTestCustomerAction } from "@/app/admin/kunden/[id]/test-actions";

/** Abzeichen „Test“ mit Knopf zum Löschen des Testkunden (Kundenakte). */
export function TestkundeLoeschen({
  customerId,
  name,
  whatsapp,
  zurueck = "/admin/neu/kunden",
}: {
  customerId: string;
  name: string;
  whatsapp: string | null;
  /** Ziel nach dem Löschen (neuer Admin: /admin/neu/kunden) */
  zurueck?: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const onDelete = () => {
    const hint = whatsapp
      ? `\n\nWichtig: Die WhatsApp-Nummer ${whatsapp} läuft bei 360dialog weiter, bis Du sie dort kündigst (360dialog Hub, Nummer, Kündigen).`
      : "";
    if (!window.confirm(`Testkunden „${name}“ mit allen Leads, Chats, Logins und dem Testangebot löschen?${hint}`)) return;
    start(async () => {
      const r = await deleteTestCustomerAction(customerId);
      if (!r.ok) {
        setError(r.error ?? "Löschen hat nicht geklappt.");
        return;
      }
      router.push(zurueck);
    });
  };
  return (
    <span className="inline-flex items-center gap-2" data-testkunde>
      <span className="badge bg-amber-100 text-amber-900">Test</span>
      <button type="button" onClick={onDelete} disabled={pending} className="inline-flex items-center gap-1 text-sm font-medium text-rose-700 hover:underline disabled:opacity-50">
        <Trash2 className="h-3.5 w-3.5" /> {pending ? "Wird gelöscht…" : "Testkunden löschen"}
      </button>
      {error ? <span className="text-sm text-rose-700">{error}</span> : null}
    </span>
  );
}
