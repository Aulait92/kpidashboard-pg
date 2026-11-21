// Team-Überblick für den Inhaber (Ole, 21.11.2026; UX-Notiz docs/ux/team-ueberblick-2026-11-21.md):
// je Mitglied die Termine der nächsten 7 Tage und was liegen bleibt. Rein (ohne Datenbank, auch im Browser nutzbar);
// die Abfragen stehen in lib/team-ueberblick-server.ts. Keine eigenen Regeln: jeder Block nutzt die Definition, die der
// Berater auf „Heute“ sieht (Rückrufliste, Wiedervorlagen, „Wie lief's?“, nächster Schritt aus lib/lead-next-step.ts).

import { NEXT_STEP_WARN_BELOW, nextStepRateOf } from "@/lib/lead-next-step";

const STUNDE = 60 * 60 * 1000;

/**
 * Schwellen, ab denen ein Mitglied gelb markiert wird und auf „Heute“ des Inhabers erscheint.
 * - Warten auf Anruf: ein neuer Lead, den niemand anschreibt (Rückrufliste „urgent“), wartet länger als 2 Std.
 *   (Speed-to-Lead: jeder zählt), oder 3 und mehr Kontakte stehen auf der Rückrufliste.
 * - Wiedervorlage überfällig: 3 und mehr, oder eine ist seit über 24 Std. fällig.
 * - Ergebnis fehlt: 3 und mehr Termine ohne Ergebnis, oder einer liegt über 24 Std. zurück.
 * - Ohne nächsten Schritt: Quote „Leads mit nächstem Schritt“ unter 80 % (NEXT_STEP_WARN_BELOW, wie Zahlen und Admin).
 */
export const TEAM_SCHWELLEN = {
  neuerLeadWartetMs: 2 * STUNDE,
  anrufAb: 3,
  // Ole, 21.11.2026: schon ein Rückruf, der länger als 24 Std. wartet, reicht
  anrufAlterMs: 24 * STUNDE,
  ueberfaelligAb: 3,
  ueberfaelligAlterMs: 24 * STUNDE,
  ergebnisAb: 3,
  ergebnisAlterMs: 24 * STUNDE,
  ohneSchrittQuoteUnter: NEXT_STEP_WARN_BELOW,
} as const;

/** Zeitraum der Termine im Überblick. */
export const TERMINE_TAGE = 7;

export type UeberblickTermin = { id: string; startsAt: string; mode: string; leadId: string | null; name: string };
export type UeberblickLead = { leadId: string; name: string; /** Bezugszeit (Eingang, Fälligkeit, Terminbeginn, letzte Änderung) */ at: string };

export type OffenArt = "anruf" | "wiedervorlage" | "ergebnis" | "ohneSchritt";
export const OFFEN_REIHENFOLGE: OffenArt[] = ["anruf", "wiedervorlage", "ergebnis", "ohneSchritt"];
export const OFFEN_TITEL: Record<OffenArt, string> = {
  anruf: "Warten auf Anruf",
  wiedervorlage: "Wiedervorlage überfällig",
  ergebnis: "Ergebnis fehlt",
  ohneSchritt: "Ohne nächsten Schritt",
};

export type MitgliedUeberblick = {
  userId: string;
  termine: UeberblickTermin[];
  offen: Record<OffenArt, UeberblickLead[]>;
  /** Quote „Leads mit nächstem Schritt“ (0..1) wie auf Zahlen, null ohne offene Leads */
  quote: number | null;
  /** Summe der offenen Punkte (jeder Lead höchstens einmal) */
  anzahlOffen: number;
  /** Blöcke über der Schwelle, in OFFEN_REIHENFOLGE */
  warn: OffenArt[];
};

// ─── Eingaben (aus der Datenbank, siehe lib/team-ueberblick-server.ts) ─────────────
export type TerminRoh = { id: string; startsAt: Date; mode: string; calendarKey: string | null; leadId: string | null; leadName: string | null; leadAssignedUserId: string | null };
export type AnrufRoh = { leadId: string; name: string | null; createdAt: Date; urgent: boolean; assignedUserId: string | null };
export type WiedervorlageRoh = { leadId: string; name: string | null; followUpAt: Date; assignedUserId: string | null };
export type ErgebnisRoh = { leadId: string; name: string | null; startsAt: Date; calendarKey: string | null; leadAssignedUserId: string | null };
export type OhneSchrittRoh = { leadId: string; name: string | null; statusChangedAt: Date; assignedUserId: string | null };
export type QuoteRoh = { open: number; withoutNextStep: number };

export type UeberblickEingabe = {
  now: Date;
  memberIds: string[];
  /** Wer nicht zugeteilte Leads und Termine im Kalender der Agentur bekommt (der Inhaber) */
  fallbackUserId: string;
  termine: TerminRoh[];
  anrufe: AnrufRoh[];
  wiedervorlagen: WiedervorlageRoh[];
  ergebnisse: ErgebnisRoh[];
  ohneSchritt: OhneSchrittRoh[];
  /** nextStepRatesByAdvisor: Schlüssel null = nicht zugeteilt */
  quoten: Map<string | null, QuoteRoh>;
};

