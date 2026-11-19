// Kontakte-Liste (UX-Runde 19.11.2026, Team B): Eingang als „vor 4 Min.“ statt Datum (Reaktionszeit sichtbar),
// ein Text für den nächsten Schritt je Zeile und die Reihenfolge der Ansicht „Zu erledigen“ (Dringendes zuerst).

const MIN = 60_000;
const berlinTag = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(d);

/** „gerade eben“, „vor 4 Min.“, „vor 3 Std.“ (unter 12 Stunden), „gestern“, sonst „19.11.“ bzw. „19.11.2025“. */
export function eingangKurz(created: Date, now: Date = new Date()): string {
  const diff = Math.max(0, now.getTime() - created.getTime());
  if (diff < MIN) return "gerade eben";
  if (diff < 60 * MIN) return `vor ${Math.floor(diff / MIN)} Min.`;
  if (diff < 12 * 60 * MIN) return `vor ${Math.floor(diff / (60 * MIN))} Std.`;
  if (berlinTag(created) === berlinTag(now)) return "heute";
  if (berlinTag(created) === berlinTag(new Date(now.getTime() - 24 * 60 * MIN))) return "gestern";
  const jahr = berlinTag(created).slice(0, 4) !== berlinTag(now).slice(0, 4);
  return new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", ...(jahr ? { year: "numeric" } : {}) }).format(created);
}

/** Frisch und noch niemand hat gesprochen: in der Liste hervorheben (Reaktionszeit). */
export function frischUnberuehrt(l: { createdAt: Date; reached: boolean; closedAt: Date | null; status: string | null }, now: Date = new Date()): boolean {
  return !l.reached && !l.closedAt && (!l.status || l.status === "Neuer Lead") && now.getTime() - l.createdAt.getTime() < 24 * 60 * MIN;
}

export type ZuTunFakten = {
  createdAt: Date;
  reached: boolean;
  closedAt: Date | null;
  status: string | null;
  /** Lead hat im Chat geschrieben und wartet auf den Vermittler */
  waiting?: boolean;
  resultMissing?: boolean;
  followUpAt?: string | null;
  callback?: boolean;
  noNextStep?: boolean;
  /** Assistent ist im Gespräch: ein frischer Lead ist dann schon in Arbeit */
  botActive?: boolean;
};

/** Gehört in „Zu erledigen“: Antwort wartet, frischer Lead ohne Kontakt (und ohne Assistent), Ergebnis fehlt,
 *  Wiedervorlage bis heute, Rückruf, kein nächster Schritt. */
export function istZuTun(l: ZuTunFakten, now: Date = new Date()): boolean {
  return (
    !!l.waiting ||
    (frischUnberuehrt(l, now) && !l.botActive) ||
    !!l.resultMissing ||
    wiedervorlageFaellig(l.followUpAt, now) ||
    !!l.callback ||
    !!l.noNextStep
  );
}

function wiedervorlageFaellig(iso: string | null | undefined, now: Date): boolean {
  return !!iso && berlinTag(new Date(iso)) <= berlinTag(now);
}

/** Rang in „Zu erledigen“ (kleiner = dringender): Antwort wartet, frischer Lead, Ergebnis fehlt, Wiedervorlage, Rückruf, Rest. */
export function zuTunRang(l: ZuTunFakten, now: Date = new Date()): number {
  if (l.waiting) return 0;
  if (frischUnberuehrt(l, now) && !l.botActive) return 1;
  if (l.resultMissing) return 2;
  if (wiedervorlageFaellig(l.followUpAt, now)) return 3;
  if (l.callback) return 4;
  return 5;
}

/** Ansicht der Kontakte-Liste: Standard „Zu erledigen“ (Ole, 19.11.2026); mit Suche oder Filter aus „Zahlen“ alle Treffer. */
export function kontaktAnsicht(view: string | null | undefined, o: { suche?: boolean; filter?: boolean } = {}): string {
  return view || (o.suche || o.filter ? "alle" : "zu-tun");
}
