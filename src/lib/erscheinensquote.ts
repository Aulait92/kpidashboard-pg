// Erscheinensquote (Show-up-Paket, Ole 17.11.2026): Anteil der Termine, zu denen der Lead erschienen ist, je
// Vorlaufzeit (Buchung bis Termin), Produkt und Wochentag. Grundlage: Anwesenheit am Termin (Appointment.attendance aus
// „Ist … da?“) und das Termin-Ergebnis (completed = erschienen, no_show = nicht erschienen). Termine ohne Angabe zählen
// nicht mit. Rein und testbar; Laden: loadErscheinensquote, Abfrage für Admins: /api/admin/erscheinensquote.

import { displayProduct } from "@/lib/products";

export type QuoteTermin = { startsAt: Date; createdAt: Date; status: string; attendance: string | null; source: string | null };
export type QuoteZeile = { gruppe: string; erschienen: number; nichtErschienen: number; gesamt: number; quote: number | null };
export type Erscheinensquote = { gesamt: QuoteZeile; nachVorlauf: QuoteZeile[]; nachProdukt: QuoteZeile[]; nachWochentag: QuoteZeile[]; ohneAngabe: number };

const H = 60 * 60 * 1000;

/** Erschienen? null = unbekannt (noch offen, abgesagt, Ergebnis fehlt). */
export function erschienen(t: Pick<QuoteTermin, "status" | "attendance">): boolean | null {
  if (t.attendance === "nicht_erschienen" || t.status === "no_show") return false;
  if (t.attendance === "erschienen" || t.status === "completed") return true;
  return null;
}

/** Vorlaufzeit in Gruppen (Ziel laut Ole: 24 bis 48 Stunden). */
export const VORLAUF_GRUPPEN = ["unter 24 h", "24 bis 48 h", "48 bis 72 h", "über 72 h"] as const;
export function vorlaufGruppe(t: Pick<QuoteTermin, "startsAt" | "createdAt">): (typeof VORLAUF_GRUPPEN)[number] {
  const h = (t.startsAt.getTime() - t.createdAt.getTime()) / H;
  if (h < 24) return "unter 24 h";
  if (h < 48) return "24 bis 48 h";
  if (h < 72) return "48 bis 72 h";
  return "über 72 h";
}

const WOCHENTAGE = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"] as const;
export function wochentag(d: Date): string {
  const w = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "long" }).format(d);
  return w.charAt(0).toUpperCase() + w.slice(1);
}

function zeilen(rows: { gruppe: string; ja: boolean }[], reihenfolge?: readonly string[]): QuoteZeile[] {
  const map = new Map<string, QuoteZeile>();
  for (const g of reihenfolge ?? []) map.set(g, { gruppe: g, erschienen: 0, nichtErschienen: 0, gesamt: 0, quote: null });
  for (const r of rows) {
    const z = map.get(r.gruppe) ?? { gruppe: r.gruppe, erschienen: 0, nichtErschienen: 0, gesamt: 0, quote: null };
    if (r.ja) z.erschienen++;
    else z.nichtErschienen++;
    z.gesamt++;
    map.set(r.gruppe, z);
  }
  const list = [...map.values()].map((z) => ({ ...z, quote: z.gesamt ? Math.round((z.erschienen / z.gesamt) * 1000) / 10 : null }));
  return reihenfolge ? list : list.sort((a, b) => b.gesamt - a.gesamt || a.gruppe.localeCompare(b.gruppe));
}

/** Quote in Prozent (eine Nachkommastelle) gesamt und je Gruppe. */
export function erscheinensquote(termine: QuoteTermin[]): Erscheinensquote {
  const bekannt = termine.flatMap((t) => {
    const ja = erschienen(t);
    return ja === null ? [] : [{ t, ja }];
  });
  return {
    gesamt: zeilen(bekannt.map((x) => ({ gruppe: "Alle Termine", ja: x.ja })))[0] ?? { gruppe: "Alle Termine", erschienen: 0, nichtErschienen: 0, gesamt: 0, quote: null },
    nachVorlauf: zeilen(bekannt.map((x) => ({ gruppe: vorlaufGruppe(x.t), ja: x.ja })), VORLAUF_GRUPPEN),
    nachProdukt: zeilen(bekannt.map((x) => ({ gruppe: x.t.source ? displayProduct(x.t.source) : "Ohne Produkt", ja: x.ja }))),
    nachWochentag: zeilen(bekannt.map((x) => ({ gruppe: wochentag(x.t.startsAt), ja: x.ja })), WOCHENTAGE),
    ohneAngabe: termine.length - bekannt.length,
  };
}
