"use client";

// Bestandsübertragung (Maklervollmacht, Ole 18.11.2026): Ein-Klick „Bestätigt“ / „Abgelehnt“ je Versicherer bzw. Vertrag.
// Genutzt in der Karte „Maklervollmacht“, in der Wiedervorlage „Übertragung bei … bestätigt?“ und in der Vertragsliste.
// Fehlt der Beitrag, fragt „Bestätigt“ einmal den Monatsbeitrag ab (optional, leer lassen geht).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { uebertragungAction } from "@/app/buyer/vollmacht-actions";

type Ziel = { versicherer: string } | { contractId: string };

export function UebertragungKnoepfe({ leadId, ziel, beitragFragen, label }: { leadId: string; ziel: Ziel; beitragFragen: boolean; label?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, start] = useTransition();
  const [frage, setFrage] = useState(false);
  const [beitrag, setBeitrag] = useState("");

  const senden = (ergebnis: "bestaetigt" | "abgelehnt", monatsbeitrag?: string) =>
    start(async () => {
      const r = await uebertragungAction(leadId, ziel, ergebnis, monatsbeitrag ?? null);
      if (!r.ok) return toast.show({ message: r.error, tone: "error" });
      toast.show({ message: r.message ?? "Gespeichert" });
      setFrage(false);
      router.refresh();
    });

  if (frage) {
    return (
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          senden("bestaetigt", beitrag);
        }}
        data-uebertragung-beitrag
      >
        <label className="min-w-0 basis-full text-sm sm:basis-auto sm:flex-1">
          <span className="text-[color:var(--muted)]">Monatsbeitrag (optional)</span>
          <input
            inputMode="decimal"
            autoFocus
            value={beitrag}
            onChange={(e) => setBeitrag(e.target.value)}
            placeholder="z. B. 12,50"
            className="mt-1 block h-10 w-full min-w-0 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-base"
          />
        </label>
        <Button type="submit" variant="secondary" size="sm" icon={Check} disabled={busy} className="h-10">
          Bestätigen
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setFrage(false)} className="h-10">
          Abbrechen
        </Button>
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2" data-uebertragung-knoepfe>
      {label ? <span className="text-sm text-amber-800">{label}</span> : null}
      <Button variant="secondary" size="sm" icon={Check} disabled={busy} onClick={() => (beitragFragen ? setFrage(true) : senden("bestaetigt"))} data-uebertragung-bestaetigt>
        Bestätigt
      </Button>
      <Button
        variant="ghost"
        size="sm"
        icon={X}
        disabled={busy}
        onClick={() => {
          if (!window.confirm("Übertragung abgelehnt? Der Vertrag zählt dann nicht in Ihren Zahlen.")) return;
          senden("abgelehnt");
        }}
        data-uebertragung-abgelehnt
      >
        Abgelehnt
      </Button>
    </div>
  );
}