/**
 * Wem gehört der Termin? Kalender des Beraters (calendarKey „user:<id>“, wie appointmentScope), sonst der zuständige
 * Berater des Leads, sonst der Inhaber.
 */
export function terminZustaendig(t: { calendarKey: string | null; leadAssignedUserId: string | null }, members: Set<string>, fallback: string): string {
  const k = t.calendarKey?.startsWith("user:") ? t.calendarKey.slice(5) : null;
  if (k && members.has(k)) return k;
  if (t.leadAssignedUserId && members.has(t.leadAssignedUserId)) return t.leadAssignedUserId;
  return fallback;
}

const leadZustaendig = (id: string | null, members: Set<string>, fallback: string) => (id && members.has(id) ? id : fallback);
const nameOf = (n: string | null | undefined, ersatz = "Lead") => n?.trim() || ersatz;

/** Überblick je Mitglied. Jeder Lead steht höchstens einmal unter „Offen“ (Reihenfolge wie OFFEN_REIHENFOLGE). */
export function baueTeamUeberblick(e: UeberblickEingabe): Map<string, MitgliedUeberblick> {
  const members = new Set(e.memberIds);
  const fb = members.has(e.fallbackUserId) ? e.fallbackUserId : e.memberIds[0];
  const out = new Map<string, MitgliedUeberblick>();
  for (const id of e.memberIds) {
    out.set(id, { userId: id, termine: [], offen: { anruf: [], wiedervorlage: [], ergebnis: [], ohneSchritt: [] }, quote: null, anzahlOffen: 0, warn: [] });
  }
  const bis = e.now.getTime() + TERMINE_TAGE * 24 * STUNDE;
  for (const t of [...e.termine].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())) {
    if (t.startsAt.getTime() >= bis) continue;
    out.get(terminZustaendig(t, members, fb))!.termine.push({ id: t.id, startsAt: t.startsAt.toISOString(), mode: t.mode, leadId: t.leadId, name: nameOf(t.leadName, "Termin") });
  }

  const gesehen = new Map<string, Set<string>>(); // je Mitglied: Leads, die schon unter „Offen“ stehen
  const add = (userId: string, art: OffenArt, l: UeberblickLead) => {
    const s = gesehen.get(userId) ?? new Set<string>();
    if (s.has(l.leadId)) return;
    s.add(l.leadId);
    gesehen.set(userId, s);
    out.get(userId)!.offen[art].push(l);
  };
  // Wiedervorlagen vor Rückrufen eintragen: wie auf Heute steht ein Kontakt mit Wiedervorlage nicht zusätzlich auf der
  // Rückrufliste (außer „neu, sofort anrufen“). Anzeige-Reihenfolge bleibt OFFEN_REIHENFOLGE.
  const anrufe = [...e.anrufe].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  for (const a of anrufe.filter((x) => x.urgent)) add(leadZustaendig(a.assignedUserId, members, fb), "anruf", { leadId: a.leadId, name: nameOf(a.name), at: a.createdAt.toISOString() });
  for (const w of [...e.wiedervorlagen].sort((a, b) => a.followUpAt.getTime() - b.followUpAt.getTime())) {
    add(leadZustaendig(w.assignedUserId, members, fb), "wiedervorlage", { leadId: w.leadId, name: nameOf(w.name), at: w.followUpAt.toISOString() });
  }
  for (const a of anrufe.filter((x) => !x.urgent)) add(leadZustaendig(a.assignedUserId, members, fb), "anruf", { leadId: a.leadId, name: nameOf(a.name), at: a.createdAt.toISOString() });
  // Ergebnis fehlt: je Lead der jüngste Termin (gleiche Zuständigkeit wie bei den Terminen)
  for (const r of [...e.ergebnisse].sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())) {
    add(terminZustaendig(r, members, fb), "ergebnis", { leadId: r.leadId, name: nameOf(r.name), at: r.startsAt.toISOString() });
  }
  for (const l of [...e.ohneSchritt].sort((a, b) => a.statusChangedAt.getTime() - b.statusChangedAt.getTime())) {
    add(leadZustaendig(l.assignedUserId, members, fb), "ohneSchritt", { leadId: l.leadId, name: nameOf(l.name), at: l.statusChangedAt.toISOString() });
  }
  // Rückrufliste wieder nach Eingang (älteste zuerst)
  for (const m of out.values()) m.offen.anruf.sort((a, b) => a.at.localeCompare(b.at));

  // Quote je Mitglied; nicht Zugeteilte zählen beim Inhaber (er sieht sie als Einziger)
  const quoten = new Map<string, QuoteRoh>();
  for (const [k, q] of e.quoten) {
    const id = leadZustaendig(k, members, fb);
    const s = quoten.get(id) ?? { open: 0, withoutNextStep: 0 };
    quoten.set(id, { open: s.open + q.open, withoutNextStep: s.withoutNextStep + q.withoutNextStep });
  }
  const urgent = new Map(e.anrufe.map((a) => [a.leadId, a.urgent]));
  for (const m of out.values()) {
    const q = quoten.get(m.userId);
    m.quote = q ? nextStepRateOf(q.open, q.withoutNextStep) : null;
    m.anzahlOffen = OFFEN_REIHENFOLGE.reduce((n, art) => n + m.offen[art].length, 0);
    m.warn = warnGruende(m, urgent, e.now);
  }
  return out;
}

