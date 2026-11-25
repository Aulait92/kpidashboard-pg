"use client";

// „Ist Frau Becker da?“ am Termin (Show-up-Paket, Ole 17.11.2026): dieselbe Frage im Entscheidungsblatt (Deep-Link
// aus dem Push, /buyer/termine/<id>) und auf „Heute“. Regeln in lib/showup.ts (anwesenheitsFrage):
//   start    Ja, da · Fehlt noch
//   wartet   WhatsApp mit dem Link ist raus (bzw. nicht möglich) · Anrufen · Ist doch da
//   nachher  Ja, gekommen · Nein (→ nicht erschienen, No-Show-Rettung)
// Eine Hauptaktion je Zustand; alles andere bleibt in den bestehenden Aktionen des Termins.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Phone, UserX } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { anwesenheitAction } from "@/app/buyer/showup-actions";
import { undoInboxAction } from "@/app/buyer/inbox-actions";
import type { WartetErgebnis } from "@/lib/showup-server";
import { gebeugt } from "@/lib/ansprache";

export type AnwesenheitsStand = "start" | "wartet" | "nachher";

export function TerminAnwesenheit({
  appointmentId,
  label,
  stand,
  phone,
  wa = null,
  gross = false,
  readOnly = false,
}: {
  appointmentId: string;
  /** „Frau Becker“ */
  label: string;
  stand: AnwesenheitsStand;
  /** Nummer für den Anruf-Knopf (ohne +) */
  phone: string | null;
  /** Ergebnis der WhatsApp nach „Fehlt noch“, falls bekannt */
  wa?: WartetErgebnis | null;
  /** Entscheidungsblatt: große Knöpfe untereinander (Handy) */
  gross?: boolean;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [lokal, setLokal] = useState<{ stand: AnwesenheitsStand | "fertig"; wa: WartetErgebnis | null } | null>(null);
  const jetzt = lokal?.stand ?? stand;
  const waJetzt = lokal?.wa ?? wa;

  const antworte = (antwort: "da" | "fehlt" | "nicht_gekommen") =>
    start(async () => {
      const r = await anwesenheitAction(appointmentId, antwort);
      if (!r.ok) {
        toast.show({ message: r.error, tone: "error" });
        return;
      }
      if (antwort === "fehlt") {
        setLokal({ stand: "wartet", wa: r.wa ?? null });
        toast.show({ message: r.wa === "nicht_moeglich" ? `WhatsApp an ${gebeugt(label)} nicht möglich. Bitte anrufen.` : `${label} hat den Link per WhatsApp bekommen.` });
      } else {
        setLokal({ stand: "fertig", wa: null });
        const undo = r.undo;
        toast.show({
          message: antwort === "nicht_gekommen" ? `${label}: nicht erschienen. Der Assistent fragt nach einem neuen Termin.` : `${label}: erschienen`,
          ...(undo
            ? {
                actionLabel: "Rückgängig",
                onAction: () =>
                  start(async () => {
                    await undoInboxAction(undo);
                    setLokal(null);
                    router.refresh();
                  }),
              }
            : {}),
        });
      }
      router.refresh();
    });

  if (jetzt === "fertig") return null;
  // Auf „Heute“ steht der Name schon in der Zeile: kürzer
  const fehlt = gross ? `${label} fehlt noch.` : "Fehlt noch:";
  const frage =
    jetzt === "nachher"
      ? `Ist ${label} noch gekommen?`
      : jetzt === "wartet"
        ? waJetzt === "nicht_moeglich"
          ? `${fehlt} ${gross ? "WhatsApp nicht möglich, bitte anrufen." : "bitte anrufen."}`
          : waJetzt
            ? `${fehlt} ${gross ? "Der Link ist per WhatsApp raus." : "Link ist per WhatsApp raus."}`
            : `${label} fehlt noch.`
        : `Ist ${label} da?`;
  const size = gross ? "md" : "sm";
  const reihe = gross ? "mt-3 grid gap-2 sm:flex sm:flex-wrap" : "mt-1.5 flex flex-wrap gap-2";
  const anrufen = phone ? (
    <ButtonLink href={`tel:+${phone}`} variant={jetzt === "wartet" ? "primary" : "secondary"} size={size} icon={Phone}>
      Anrufen
    </ButtonLink>
  ) : null;

  return (
    <div data-termin-anwesenheit={jetzt} onClick={(e) => e.stopPropagation()}>
      <p className={gross ? "text-lg font-semibold" : "text-xs font-semibold text-[color:var(--foreground)]"}>{frage}</p>
      {readOnly ? null : jetzt === "start" ? (
        <div className={reihe}>
          <Button variant="primary" size={size} icon={Check} disabled={pending} onClick={() => antworte("da")}>
            Ja, da
          </Button>
          <Button size={size} icon={UserX} disabled={pending} onClick={() => antworte("fehlt")}>
            Fehlt noch, erinnern
          </Button>
        </div>
      ) : jetzt === "wartet" ? (
        <div className={reihe}>
          {anrufen}
          <Button size={size} icon={Check} disabled={pending} onClick={() => antworte("da")}>
            Ist doch da
          </Button>
        </div>
      ) : (
        <div className={reihe}>
          <Button variant="primary" size={size} icon={Check} disabled={pending} onClick={() => antworte("da")}>
            Ja, gekommen
          </Button>
          <Button size={size} icon={UserX} disabled={pending} onClick={() => antworte("nicht_gekommen")}>
            Nein
          </Button>
        </div>
      )}
    </div>
  );
}
