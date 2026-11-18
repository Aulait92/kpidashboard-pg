"use client";

// „Maklervollmacht: Wer schickt sie Ihren Kunden?“ (Ole, 18.11.2026; nur Makler). Pflichtfrage ohne Vorauswahl: zwei
// Antworten als große Auswahlfelder, ein Tipp speichert (Customer.vollmachtVersand). Gleiche Komponente in der
// Einrichtung, unter Einstellungen → Assistent und als Hinweis auf „Heute“, solange nicht entschieden.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { vollmachtVersandAction } from "@/app/buyer/vollmacht-actions";
import { VERSAND_ANTWORTEN, type VollmachtVersand } from "@/lib/maklervollmacht/regeln";

export function VollmachtVersandWahl({ wert: start0, darf }: { wert: VollmachtVersand | null; darf: boolean }) {
  const [wert, setWert] = useState<VollmachtVersand | null>(start0);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const waehlen = (w: VollmachtVersand) => {
    if (!darf || pending || w === wert) return;
    const vorher = wert;
    setWert(w);
    start(async () => {
      const r = await vollmachtVersandAction(w);
      if (!r.ok) {
        setWert(vorher);
        return toast.show({ message: r.error, tone: "error" });
      }
      toast.show({ message: w === "app" ? "Gespeichert: Die App schickt die Maklervollmacht." : "Gespeichert: Sie nutzen Ihre eigene Vollmacht." });
      router.refresh();
    });
  };
  return (
    <div role="radiogroup" aria-label="Wer schickt die Maklervollmacht?" className="grid gap-2" data-vv-versand>
      {VERSAND_ANTWORTEN.map((x) => {
        const an = wert === x.wert;
        const Icon = an ? CheckCircle2 : Circle;
        return (
          <button
            key={x.wert}
            type="button"
            role="radio"
            aria-checked={an}
            disabled={!darf || pending}
            onClick={() => waehlen(x.wert)}
            className={`flex w-full items-start gap-3 rounded-[var(--radius-md)] border px-4 py-3 text-left transition disabled:cursor-not-allowed ${
              an ? "border-[color:var(--brand)] bg-[color:var(--brand-soft,#eff6ff)]" : "border-[color:var(--border)] bg-white hover:border-[color:var(--border-strong)]"
            }`}
            data-vv-versand-antwort={x.wert}
          >
            <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${an ? "text-[color:var(--brand)]" : "text-[color:var(--border-strong)]"}`} />
            <span className="min-w-0">
              <span className="block text-[15px] font-medium">
                {x.titel}
                {x.empfohlen ? <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 align-middle text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">Empfohlen</span> : null}
              </span>
              <span className="mt-0.5 block text-sm text-[color:var(--muted)]">{x.text}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
