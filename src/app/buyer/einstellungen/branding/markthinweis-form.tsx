"use client";

// Makler (§ 60 Abs. 1, 2 VVG): Hinweis auf die Marktauswahl unten auf Empfehlungs- und Vergleichsfolie.
// {gesellschaften} wird durch die Gesellschaften der gezeigten Tarife ersetzt. Leer speichern = Standard.

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { markthinweisAction } from "./actions";

export function MarkthinweisForm({ text: initial, standard, canEdit }: { text: string; standard: string; canEdit: boolean }) {
  const toast = useToast();
  const [text, setText] = useState(initial);
  const [pending, start] = useTransition();
  const save = (wert: string) =>
    start(async () => {
      const r = await markthinweisAction(wert);
      if (!r.ok) return toast.show({ message: r.error, tone: "error" });
      if (!wert.trim()) setText(standard);
      toast.show({ message: "Gespeichert" });
    });

  return (
    <div className="space-y-2 p-5" data-markthinweis-form>
      <label className="text-sm font-medium" htmlFor="markthinweis">
        Text unten auf Empfehlung und Vergleich
      </label>
      <input
        id="markthinweis"
        className="min-h-[40px] w-full rounded-[var(--radius-md)] border border-[color:var(--border)] px-3 text-sm"
        value={text}
        maxLength={300}
        disabled={!canEdit || pending}
        onChange={(e) => setText(e.target.value)}
      />
      <p className="text-xs text-[color:var(--muted)]">{"{gesellschaften}"} ersetzt die App durch die Gesellschaften der gezeigten Tarife.</p>
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <Button disabled={!canEdit || pending || text.trim() === initial.trim()} onClick={() => save(text)}>
          Speichern
        </Button>
        {text.trim() !== standard ? (
          <button type="button" className="text-xs text-[color:var(--muted)] underline" disabled={!canEdit || pending} onClick={() => save("")}>
            Standard verwenden
          </button>
        ) : null}
      </div>
    </div>
  );
}
