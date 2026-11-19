// Terminseite /buyer/termine/<id> (UX-Runde Team C, 19.11.2026): rein und testbar (ohne Datenbank).
// Show-up sichtbar machen: Hat der Kunde zugesagt? Welche Erinnerungen sind raus, welche kommen noch?
// Gesendet: Appointment.reminderSentAt (Vortag), soonReminderSentAt (1 Stunde vorher), startReminderSentAt (15 Minuten
// vorher). Geplant: Einträge aus dem Nachrichtenplan (lib/nachrichtenplan.ts, quelle „erinnerung“) zu diesem Termin.
// Tests: tests/unit/termin-seite.test.ts

import type { PlanEintrag } from "@/lib/nachrichtenplan";

const TZ = "Europe/Berlin";
const tag = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
const uhr = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(d);

/** „heute 9:00“, „morgen 10:00“, „gestern 18:00“, sonst „Mo, 23.11. 10:00“. */
export function zeitKurzRelativ(d: Date, now: Date): string {
  const t = tag(d);
  const tagMs = 86_400_000;
  if (t === tag(now)) return `heute ${uhr(d)}`;
  if (t === tag(new Date(now.getTime() + tagMs))) return `morgen ${uhr(d)}`;
  if (t === tag(new Date(now.getTime() - tagMs))) return `gestern ${uhr(d)}`;
  const datum = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, weekday: "short", day: "2-digit", month: "2-digit" }).format(d);
  return `${datum} ${uhr(d)}`;
}

export type Bestaetigung = { ton: "ok" | "offen" | "verschieben"; text: string };

/**
 * Zusage des Kunden in einem Satz. null, wenn der Termin nicht mehr ansteht (abgesagt, erledigt, schon vorbei) und der
 * Kunde auch nicht zugesagt hat.
 */
export function terminBestaetigung(
  t: { status: string; startsAt: Date; confirmedAt?: Date | null; rescheduleRequestedAt?: Date | null },
  now: Date,
): Bestaetigung | null {
  if (t.status === "booked" && t.rescheduleRequestedAt) return { ton: "verschieben", text: "Möchte verschieben" };
  if (t.confirmedAt) return { ton: "ok", text: `Zugesagt ${zeitKurzRelativ(t.confirmedAt, now)}` };
  if (t.status !== "booked" || t.startsAt.getTime() <= now.getTime()) return null;
  return { ton: "offen", text: "Noch nicht bestätigt" };
}

export type ErinnerungsZeile = { key: string; titel: string; stand: "gesendet" | "geplant" | "uebersprungen" | "pausiert"; wann: string | null };

const KURZ: Record<string, string> = {
  vortag: "WhatsApp am Vortag",
  vortag_mail: "E-Mail am Vortag",
  stunde: "WhatsApp 1 Stunde vorher",
  gleich: "WhatsApp 15 Minuten vorher",
};

/** Gesendete und geplante Erinnerungen zu einem Termin, in zeitlicher Reihenfolge. */
export function erinnerungsZeilen(
  t: { id: string; reminderSentAt?: Date | null; soonReminderSentAt?: Date | null; startReminderSentAt?: Date | null },
  plan: PlanEintrag[],
  now: Date,
): ErinnerungsZeile[] {
  const gesendet: { key: string; at: Date }[] = [
    ...(t.reminderSentAt ? [{ key: "vortag", at: t.reminderSentAt }] : []),
    ...(t.soonReminderSentAt ? [{ key: "stunde", at: t.soonReminderSentAt }] : []),
    ...(t.startReminderSentAt ? [{ key: "gleich", at: t.startReminderSentAt }] : []),
  ];
  const zeilen: (ErinnerungsZeile & { ms: number })[] = gesendet.map((g) => ({ key: g.key, titel: KURZ[g.key], stand: "gesendet", wann: zeitKurzRelativ(g.at, now), ms: g.at.getTime() }));
  for (const e of plan) {
    if (e.quelle !== "erinnerung" || e.terminId !== t.id) continue;
    const art = e.key.split(":")[2] ?? "";
    if (zeilen.some((z) => z.key === art)) continue;
    const at = new Date(e.at);
    zeilen.push({
      key: art,
      titel: KURZ[art] ?? e.titel,
      stand: e.uebersprungen ? "uebersprungen" : e.pausiert ? "pausiert" : "geplant",
      wann: e.uebersprungen ? null : zeitKurzRelativ(at, now),
      ms: at.getTime(),
    });
  }
  return zeilen.sort((a, b) => a.ms - b.ms).map((z) => ({ key: z.key, titel: z.titel, stand: z.stand, wann: z.wann }));
}
