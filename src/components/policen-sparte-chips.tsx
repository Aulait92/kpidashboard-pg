"use client";

// Sparten-Wahl mit einem Tipp direkt im Spickzettel der Terminvorbereitung (Policen auslesen, Paket 3): gleiche Aktion
// wie auf der Vertragsseite (sparteAction, Rechtsprüfung K2: Sparte vom Vermittler, danach wird ausgelesen).

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { sparteAction } from "@/app/buyer/termine/[id]/vorbereitung/vertraege/actions";

export function PolicenSparteChips({ terminId, documentId, sparten, readOnly }: { terminId: string; documentId: string; sparten: { wert: string; label: string }[]; readOnly: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const waehle = (s: string) =>
    start(async () => {
      const r = await sparteAction(terminId, documentId, s);
      if (!r.ok) toast.show({ message: r.error ?? "Fehler", tone: "error" });
      else if (r.status !== "ausgelesen") toast.show({ message: r.status === "sparte_abweichend" ? "Passt nicht zur gewählten Sparte. Bitte im Original nachsehen." : "Nicht ausgelesen. Bitte im Original nachsehen.", tone: "error" });
      router.refresh();
    });
  return (
    <div className="mt-2 flex flex-wrap gap-1.5" data-sparte-waehlen>
      {sparten.map((s) => (
        <Button key={s.wert} onClick={() => waehle(s.wert)} disabled={pending || readOnly}>
          {s.label}
        </Button>
      ))}
    </div>
  );
}
