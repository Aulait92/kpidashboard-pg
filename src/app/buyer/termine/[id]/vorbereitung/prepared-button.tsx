"use client";

import { useTransition } from "react";
import { Check, RotateCcw } from "lucide-react";
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
  return prepared ? (
    <Button variant="secondary" size="md" icon={RotateCcw} disabled={pending || readOnly} onClick={() => run(false)}>
      Doch nicht vorbereitet
    </Button>
  ) : (
    <Button variant="primary" size="md" icon={Check} disabled={pending || readOnly} onClick={() => run(true)} data-termin-vorbereitet>
      Vorbereitet
    </Button>
  );
}
