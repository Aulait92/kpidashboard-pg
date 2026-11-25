"use client";

// „Erinnerungen an Frau Winter“ auf der Terminseite (UX-Runde Team C; Ole, 19.11.2026: direkt hier überspringen bzw. wieder
// aktivieren). Gleiche Server-Logik wie „Nächste Nachrichten“ im Kontakt (app/buyer/nachrichtenplan-actions.ts, Paket P6),
// gleiche Begriffe: „Überspringen“ und „Doch senden“. Gesendete Erinnerungen nur zur Anzeige.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BellRing, Check, CircleAlert, SkipForward, Undo2 } from "lucide-react";
import { Card } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { nachrichtenAktion } from "@/app/buyer/nachrichtenplan-actions";
import type { Bestaetigung, ErinnerungsZeile } from "@/lib/termin-seite";
import { cn } from "@/lib/utils";
import { gebeugt } from "@/lib/ansprache";

const KNOPF = "inline-flex min-h-9 shrink-0 items-center gap-1 rounded-[var(--radius-sm)] px-2 text-[13px] font-medium hover:bg-[color:var(--surface-sunken)] disabled:opacity-50";

export function ErinnerungenBox({
  leadId,
  label,
  bestaetigung,
  zeilen: start,
  readOnly,
}: {
  leadId: string;
  /** „Frau Winter“ */
  label: string;
  bestaetigung: Bestaetigung | null;
  zeilen: ErinnerungsZeile[];
  readOnly: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, run] = useTransition();
  // Örtlicher Stand nach einem Tipp (bis die Seite neu geladen ist)
  const [lokal, setLokal] = useState<Record<string, boolean>>({});
  const zeilen = start.map((z) => (z.key in lokal ? { ...z, stand: lokal[z.key] ? ("uebersprungen" as const) : ("geplant" as const) } : z));

  const umschalten = (z: ErinnerungsZeile, ueberspringen: boolean, zurueck = true) =>
    run(async () => {
      if (!z.planKey) return;
      setLokal((x) => ({ ...x, [z.key]: ueberspringen }));
      const r = await nachrichtenAktion(leadId, { aktion: ueberspringen ? "ueberspringen" : "rueckgaengig", key: z.planKey });
      if (!r.ok) {
        setLokal((x) => {
          const n = { ...x };
          delete n[z.key];
          return n;
        });
        return toast.show({ message: r.error, tone: "error" });
      }
      toast.show({
        message: `${z.titel}: ${ueberspringen ? "übersprungen" : "wird gesendet"}`,
        ...(zurueck ? { actionLabel: "Rückgängig", onAction: () => umschalten(z, !ueberspringen, false) } : {}),
      });
      router.refresh();
    });

  const offen = zeilen.some((z) => z.stand === "geplant" || z.stand === "pausiert");
  return (
    <Card className="mb-5" data-termin-erinnerungen>
      <div className="px-5 py-3.5 text-sm">
        <h2 className="mb-2 text-[13px] font-semibold text-[color:var(--muted)]">Erinnerungen an {gebeugt(label)}</h2>
        {bestaetigung ? (
          <p
            className={cn("flex items-center gap-2 font-medium", bestaetigung.ton === "ok" ? "text-emerald-700" : bestaetigung.ton === "verschieben" ? "text-rose-700" : "text-amber-800")}
            data-termin-bestaetigung={bestaetigung.ton}
          >
            {bestaetigung.ton === "ok" ? <Check className="h-4 w-4" /> : <CircleAlert className="h-4 w-4" />}
            {bestaetigung.text}
          </p>
        ) : null}
        {zeilen.length ? (
          <ul className={cn("divide-y divide-[color:var(--border)]", bestaetigung && "mt-1")}>
            {zeilen.map((e) => {
              const weg = e.stand === "uebersprungen";
              return (
                <li key={e.key} className="flex min-h-11 items-center gap-2 py-1" data-erinnerung={e.stand} data-erinnerung-art={e.key}>
                  <BellRing className={cn("h-3.5 w-3.5 shrink-0", e.stand === "gesendet" ? "text-emerald-600" : "text-[color:var(--muted)]")} />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block", weg && "text-[color:var(--muted)] line-through")}>{e.titel}</span>
                    <span className="block text-xs text-[color:var(--muted)]">
                      {e.stand === "gesendet" ? `gesendet ${e.wann}` : weg ? "übersprungen" : e.stand === "pausiert" ? `pausiert · ${e.wann}` : e.wann}
                    </span>
                  </span>
                  {!readOnly && e.planKey ? (
                    weg ? (
                      <button type="button" disabled={pending} onClick={() => umschalten(e, false)} className={cn(KNOPF, "text-[color:var(--brand)]")} data-erinnerung-doch>
                        <Undo2 className="h-3.5 w-3.5" /> Doch senden
                      </button>
                    ) : e.stand !== "gesendet" ? (
                      <button type="button" disabled={pending} onClick={() => umschalten(e, true)} className={cn(KNOPF, "text-[color:var(--muted)]")} data-erinnerung-ueberspringen>
                        <SkipForward className="h-3.5 w-3.5" /> Überspringen
                      </button>
                    ) : null
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
        {bestaetigung?.ton === "offen" && !offen ? <p className="mt-1 text-[color:var(--muted)]">Keine Erinnerung geplant. Ein kurzer Anruf vorher hilft.</p> : null}
      </div>
    </Card>
  );
}
