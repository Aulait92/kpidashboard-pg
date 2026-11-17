// Kurzname der Buchungsseite ändern (Ole, 17.11.2026: „dass man den slug editieren kann“).
// Erlaubt: a-z, 0-9, Bindestrich, 3 bis 40 Zeichen; Umlaute werden umgeschrieben. Der bisherige Kurzname bleibt als
// Weiterleitung (CalendarConnection.bookingSlugAlt), damit schon verschickte Links weiter funktionieren
// (app/book/[slug]/page.tsx). Ein Kurzname, den ein anderes Konto nutzt oder genutzt hat, ist vergeben.

import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/calendar";

/** Pfade unter /book bzw. auf der Buchungsdomain, die kein Kurzname sein dürfen. */
const RESERVIERT = new Set(["manage", "verwalten", "termin", "api", "admin", "login", "book", "buyer", "impressum", "datenschutz"]);

export type SlugPruefung = { ok: true; slug: string } | { ok: false; error: string };

/** Eingabe zu einem Kurznamen machen und prüfen (rein). */
export function pruefeSlug(eingabe: string): SlugPruefung {
  const slug = slugify(eingabe ?? "").slice(0, 40).replace(/-+$/g, "");
  if (slug.length < 3) return { ok: false, error: "Bitte mindestens 3 Buchstaben oder Ziffern." };
  if (RESERVIERT.has(slug)) return { ok: false, error: "Dieser Name ist reserviert. Bitte einen anderen wählen." };
  return { ok: true, slug };
}

/** Kurznamen für ein Konto setzen. Der alte bleibt als Weiterleitung. */
export async function setzeBuchungsSlug(customerId: string, eingabe: string): Promise<SlugPruefung> {
  const p = pruefeSlug(eingabe);
  if (!p.ok) return p;
  const conn = await prisma.calendarConnection.findUnique({ where: { customerId }, select: { id: true, bookingSlug: true, bookingSlugAlt: true } });
  if (!conn) return { ok: false, error: "Bitte zuerst den Kalender verbinden." };
  if (conn.bookingSlug === p.slug) return p;
  const vergeben = await prisma.calendarConnection.findFirst({
    where: { id: { not: conn.id }, OR: [{ bookingSlug: p.slug }, { bookingSlugAlt: { has: p.slug } }] },
    select: { id: true },
  });
  if (vergeben) return { ok: false, error: "Dieser Link ist schon vergeben. Bitte einen anderen wählen." };
  const alt = [...new Set([...(conn.bookingSlugAlt ?? []), ...(conn.bookingSlug ? [conn.bookingSlug] : [])])].filter((x) => x !== p.slug);
  try {
    await prisma.calendarConnection.update({ where: { id: conn.id }, data: { bookingSlug: p.slug, bookingSlugAlt: alt } });
  } catch {
    // Gleichzeitig von einem anderen Konto belegt (bookingSlug ist eindeutig)
    return { ok: false, error: "Dieser Link ist schon vergeben. Bitte einen anderen wählen." };
  }
  return p;
}

/** Früheren Kurznamen auflösen: aktueller Kurzname des Kontos oder null. */
export async function aktuellerSlugFuer(frueher: string): Promise<string | null> {
  const c = await prisma.calendarConnection.findFirst({ where: { bookingSlugAlt: { has: frueher } }, select: { bookingSlug: true } });
  return c?.bookingSlug ?? null;
}
