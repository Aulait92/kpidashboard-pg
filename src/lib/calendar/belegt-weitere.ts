// Weitere Kalender für die Belegt-Prüfung (Ole, 18.11.2026): z. B. der bisherige Google-Kalender, der nach dem Wechsel auf
// ein neues Konto nur noch freigegeben ist. Nur Belegt-Zeiten, keine Termininhalte (freeBusy).

import type { Busy } from "@/lib/calendar/tokens";

export const MAX_WEITERE_KALENDER = 5;

/** Eingabe (Komma, Zeilen) bereinigen: Kalender-IDs bzw. Adressen, klein, ohne Dubletten, höchstens 5. */
export function parseWeitereKalender(raw: string): { ok: true; ids: string[] } | { ok: false; error: string } {
  const ids = [...new Set(raw.split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean))];
  if (ids.length > MAX_WEITERE_KALENDER) return { ok: false, error: `Höchstens ${MAX_WEITERE_KALENDER} Kalender.` };
  const bad = ids.find((id) => !/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(id));
  if (bad) return { ok: false, error: `„${bad}“ ist keine Kalender-Adresse.` };
  return { ok: true, ids };
}

type FreeBusyJson = { calendars?: Record<string, { busy?: { start: string; end: string }[]; errors?: { reason?: string }[] }> };

/**
 * Antwort von Google freeBusy zusammenführen: Hauptkalender und weitere. Wirft nur, wenn der Hauptkalender nicht
 * abrufbar ist. Ein weiterer Kalender, der nicht lesbar ist (Tippfehler → notFound, keine Freigabe), wird übersprungen
 * und in `unlesbar` gemeldet (Ole, 18.11.2026: sonst zeigte die Buchungsseite gar keine Zeiten mehr).
 */
export function belegtAusFreeBusy(json: FreeBusyJson, weitere: string[]): { busy: Busy[]; unlesbar: { id: string; grund: string }[] } {
  const busy: Busy[] = [];
  const unlesbar: { id: string; grund: string }[] = [];
  for (const id of ["primary", ...weitere]) {
    const cal = json.calendars?.[id];
    if (!cal || (cal.errors && cal.errors.length > 0)) {
      if (id === "primary") throw new Error("Google-Verfügbarkeit nicht abrufbar. Kalender ggf. neu verbinden.");
      unlesbar.push({ id, grund: cal?.errors?.[0]?.reason ?? "fehlt" });
      continue;
    }
    for (const b of cal.busy ?? []) busy.push({ start: new Date(b.start), end: new Date(b.end) });
  }
  return { busy, unlesbar };
}

/** Kalender-Adresse aus der Antwort von events.list (summary des Hauptkalenders ist die Adresse des Kontos). */
export function kontoAdresseAusSummary(summary: unknown): string | null {
  const s = typeof summary === "string" ? summary.trim().toLowerCase() : "";
  return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(s) ? s : null;
}