/** Blöcke über der Schwelle (TEAM_SCHWELLEN). */
export function warnGruende(m: Pick<MitgliedUeberblick, "offen" | "quote">, urgent: Map<string, boolean>, now: Date): OffenArt[] {
  const t = now.getTime();
  const alt = (l: UeberblickLead, ms: number) => t - new Date(l.at).getTime() > ms;
  const s = TEAM_SCHWELLEN;
  const warn: Record<OffenArt, boolean> = {
    anruf: m.offen.anruf.length >= s.anrufAb || m.offen.anruf.some((l) => (urgent.get(l.leadId) && alt(l, s.neuerLeadWartetMs)) || alt(l, s.anrufAlterMs)),
    wiedervorlage: m.offen.wiedervorlage.length >= s.ueberfaelligAb || m.offen.wiedervorlage.some((l) => alt(l, s.ueberfaelligAlterMs)),
    ergebnis: m.offen.ergebnis.length >= s.ergebnisAb || m.offen.ergebnis.some((l) => alt(l, s.ergebnisAlterMs)),
    ohneSchritt: m.offen.ohneSchritt.length > 0 && m.quote != null && m.quote < s.ohneSchrittQuoteUnter,
  };
  return OFFEN_REIHENFOLGE.filter((a) => warn[a]);
}

const plural = (n: number, eins: string, viele: string) => `${n} ${n === 1 ? eins : viele}`;

/** Ein Block als kurzer Satz, z. B. „4 Leads warten auf Anruf“. */
export function offenSatz(art: OffenArt, n: number): string {
  switch (art) {
    case "anruf":
      return n === 1 ? "1 Lead wartet auf Anruf" : `${n} Leads warten auf Anruf`;
    case "wiedervorlage":
      return `${plural(n, "Wiedervorlage", "Wiedervorlagen")} überfällig`;
    case "ergebnis":
      return `${plural(n, "Termin", "Termine")} ohne Ergebnis`;
    case "ohneSchritt":
      return `${plural(n, "Lead", "Leads")} ohne nächsten Schritt`;
  }
}

/** Statuszeile der zugeklappten Mitgliederzeile, z. B. „2 Termine in 7 Tagen · 3 Aufgaben offen“. */
export function statusZeile(m: Pick<MitgliedUeberblick, "termine" | "anzahlOffen">): string {
  return `${termineText(m)} · ${offenText(m)}`;
}

export const termineText = (m: Pick<MitgliedUeberblick, "termine">) => `${termineKurz(m)} in ${TERMINE_TAGE} Tagen`;
/** Ohne Zeitraum, für die Statuszeile am Handy (390 px: sonst bricht sie um; der Zeitraum steht im aufgeklappten Teil). */
export const termineKurz = (m: Pick<MitgliedUeberblick, "termine">) => (m.termine.length ? plural(m.termine.length, "Termin", "Termine") : "Keine Termine");
export const offenText = (m: Pick<MitgliedUeberblick, "anzahlOffen">) =>
  m.anzahlOffen ? `${plural(m.anzahlOffen, "Aufgabe", "Aufgaben")} offen` : "alles erledigt";

/** Zeile auf „Heute“ des Inhabers: der dringendste Block über der Schwelle, dazu die Zahl der übrigen offenen Punkte. */
export function heuteSatz(m: Pick<MitgliedUeberblick, "offen" | "warn" | "anzahlOffen">): string | null {
  if (!m.warn.length) return null;
  const erst = m.offen[m.warn[0]].length;
  const rest = m.anzahlOffen - erst;
  // Der dringendste Block zuerst, der Rest als Zahl (eine Zeile auch am Handy)
  return rest > 0 ? `${offenSatz(m.warn[0], erst)}, ${rest} weitere offen` : offenSatz(m.warn[0], erst);
}

/** Höchstens so viele Personen auf „Heute“. */
export const HEUTE_MAX_PERSONEN = 3;

/** Wer erscheint auf „Heute“ des Inhabers: über der Schwelle, nicht er selbst, meiste offene Punkte zuerst, höchstens 3. */
export function heuteAuswahl<T extends Pick<MitgliedUeberblick, "userId" | "warn" | "anzahlOffen">>(alle: T[], selbst: string | null): T[] {
  return alle
    .filter((m) => m.userId !== selbst && m.warn.length > 0)
    .sort((a, b) => b.warn.length - a.warn.length || b.anzahlOffen - a.anzahlOffen)
    .slice(0, HEUTE_MAX_PERSONEN);
}
