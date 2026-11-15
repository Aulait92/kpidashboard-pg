"use client";

import { useTransition } from "react";
import { Check, Circle } from "lucide-react";
import { Button } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { setPreparedAction } from "./actions";

/** „Vorbereitet“ abhaken bzw. zurücknehmen (Aufgabe auf „Heute“ verschwindet). */
export function PreparedButton({ id, prepared, readOnly }: { id: string; prepared: boolean; readOnly?: boolean }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const run = (next: boolean) =>
    start(async () => {
      const r = await setPreparedAction(id, next);
      toast.show(r.ok ? { message: next ? "Als vorbereitet abgehakt" : "Wieder offen" } : { message: r.error ?? "Fehler", tone: "error" });
    });
  // Haken statt Hauptknopf (UX, Ole 15.11.2026): erledigt grün, sonst ruhig; erneuter Klick nimmt es zurück
  return (
    <Button
      variant="secondary"
      size="md"
      icon={prepared ? Check : Circle}
      disabled={pending || readOnly}
      onClick={() => run(!prepared)}
      className={prepared ? "border-emerald-300 bg-emerald-50 text-emerald-800" : undefined}
      title={prepared ? "Antippen, um es zurückzunehmen" : undefined}
      data-termin-vorbereitet
    >
      {prepared ? "Vorbereitet" : "Als vorbereitet abhaken"}
    </Button>
  );
}
