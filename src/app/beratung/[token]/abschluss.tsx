"use client";

// Kundenlink mit Abschluss-Schritt (Splittest B, 19.11.2026): Folien zum Nachlesen und unten eine feste Leiste mit
// Auswahl, Beitrag und „Ja, so machen wir es“. Der Klick ist unverbindlich (kein Vertragsschluss): Er meldet dem
// Vermittler die Zusage, der Antrag folgt mit ihm. Variante A: nur die Folien (bisher). Beide messen „Folie erreicht“.

import { useCallback, useState, useTransition } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui";
import { a, type Ansprache } from "@/lib/ansprache";
import { mitAbschlussLeiste, type PraesentationVariante } from "@/lib/praesentation-variante";
import { FolienListe } from "./folien-liste";
import { kundenlinkFolieAction, kundenlinkZusageAction } from "./actions";

const eur = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);

export function KundenAbschluss({
  token,
  css,
  folien,
  variante,
  zugesagt: start,
  summe,
  produkte,
  berater,
  an,
}: {
  token: string;
  css: string;
  folien: { id: string; html: string }[];
  variante: PraesentationVariante;
  zugesagt: boolean;
  summe: number | null;
  produkte: string[];
  berater: string;
  an: Ansprache;
}) {
  const [zugesagt, setZugesagt] = useState(start);
  const [fehler, setFehler] = useState(false);
  const [pending, run] = useTransition();
  const onFolie = useCallback((id: string) => void kundenlinkFolieAction(token, id).catch(() => {}), [token]);
  const mitLeiste = mitAbschlussLeiste(variante, produkte);
  return (
    <>
      <FolienListe css={css} folien={folien} onFolie={onFolie} />
      {mitLeiste ? (
        <div
          className="fixed inset-x-0 bottom-0 z-40 border-t border-[color:var(--border)] bg-white/95 px-4 pt-3 shadow-[var(--shadow-lg)] backdrop-blur"
          style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
          data-kunden-abschluss
        >
          <div className="mx-auto w-full max-w-4xl">
            {zugesagt ? (
              <p className="flex items-center gap-2 py-2 text-[15px] font-medium text-emerald-800" role="status" data-zugesagt>
                <Check className="h-5 w-5 shrink-0" />
                {a(an, `Danke! ${berater} meldet sich bei dir und füllt den Antrag mit dir aus.`, `Danke! ${berater} meldet sich bei Ihnen und füllt den Antrag mit Ihnen aus.`)}
              </p>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs text-[color:var(--muted)]">{produkte.join(" + ")}</div>
                    {summe != null ? (
                      <div className="text-base font-semibold tabular-nums">
                        {eur(summe)} <span className="text-sm font-normal text-[color:var(--muted)]">im Monat</span>
                      </div>
                    ) : null}
                  </div>
                  <Button
                    variant="primary"
                    size="md"
                    disabled={pending}
                    onClick={() =>
                      run(async () => {
                        const r = await kundenlinkZusageAction(token).catch(() => ({ ok: false }));
                        setFehler(!r.ok);
                        if (r.ok) setZugesagt(true);
                      })
                    }
                    data-zusage-kunde
                  >
                    Ja, so machen wir es
                  </Button>
                </div>
                <p className="mt-1 text-xs text-[color:var(--muted)]">
                  {fehler
                    ? a(an, `Das hat nicht geklappt. Bitte schreib ${berater} kurz.`, `Das hat nicht geklappt. Bitte schreiben Sie ${berater} kurz.`)
                    : a(an, `Unverbindlich: ${berater} meldet sich und füllt den Antrag mit dir aus.`, `Unverbindlich: ${berater} meldet sich und füllt den Antrag mit Ihnen aus.`)}
                </p>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
