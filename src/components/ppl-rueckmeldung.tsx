"use client";

// Rückmeldung mit einem Tipp in der Leadliste (Pay-per-Lead, Ole 25.11.2026). Wer: der Käufer direkt nach dem Anruf,
// meist am Handy. Sichtbar ist die eine naheliegende Rückmeldung (neu bzw. nicht erreicht: „Erreicht“, erreicht:
// „Termin vereinbart“), die übrigen stehen hinter „Mehr“ im Auswahlfenster. Wirkt sofort, Toast mit „Rückgängig“.
// „Nicht erreicht“ legt die Wiedervorlage für den nächsten Werktag 9 Uhr an (lib/ppl/rueckmeldung-server.ts).

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CalendarCheck, MoreHorizontal, PhoneCall, PhoneMissed } from "lucide-react";
import { undoInboxAction } from "@/app/buyer/inbox-actions";
import { pplRueckmeldungResult } from "@/app/buyer/rueckmeldung-actions";
import { Button } from "@/components/ui";
import { ActionSheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { naechsterWerktag9, RUECKMELDUNG_ARTEN, RUECKMELDUNG_LABEL, wiedervorlageText, type RueckmeldungArt } from "@/lib/ppl/rueckmeldung";

const ICON = { erreicht: PhoneCall, nicht_erreicht: PhoneMissed, termin: CalendarCheck } as const;
const FRUEH = new Set(["", "neuer lead", "nicht erreicht"]);
const ERREICHT = new Set(["erreicht", "im gespräch", "qualifiziert"]);

/** Welche Rückmeldung sichtbar ist; null = Lead ist schon weiter (Termin, Angebot, Abschluss …), nichts anzeigen. */
export function sichtbareRueckmeldung(status: string | null): RueckmeldungArt | null {
  const s = (status ?? "").trim().toLowerCase();
  if (FRUEH.has(s)) return "erreicht";
  if (ERREICHT.has(s)) return "termin";
  return null;
}

export function PplRueckmeldung({ leadId, name, status }: { leadId: string; name: string; status: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [mehr, setMehr] = useState(false);
  const haupt = sichtbareRueckmeldung(status);
  if (!haupt) return null;

  const melden = (art: RueckmeldungArt) =>
    startTransition(async () => {
      const r = await pplRueckmeldungResult(leadId, art);
      if (!r.ok) {
        toast.show({ message: r.error, tone: "error" });
        return;
      }
      const undo = r.undo;
      toast.show({
        message: `${name}: ${r.text ?? RUECKMELDUNG_LABEL[art]}`,
        ...(undo
          ? {
              actionLabel: "Rückgängig",
              onAction: () =>
                startTransition(async () => {
                  await undoInboxAction(undo);
                  router.refresh();
                }),
            }
          : {}),
      });
      router.refresh();
    });

  return (
    <div className="flex items-center gap-1.5" data-ppl-rueckmeldung={leadId}>
      <Button icon={ICON[haupt]} disabled={pending} onClick={() => melden(haupt)} data-art={haupt}>
        {RUECKMELDUNG_LABEL[haupt]}
      </Button>
      <Button variant="ghost" disabled={pending} onClick={() => setMehr(true)} aria-label={`Weitere Rückmeldungen zu ${name}`} className="px-2.5">
        <MoreHorizontal className="h-4 w-4" />
      </Button>
      <ActionSheet
        open={mehr}
        onClose={() => setMehr(false)}
        title={name}
        message="Wie lief Ihr Anruf?"
        actions={RUECKMELDUNG_ARTEN.filter((a) => a !== haupt).map((a) => ({
          label: a === "nicht_erreicht" ? `Nicht erreicht · ${wiedervorlageText(naechsterWerktag9())}` : RUECKMELDUNG_LABEL[a],
          icon: ICON[a],
          onSelect: () => melden(a),
        }))}
      />
    </div>
  );
}
