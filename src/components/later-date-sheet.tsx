"use client";

// „Später anrufen“ an einem eigenen Tag (Ole, 13.11.2026): Datum wählen statt nur Morgen/3 Tage/1–2 Wochen.
// Mit Uhrzeit (Ole, 17.11.2026): vereinbarter Rückruf, auch heute möglich, steht dann im Kalender des Beraters.

import { useState } from "react";
import { Button } from "@/components/ui";
import { Sheet } from "@/components/ui/sheet";

/** Berliner Datum als YYYY-MM-DD, um `tage` verschoben. */
function berlinTag(tage = 0): string {
  const d = new Date(Date.now() + tage * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
const jetztHm = () => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());

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
  /** Gewählter Tag als YYYY-MM-DD, optional Uhrzeit HH:MM (dann Rückruf mit Kalender-Eintrag). */
  onPick: (date: string, time?: string) => void;
}) {
  const heute = berlinTag(0);
  const morgen = berlinTag(1);
  const [date, setDate] = useState(morgen);
  const [time, setTime] = useState("");
  // Heute nur mit Uhrzeit in der Zukunft; ohne Uhrzeit frühestens morgen
  const fehler = !date || date < heute ? "Bitte einen Tag wählen." : date === heute && !time ? "Für heute bitte eine Uhrzeit angeben." : date === heute && time <= jetztHm() ? "Die Uhrzeit liegt schon zurück." : null;
  const feld = "h-11 min-w-0 rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3 text-base outline-none focus:border-[color:var(--brand)]";
  return (
    <Sheet open={open} onClose={onClose} title={title} message={time ? "Steht an diesem Tag auf „Heute“ und als Rückruf in Ihrem Kalender." : "Erscheint an diesem Tag wieder auf „Heute“."}>
      <div className="space-y-2 p-5" data-later-date>
        <div className="flex gap-2">
          <input type="date" min={heute} value={date} onChange={(e) => setDate(e.target.value)} aria-label="Tag wählen" className={`${feld} flex-1`} />
          <input type="time" value={time} step={300} onChange={(e) => setTime(e.target.value)} aria-label="Uhrzeit (optional)" className={`${feld} w-32`} data-rueckruf-uhrzeit />
        </div>
        {fehler && (date !== morgen || time) ? <p className="text-sm text-amber-700">{fehler}</p> : null}
        <Button variant="primary" size="md" className="w-full" disabled={!!fehler} onClick={() => onPick(date, time || undefined)}>
          {time ? "Rückruf eintragen" : "Setzen"}
        </Button>
      </div>
    </Sheet>
  );
}
