// Zwei konkrete Terminvorschläge fürs Nachfassen (Ole, 15.11.2026): statt „Antworten Sie einfach hier“ zwei freie
// Zeiten aus dem Kalender (bestehende Frei/Belegt-Logik, lib/calendar → suggestSlots), mit Knöpfen
// „Erste Zeit passt“/„Zweite Zeit passt“/„Andere Zeit“. Der Payload trägt die Startzeit (slot:<ISO>), der Assistent
// bucht dann genau diese Zeit (lib/whatsapp/knopf.ts). Ohne verbundenen Kalender bzw. ohne freie Zeiten: null,
// dann nimmt der Aufrufer die kurze Nachfrage (followup_nudge).

import { slotPayload } from "@/lib/whatsapp/knopf";

const TZ = "Europe/Berlin";

/** „Di., 17.11. um 10:00 Uhr“ */
export function slotLabel(iso: string): string {
  const d = new Date(iso);
  const tag = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: TZ }).format(d);
  const zeit = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(d);
  return `${tag} um ${zeit} Uhr`;
}

const dayKey = (iso: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(new Date(iso));

/** Zwei Vorschläge: der früheste und der früheste an einem anderen Tag (sonst der nächste). Rein, testbar. */
export function pickTwoSlots<T extends { start: string }>(slots: T[]): [T, T] | null {
  if (slots.length < 2) return null;
  const first = slots[0];
  const other = slots.find((s) => dayKey(s.start) !== dayKey(first.start)) ?? slots[1];
  return [first, other];
}

export type Terminvorschlaege = { labels: [string, string]; starts: [string, string]; payloads: string[] };

/** Zwei freie Zeiten für diesen Lead; null ohne Kalender bzw. ohne freie Zeiten. Wirft nie. */
export async function zweiTerminvorschlaege(customerId: string, leadId: string | null | undefined): Promise<Terminvorschlaege | null> {
  try {
    const { bookingDurationMin, suggestSlots } = await import("@/lib/calendar");
    const duration = await bookingDurationMin(customerId, leadId).catch(() => 30);
    const two = pickTwoSlots(await suggestSlots(customerId, duration, 8, "lead", 10, leadId));
    if (!two) return null;
    const starts: [string, string] = [two[0].start, two[1].start];
    // Dritter Knopf „Andere Zeit“ ohne eigenen Payload (Knopftext genügt)
    return { labels: [slotLabel(starts[0]), slotLabel(starts[1])], starts, payloads: [slotPayload(starts[0]), slotPayload(starts[1]), "andere_zeit"] };
  } catch {
    return null;
  }
}
