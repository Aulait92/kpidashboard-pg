"use client";

// Datumsfelder öffnen den Kalender bei Klick irgendwo ins Feld, nicht nur auf das kleine Symbol rechts (Ole, 22.11.2026,
// Angebotsformular „Start“). Gilt app-weit für date, datetime-local, time und month (HTMLInputElement.showPicker).

import { useEffect } from "react";

const TYPEN = new Set(["date", "datetime-local", "time", "month", "week"]);

export function DatumKlick() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = e.target;
      if (!(el instanceof HTMLInputElement) || !TYPEN.has(el.type) || el.disabled || el.readOnly) return;
      try {
        el.showPicker?.();
      } catch {
        /* z. B. in eingebetteten Ansichten nicht erlaubt: dann wie bisher über das Symbol */
      }
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
  return null;
}
