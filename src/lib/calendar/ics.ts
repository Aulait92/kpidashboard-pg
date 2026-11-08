// Belegte Zeiten aus einem veröffentlichten Kalender (ICS-Link), z. B. Outlook
// „Kalender veröffentlichen → Nur Verfügbarkeit". So kennen wir die freien
// Zeiten eines Firmenkalenders (Allianz/Exchange) ohne API-Zugriff und ohne
// IT-Freigabe. Serientermine, Ausnahmen und Zeitzonen (inkl. Windows-TZIDs
// mit eingebetteter VTIMEZONE) übernimmt ical.js.

import ICAL from "ical.js";
import type { Busy } from "@/lib/calendar/tokens";

const MAX_OCCURRENCES_PER_EVENT = 2000;
const FETCH_TIMEOUT_MS = 15_000;

function isFree(vevent: InstanceType<typeof ICAL.Component>): boolean {
  const transp = String(vevent.getFirstPropertyValue("transp") ?? "").toUpperCase();
  const status = String(vevent.getFirstPropertyValue("status") ?? "").toUpperCase();
  const msBusy = String(
    vevent.getFirstPropertyValue("x-microsoft-cdo-busystatus") ?? "",
  ).toUpperCase();
  return transp === "TRANSPARENT" || status === "CANCELLED" || msBusy === "FREE";
}

/** ICS-Text → belegte Zeiträume im Fenster [min, max). */
export function parseIcsBusy(icsText: string, min: Date, max: Date): Busy[] {
  const root = new ICAL.Component(ICAL.parse(icsText));

  // Eingebettete Zeitzonen registrieren (Outlook: „W. Europe Standard Time").
  for (const tz of root.getAllSubcomponents("vtimezone")) {
    ICAL.TimezoneService.register(tz);
  }

  const rangeStart = ICAL.Time.fromJSDate(min, true);
  const rangeEnd = ICAL.Time.fromJSDate(max, true);
  const busy: Busy[] = [];

  // Ausnahmen (RECURRENCE-ID) ihrem Serien-Master zuordnen.
  const vevents = root.getAllSubcomponents("vevent");
  const masters = new Map<string, InstanceType<typeof ICAL.Event>>();
  const exceptions: InstanceType<typeof ICAL.Event>[] = [];
  for (const ve of vevents) {
    const ev = new ICAL.Event(ve);
    if (ev.isRecurrenceException()) exceptions.push(ev);
    else masters.set(ev.uid, ev);
  }
  for (const ex of exceptions) masters.get(ex.uid)?.relateException(ex);

  const push = (start: Date, end: Date, comp: InstanceType<typeof ICAL.Component>) => {
    if (isFree(comp)) return;
    if (end > min && start < max) busy.push({ start, end });
  };

  for (const ev of masters.values()) {
    if (!ev.isRecurring()) {
      push(ev.startDate.toJSDate(), ev.endDate.toJSDate(), ev.component);
      continue;
    }
    const it = ev.iterator();
    for (let i = 0; i < MAX_OCCURRENCES_PER_EVENT; i++) {
      const next = it.next();
      if (!next || next.compare(rangeEnd) >= 0) break;
      const occ = ev.getOccurrenceDetails(next);
      if (occ.endDate.compare(rangeStart) <= 0) continue;
      push(occ.startDate.toJSDate(), occ.endDate.toJSDate(), occ.item.component);
    }
  }

  // Manche Exporte liefern reine Frei/Gebucht-Blöcke (VFREEBUSY).
  for (const fb of root.getAllSubcomponents("vfreebusy")) {
    for (const prop of fb.getAllProperties("freebusy")) {
      const fbtype = String(prop.getParameter("fbtype") ?? "BUSY").toUpperCase();
      if (fbtype === "FREE") continue;
      for (const v of prop.getValues()) {
        const period = v as InstanceType<typeof ICAL.Period>;
        const start = period.start.toJSDate();
        const end = period.getEnd().toJSDate();
        if (end > min && start < max) busy.push({ start, end });
      }
    }
  }
  return busy;
}

/** ICS-Link laden und belegte Zeiten liefern. Wirft bei Fehlern (nie „alles frei"). */
export async function fetchIcsBusy(url: string, min: Date, max: Date): Promise<Busy[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url.replace(/^webcal:\/\//i, "https://"), {
      signal: ctrl.signal,
      headers: { Accept: "text/calendar, text/plain;q=0.9, */*;q=0.1" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Kalender-Link nicht abrufbar (${res.status}).`);
    const text = await res.text();
    if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error("Kalender-Link liefert keine ICS-Daten.");
    return parseIcsBusy(text, min, max);
  } finally {
    clearTimeout(timer);
  }
}
