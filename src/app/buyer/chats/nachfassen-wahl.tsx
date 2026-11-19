"use client";

// Nachfassen bei geschlossenem 24-h-Fenster (Ole, 19.11.2026: „müsste ich hier nicht aus den Templates auswählen können?
// am besten werden mir die empfohlen, die gerade passen“): die zur Situation passende Vorlage ist vorausgewählt und als
// „Empfohlen“ markiert, die übrigen freigegebenen Vorlagen lassen sich mit einem Klick wählen. Eine Hauptaktion.

import { useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { buttonClass } from "@/components/ui";
import { cn } from "@/lib/utils";
import { waFormatKnoten } from "@/lib/wa-format";

export type NachfassOption = { key: string; label: string; preview: string; empfohlen: boolean };

export function NachfassenWahl({ conversationId, optionen, action }: { conversationId: string; optionen: NachfassOption[]; action: (fd: FormData) => Promise<void> }) {
  const [wahl, setWahl] = useState(optionen[0]?.key ?? "");
  const aktiv = optionen.find((o) => o.key === wahl) ?? optionen[0];
  if (!aktiv) return null;
  return (
    <form action={action} className="mt-2 space-y-2" data-nachfassen-wahl>
      <input type="hidden" name="conversationId" value={conversationId} />
      <input type="hidden" name="purpose" value={aktiv.key} />
      {optionen.length > 1 ? (
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Vorlage wählen">
          {optionen.map((o) => (
            <button
              key={o.key}
              type="button"
              role="radio"
              aria-checked={o.key === aktiv.key}
              onClick={() => setWahl(o.key)}
              className={cn(
                "h-8 rounded-full border px-3 text-xs font-semibold",
                o.key === aktiv.key ? "border-[color:var(--brand)] bg-[color:var(--brand)] text-white" : "border-[color:var(--border)] bg-white text-[color:var(--foreground)]",
              )}
              data-nachfassen-option={o.key}
            >
              {o.label}
              {o.empfohlen ? <span className={cn("ml-1.5 font-medium", o.key === aktiv.key ? "text-white/85" : "text-emerald-700")}>· Empfohlen</span> : null}
            </button>
          ))}
        </div>
      ) : null}
      <div className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--surface-sunken)] px-3 py-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted)]">
          Vorschau · {aktiv.label}
          {aktiv.empfohlen && optionen.length === 1 ? " · Empfohlen" : ""}
        </div>
        <p className="mt-1 whitespace-pre-wrap text-sm">{waFormatKnoten(aktiv.preview)}</p>
      </div>
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Sendet …" className={buttonClass("primary", "md")}>
          Nachfassen senden
        </SubmitButton>
      </div>
    </form>
  );
}
