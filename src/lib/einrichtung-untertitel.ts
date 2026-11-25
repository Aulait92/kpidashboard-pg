// Untertitel der Einrichtungsseite (Usability-Check 25.11.2026): „Start am 20. November“ stand noch da, als der Tag
// schon vorbei war. Liegt der Starttag in der Vergangenheit (Berliner Kalendertag), entfällt das Datum. Rein.

const berlinTag = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(d);
const datum = (d: Date) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "long", day: "2-digit", month: "long", year: "numeric" }).format(d);

/** Starttag heute oder später (Berliner Kalendertag)? Sonst kein „Am … gehen die Anzeigen live“ mit vergangenem Datum. */
export function startNochVorne(startDate: Date | null | undefined, now: Date): startDate is Date {
  return !!startDate && berlinTag(startDate) >= berlinTag(now);
}

export function einrichtungUntertitel(ob: { liveAt: Date | null; startDate: Date | null }, now: Date): string {
  if (ob.liveAt) return `Live seit ${datum(ob.liveAt)}.`;
  if (startNochVorne(ob.startDate, now)) return `Start am ${datum(ob.startDate)}. Bis dahin richten wir alles gemeinsam ein.`;
  return "Wir richten alles gemeinsam ein.";
}
