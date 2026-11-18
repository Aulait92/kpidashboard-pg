"use client";

// Entscheidungsblatt „Hat Frau Becker abgeschlossen?“ (P4, Ole 17.11.2026), Ziel des Vorabend-Pushes und der Meldung aus
// dem Chat. Je Kontakt eine Karte wie beim Blatt „Ist Frau Becker da?“ (components/termin-anwesenheit.tsx):
//   Frage       [Ja, abgeschlossen] (Hauptaktion) · [Noch nicht] · klein „Nachfassen 1 Woche pausieren“ (nur wenn es läuft)
//   nach „Ja“   gleicher Inhalt wie nach jedem Tipp auf „Abschluss“ (Beitrag, Provision, Glückwunsch), inline
//   „Noch nicht“ Karte klappt zu, alles läuft weiter

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, PauseCircle, Trophy, X } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { AbschlussNachherInhalt } from "@/components/abschluss-nachher";
import { abschlussEintragenAction, nachfassenPausierenAction } from "@/app/buyer/abschluss-actions";
import { undoInboxAction } from "@/app/buyer/inbox-actions";
import type { BlattEintrag } from "@/lib/abschluss-server";
import { abschlussFrage } from "@/lib/abschluss";

export function AbschlussBlattKarte({ eintrag, mehrere = false }: { eintrag: BlattEintrag; mehrere?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [stand, setStand] = useState<"frage" | "nachher" | "fertig" | "weiter" | "pausiert">(eintrag.geschlossen ? "nachher" : "frage");

  const ja = () =>
    start(async () => {
      const r = await abschlussEintragenAction(eintrag.leadId);
      if (!r.ok) return toast.show({ message: r.error, tone: "error" });
      setStand("nachher");
      const undo = r.undo;
      toast.show({
        message: `${eintrag.label}: Abschluss gespeichert`,
        ...(undo
          ? {
              actionLabel: "Rückgängig",
              onAction: () =>
                start(async () => {
                  await undoInboxAction(undo);
                  setStand("frage");
                  router.refresh();
                }),
            }
          : {}),
      });
    });

  const pausieren = () =>
    start(async () => {
      const r = await nachfassenPausierenAction(eintrag.leadId);
      if (!r.ok) return toast.show({ message: r.error, tone: "error" });
      setStand("pausiert");
      toast.show({ message: `${eintrag.label}: Nachfassen 1 Woche pausiert` });
    });

  if (stand === "fertig" || stand === "weiter" || stand === "pausiert") {
    return (
      <Card className="px-5 py-3">
        <p className="flex items-center gap-2 text-sm text-[color:var(--muted)]" data-blatt-erledigt={stand}>
          <Check className="h-4 w-4 text-emerald-600" />
          {eintrag.label}: {stand === "fertig" ? "Abschluss gespeichert" : stand === "pausiert" ? "Nachfassen 1 Woche pausiert" : "Nachfassen läuft weiter"}
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-5" tone={stand === "frage" ? "attention" : "default"}>
      <div data-abschluss-blatt={stand}>
        {stand === "frage" ? (
          <>
            <p className="text-sm text-[color:var(--muted)]">{eintrag.kontext}</p>
            <p className="mt-2 text-lg font-semibold">{abschlussFrage([eintrag.label])}</p>
            <div className="mt-3 grid gap-2 sm:flex sm:flex-wrap">
              <Button variant="primary" size="md" icon={Trophy} disabled={pending} onClick={ja}>
                Ja, abgeschlossen
              </Button>
              <Button size="md" icon={X} disabled={pending} onClick={() => setStand("weiter")}>
                Noch nicht
              </Button>
            </div>
            {eintrag.nachfassenLaeuft && !eintrag.gemeldet ? (
              <button
                type="button"
                disabled={pending}
                onClick={pausieren}
                className="mt-3 inline-flex h-10 items-center gap-1.5 text-sm font-medium text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
              >
                <PauseCircle className="h-4 w-4" /> Nachfassen 1 Woche pausieren
              </button>
            ) : null}
          </>
        ) : (
          <>
            {mehrere ? <p className="mb-3 text-sm font-semibold">{eintrag.label}</p> : null}
            <AbschlussNachherInhalt leadId={eintrag.leadId} onDone={() => setStand("fertig")} />
          </>
        )}
      </div>
    </Card>
  );
}
