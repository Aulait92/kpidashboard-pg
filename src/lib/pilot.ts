// Pilot (Ole, 20.11.2026): Ein echter Pilotkunde ist kostenlos bis zu einem Tag (Customer.pilotBis, einschließlich),
// statt ihn als Testkunden zu führen oder ein 0-€-Angebot zu schicken. Er zählt in allen Kennzahlen als echter Kunde.
// Reine Funktionen (Admin-Abzeichen, Prüfungen, Fälligkeiten der Erinnerungen); Speichern: lib/pilot-server.ts.

const TZ = "Europe/Berlin";

/** YYYY-MM-DD in deutscher Zeit. */
export function berlinTag(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** Läuft der Pilot heute noch (bis einschließlich pilotBis, deutsche Zeit)? */
export function pilotLaeuft(pilotBis: Date | null | undefined, now: Date = new Date()): boolean {
  if (!pilotBis) return false;
  return berlinTag(now) <= berlinTag(pilotBis);
}

const ddmm = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: TZ, day: "2-digit", month: "2-digit" }).format(d);

/** Abzeichen im Admin: „Pilot bis 15.12.“ solange er läuft, danach „Pilot endete 15.12.“ (30 Tage lang), sonst null. */
export function pilotAbzeichen(pilotBis: Date | null | undefined, now: Date = new Date()): { text: string; laeuft: boolean } | null {
  if (!pilotBis) return null;
  if (pilotLaeuft(pilotBis, now)) return { text: `Pilot bis ${ddmm(pilotBis)}`, laeuft: true };
  if (now.getTime() - pilotBis.getTime() > 30 * 24 * 60 * 60 * 1000) return null;
  return { text: `Pilot endete ${ddmm(pilotBis)}`, laeuft: false };
}

/** Eingabe aus <input type="date"> → Speicherwert (12 Uhr UTC, damit der Tag in jeder Zeitzone gleich bleibt). Leer = kein Pilot. */
export function parsePilotBis(raw: unknown): { ok: true; value: Date | null } | { ok: false; error: string } {
  const v = typeof raw === "string" ? raw.trim() : "";
  if (!v) return { ok: true, value: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return { ok: false, error: "Bitte ein Datum wählen." };
  const d = new Date(`${v}T12:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return { ok: false, error: "Bitte ein gültiges Datum wählen." };
  return { ok: true, value: d };
}

/** Kennung in der Notiz der Erinnerungen (zum Ersetzen, wenn das Datum sich ändert). */
export const pilotAufgabenKennung = (customerId: string) => `pilot:${customerId}`;

/**
 * Erinnerungen an das Pilotende: 7 Tage vorher und am letzten Tag, jeweils 9 Uhr deutscher Zeit (8 Uhr UTC, grob).
 * Fälligkeiten in der Vergangenheit rücken auf jetzt; ist auch der letzte Tag vorbei, gibt es keine Erinnerung mehr.
 */
export function pilotErinnerungen(customerName: string, pilotBis: Date, now: Date = new Date()): { title: string; dueAt: Date }[] {
  if (!pilotLaeuft(pilotBis, now)) return [];
  const tag = berlinTag(pilotBis);
  const am = (iso: string) => new Date(`${iso}T08:00:00Z`);
  const minus7 = new Date(Date.UTC(+tag.slice(0, 4), +tag.slice(5, 7) - 1, +tag.slice(8, 10) - 7)).toISOString().slice(0, 10);
  const datum = tag.split("-").reverse().join(".");
  const out: { title: string; dueAt: Date }[] = [];
  const spaetestensJetzt = (d: Date) => (d.getTime() < now.getTime() ? now : d);
  // Endet der Pilot heute, reicht die Erinnerung „endet heute“
  if (berlinTag(now) < tag) {
    out.push({ title: `Pilot endet am ${datum}: ${customerName}. Abrechnung ab dann klären (Angebot bzw. Stripe)`, dueAt: spaetestensJetzt(am(minus7)) });
  }
  out.push({ title: `Pilot endet heute: ${customerName}. Abrechnung starten oder Pilot verlängern`, dueAt: spaetestensJetzt(am(tag)) });
  return out;
}
