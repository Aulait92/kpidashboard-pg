"use client";

// Stand und Aktionen der Detailseite „Was sich ändert und was Sie wählen können“ (lib/datennutzung.ts).
// Eine Hauptaktion: „Verstanden“, solange der Hinweis offen ist. „Widersprechen“ ist die Nebenaktion unten und öffnet
// den Dialog mit einem Haken je Punkt (nichts vorausgewählt). Nach dem Senden steht der Stand je Punkt da, mit
// „Widerspruch zurücknehmen“. In der Admin-Vorschau nur lesen.

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { BANNER_TEXT, DETAIL_TEXT, DIALOG_TEXT, MELDUNG, WIDERSPRUCH_PUNKTE, tagText, type Punkt } from "@/lib/datennutzung";
import type { DatennutzungStand } from "@/lib/datennutzung-server";
import { datennutzungRuecknahmeAction, datennutzungVerstandenAction, datennutzungWiderspruchAction } from "./actions";

type Ergebnis = { ok: true } | { ok: false; error: string };

export function DatennutzungAktionen({ stand, bestaetigtAm }: { stand: DatennutzungStand; /** Klick auf „Verstanden“ (nicht: Kenntnis durch einen Widerspruch) */ bestaetigtAm: string | null }) {
  const toast = useToast();
  const [dialog, setDialog] = useState(false);
  const [wahl, setWahl] = useState<Punkt[]>([]);
  const [pending, start] = useTransition();
  const widersprochen = WIDERSPRUCH_PUNKTE.filter((p) => stand.widerspruch[p]);
  const offen = WIDERSPRUCH_PUNKTE.filter((p) => !stand.widerspruch[p]);

  const lauf = (fn: () => Promise<Ergebnis>, erfolg: string, o: { danach?: () => void; durationMs?: number } = {}) =>
    start(async () => {
      const r = await fn().catch((): Ergebnis => ({ ok: false, error: MELDUNG.fehler }));
      if (!r.ok) return toast.show({ message: r.error, tone: "error" });
      o.danach?.();
      toast.show({ message: erfolg, durationMs: o.durationMs });
    });

  const oeffnen = () => {
    setWahl([]);
    setDialog(true);
  };
  const umschalten = (p: Punkt, an: boolean) => setWahl((w) => (an ? [...w.filter((x) => x !== p), p] : w.filter((x) => x !== p)));

  return (
    <>
      {bestaetigtAm || widersprochen.length ? (
        <Card data-datennutzung-stand>
          <ul className="divide-y divide-[color:var(--border)]">
            {bestaetigtAm ? (
              <li className="flex items-center gap-2 px-5 py-3.5 text-sm" data-datennutzung-bestaetigt>
                <Check className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden /> Bestätigt am {tagText(bestaetigtAm)}
              </li>
            ) : null}
            {widersprochen.map((p) => (
              <li key={p} className="px-5 py-3.5" data-datennutzung-widerspruch={p}>
                <p className="text-[15px] font-medium leading-snug">
                  Sie haben am {tagText(stand.widerspruch[p]!)} widersprochen: {DIALOG_TEXT.punkte[p].label}.
                </p>
                <p className="mt-1 text-sm text-[color:var(--muted)]">{DIALOG_TEXT.punkte[p].wirkung}</p>
                {stand.darf ? (
                  <Button
                    variant="secondary"
                    size="md"
                    className="mt-3 w-full sm:w-auto"
                    disabled={pending}
                    onClick={() => lauf(() => datennutzungRuecknahmeAction(p), MELDUNG.ruecknahme)}
                    data-datennutzung-zuruecknehmen={p}
                  >
                    {DETAIL_TEXT.zuruecknehmen}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {stand.darf ? (
        !stand.verstandenAm || offen.length ? (
          <div className="flex flex-wrap gap-2" data-datennutzung-aktionen>
            {!stand.verstandenAm ? (
              <Button variant="primary" size="md" className="flex-1 sm:flex-none" disabled={pending} onClick={() => lauf(() => datennutzungVerstandenAction("detailseite"), MELDUNG.verstanden)} data-datennutzung-verstanden>
                {BANNER_TEXT.verstanden}
              </Button>
            ) : null}
            {offen.length ? (
              <Button variant="secondary" size="md" className={stand.verstandenAm ? "w-full sm:w-auto" : "flex-1 sm:flex-none"} disabled={pending} onClick={oeffnen} data-datennutzung-widersprechen>
                {DETAIL_TEXT.widersprechen}
              </Button>
            ) : null}
          </div>
        ) : null
      ) : (
        <p className="px-1 text-xs text-[color:var(--muted)]">Vorschau: nur lesen.</p>
      )}

      <Sheet open={dialog} onClose={() => setDialog(false)} title={DIALOG_TEXT.titel}>
        <div className="px-5 py-4" data-datennutzung-dialog>
          <ul className="space-y-1">
            {offen.map((p) => (
              <li key={p}>
                <label className="-mx-2 flex cursor-pointer items-start gap-3 rounded-[var(--radius-sm)] px-2 py-2.5 text-[15px] leading-snug hover:bg-[color:var(--surface-sunken)]">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-5 w-5 shrink-0 accent-[color:var(--brand)]"
                    checked={wahl.includes(p)}
                    onChange={(e) => umschalten(p, e.target.checked)}
                    data-datennutzung-haken={p}
                  />
                  <span>
                    <b className="font-semibold">{DIALOG_TEXT.punkte[p].label}:</b> {DIALOG_TEXT.punkte[p].text}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <Button
            variant="primary"
            size="md"
            className="mt-4 w-full"
            disabled={!wahl.length || pending}
            onClick={() => lauf(() => datennutzungWiderspruchAction(wahl), MELDUNG.widerspruch, { danach: () => setDialog(false), durationMs: 9000 })}
            data-datennutzung-senden
          >
            {pending ? "Wird gesendet …" : DIALOG_TEXT.senden}
          </Button>
        </div>
      </Sheet>
    </>
  );
}
