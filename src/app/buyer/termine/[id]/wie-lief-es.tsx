"use client";

// „Wie lief der Termin?“ auf der Terminseite (UX-Runde Team C, 19.11.2026). Wer: Vermittler direkt nach dem Termin, oft am
// Handy, aus dem Push bzw. von „Heute“. Aufgabe: Ergebnis in einem Zug festhalten. Früher stand hier nur „Das Ergebnis tragen
// Sie nach dem Termin auf ‚Heute‘ ein.“ (Sackgasse). Jetzt: Abschluss mit einem Tipp (Hauptaktion), danach inline Beitrag,
// Provision und Glückwunsch wie im Abschluss-Blatt (/buyer/abschluss); „Angebot senden“ öffnet das Blatt aus P3; alles
// andere (Wiedervorlage, nicht erschienen, verloren) über das bestehende Ergebnis-Blatt.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Send, Trophy } from "lucide-react";
import { Button, buttonClass, Card } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { AbschlussNachherInhalt } from "@/components/abschluss-nachher";
import { AngebotSendenSheet } from "@/components/angebot-senden";
import { NextStepButton } from "@/components/next-step";
import { undoInboxAction } from "@/app/buyer/inbox-actions";
import { terminAbschlussAction } from "./actions";
import { gebeugt } from "@/lib/ansprache";

export function WieLiefEs({
  appointmentId,
  leadId,
  label,
  name,
  angebotOffen,
  readOnly,
  erledigt = null,
}: {
  appointmentId: string;
  leadId: string;
  /** „Frau Kraus“ */
  label: string;
  /** Voller Name für Blätter */
  name: string;
  /** Angebot noch nicht raus: „Angebot senden“ als Zweitknopf */
  angebotOffen: boolean;
  readOnly: boolean;
  /** Ergebnis steht schon (Termin erledigt): nur der Stand mit Terminzeit, z. B. „Do., 19. Nov., 09:00 Uhr“ */
  erledigt?: { zeit: string } | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [stand, setStand] = useState<"frage" | "abschluss">("frage");
  const [angebot, setAngebot] = useState(false);

  const abschluss = () =>
    start(async () => {
      const r = await terminAbschlussAction(appointmentId);
      if (!r.ok) return toast.show({ message: r.error, tone: "error" });
      setStand("abschluss");
      const undo = r.undo;
      toast.show({
        message: `${label}: Abschluss gespeichert`,
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

  if (stand === "abschluss") {
    return (
      <Card className="p-5" data-wie-lief-es="abschluss">
        <AbschlussNachherInhalt
          leadId={leadId}
          onDone={() => {
            setStand("frage");
            router.refresh();
          }}
        />
      </Card>
    );
  }

  if (erledigt) {
    return (
      <Card className="p-5" data-wie-lief-es="erledigt">
        <p className="flex items-center gap-2 text-lg font-semibold">
          <Check className="h-5 w-5 text-emerald-600" /> Ergebnis eingetragen
        </p>
        <p className="mt-1 text-sm text-[color:var(--muted)]">{erledigt.zeit}</p>
      </Card>
    );
  }

  return (
    <Card className="p-5" tone="attention" data-wie-lief-es="frage">
      <p className="text-lg font-semibold">Wie lief der Termin mit {gebeugt(label)}?</p>
      {readOnly ? null : (
        <>
          <div className="mt-3 grid gap-2 sm:flex sm:flex-wrap">
            <Button variant="primary" size="md" icon={Trophy} disabled={pending} onClick={abschluss} data-termin-abschluss>
              Abschluss
            </Button>
            {angebotOffen ? (
              <Button size="md" icon={Send} disabled={pending} onClick={() => setAngebot(true)} data-termin-angebot>
                Angebot senden
              </Button>
            ) : null}
            {/* Wiedervorlage, nicht erschienen, verloren: das bestehende Ergebnis-Blatt (wie auf „Heute“) */}
            <NextStepButton leadId={leadId} name={name} appointmentId={appointmentId} label="Anderes Ergebnis" className={buttonClass("ghost", "md", "rounded-[var(--radius-sm)] border-transparent bg-transparent text-[color:var(--foreground)] hover:bg-[color:var(--surface-sunken)]")} />
          </div>
        </>
      )}
      <AngebotSendenSheet
        ziel={angebot ? { appointmentId, name } : null}
        onClose={() => setAngebot(false)}
        onError={(message) => toast.show({ message, tone: "error" })}
        onDone={(message) => {
          setAngebot(false);
          toast.show({ message });
          router.refresh();
        }}
      />
    </Card>
  );
}
