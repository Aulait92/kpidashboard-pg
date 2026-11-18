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

/** Antwort von Google freeBusy zusammenführen: Hauptkalender und weitere. Wirft, wenn einer nicht abrufbar ist. */
export function belegtAusFreeBusy(json: FreeBusyJson, weitere: string[]): Busy[] {
  const out: Busy[] = [];
  for (const id of ["primary", ...weitere]) {
    const cal = json.calendars?.[id];
    if (!cal || (cal.errors && cal.errors.length > 0)) {
      throw new Error(
        id === "primary"
          ? "Google-Verfügbarkeit nicht abrufbar. Kalender ggf. neu verbinden."
          : `Kalender ${id} nicht abrufbar (${cal?.errors?.[0]?.reason ?? "fehlt"}). Freigabe für das verbundene Konto prüfen.`,
      );
    }
    for (const b of cal.busy ?? []) out.push({ start: new Date(b.start), end: new Date(b.end) });
  }
  return out;
}
