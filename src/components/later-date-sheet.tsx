"use client";

// „Später anrufen“ an einem eigenen Tag (Ole, 13.11.2026): Datum wählen statt nur Morgen/3 Tage/1–2 Wochen.

import { useState } from "react";
import { Button } from "@/components/ui";
import { Sheet } from "@/components/ui/sheet";

/** Morgen (Berliner Datum) als YYYY-MM-DD – frühester wählbarer Tag. */
function tomorrow(): string {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export const fmtDay = (ymd: string) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: "UTC", weekday: "short", day: "2-digit", month: "2-digit" }).format(new Date(`${ymd}T12:00:00Z`));

export function LaterDateSheet({
  open,
  title,
  onClose,
  onPick,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  /** Gewählter Tag als YYYY-MM-DD. */
  onPick: (date: string) => void;
}) {
  const min = tomorrow();
  const [date, setDate] = useState(min);
  return (
    <Sheet open={open} onClose={onClose} title={title} message="Erscheint an diesem Tag wieder auf „Heute“.">
      <div className="flex gap-2 p-5" data-later-date>
        <input
          type="date"
          min={min}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Tag wählen"
          className="h-11 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3 text-base outline-none focus:border-[color:var(--brand)]"
        />
        <Button variant="primary" size="md" disabled={!date || date < min} onClick={() => onPick(date)}>
          Setzen
        </Button>
      </div>
    </Sheet>
  );
}
