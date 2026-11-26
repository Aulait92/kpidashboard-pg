// Benachrichtigung bei neuen Leads je Login (Ole, 26.11.2026, Anlass CL Capital Living: der Inhaber will jeden neuen
// Lead per E-Mail, obwohl alle Leads an seine Beraterin gehen). Rein, ohne Datenbank (Versand: lib/lead-benachrichtigung.ts).
//
//   meine = Leads, für die ich zuständig bin (Inhaber zusätzlich: Leads ohne Zuständigen, die sieht nur er)
//   alle  = jeder neue Lead im Team (nur Inhaber; Berater sehen fremde Leads nicht)
//   aus   = keine E-Mail (nur bei der E-Mail; Push „aus“ regelt das Gerät)
// Standard (Feld leer): Inhaber alle, Berater meine. E-Mail aus, wenn „Neue Leads per E-Mail“ am Konto aus ist.
// Gilt nur in Teams (mehr als ein Login); mit einem Login bleibt alles wie bisher.

export type LeadScope = "aus" | "meine" | "alle";
export type TeamRolle = "owner" | "advisor";

export type Empfaenger = {
  id: string;
  email: string;
  teamRole: string;
  leadMailScope: string | null;
  leadPushScope: string | null;
};

const istInhaber = (r: string) => r !== "advisor";

/** Wirksame Wahl für die E-Mail (Berater höchstens „meine“). */
export function mailScope(u: Pick<Empfaenger, "teamRole" | "leadMailScope">, kontoLeadMail = true): LeadScope {
  const s = u.leadMailScope;
  const gewaehlt: LeadScope | null = s === "aus" || s === "meine" || s === "alle" ? s : null;
  const wert = gewaehlt ?? (!kontoLeadMail ? "aus" : istInhaber(u.teamRole) ? "alle" : "meine");
  return wert === "alle" && !istInhaber(u.teamRole) ? "meine" : wert;
}

/** Wirksame Wahl für Push (kein „aus“: Mitteilungen schaltet man am Gerät ab). */
export function pushScope(u: Pick<Empfaenger, "teamRole" | "leadPushScope">): Exclude<LeadScope, "aus"> {
  if (!istInhaber(u.teamRole)) return "meine";
  return u.leadPushScope === "meine" ? "meine" : "alle";
}

/** Bekommt dieser Login zu diesem Lead etwas? (zustaendig = assignedUserId, null = niemand) */
export function betrifft(scope: LeadScope, u: Pick<Empfaenger, "id" | "teamRole">, zustaendig: string | null): boolean {
  if (scope === "aus") return false;
  if (scope === "alle") return true;
  if (zustaendig) return zustaendig === u.id;
  return istInhaber(u.teamRole);
}

/** Empfänger der E-Mail „Neuer Lead“ im Team (je Login höchstens einmal). */
export function mailEmpfaenger<T extends Empfaenger>(team: T[], zustaendig: string | null, kontoLeadMail = true): T[] {
  if (team.length < 2) return [];
  return team.filter((u) => betrifft(mailScope(u, kontoLeadMail), u, zustaendig));
}

/**
 * Empfänger des Push „Neuer Lead“. Ohne Zuständigen wie bisher an alle Logins des Kunden (Inhaber und Berater, die
 * Zuteilung holt ihn ab); mit Zuständigem an ihn und an Inhaber mit „alle“.
 */
export function pushEmpfaenger<T extends Empfaenger>(team: T[], zustaendig: string | null): T[] {
  if (!zustaendig || team.length < 2) return team;
  return team.filter((u) => u.id === zustaendig || pushScope(u) === "alle");
}

/** Text der E-Mail (Du/Sie gegenüber dem Vermittler). Nur Name, Produkt und Zuständige, keine Antworten. */
export function leadMailInhalt(o: {
  du: boolean;
  leadName: string | null;
  produkt: string | null;
  zustaendig: string | null;
  fuerMich: boolean;
  url: string;
}) {
  const name = o.leadName?.trim() || "ohne Name";
  const ihr = o.du ? "dein" : "Ihr";
  return {
    subject: `Neuer Lead: ${name}${o.produkt ? ` (${o.produkt})` : ""}`,
    greeting: "Hallo,",
    paragraphs: [o.fuerMich ? `es gibt einen neuen Lead für ${o.du ? "dich" : "Sie"}.` : `in ${ihr}em Team gibt es einen neuen Lead.`],
    list: [`Name: ${name}`, `Produkt: ${o.produkt?.trim() || "nicht angegeben"}`, `Zuständig: ${o.zustaendig?.trim() || "noch niemand"}`],
    button: { label: "Kontakt öffnen", url: o.url },
    fuss: o.du
      ? "Welche Leads du per E-Mail bekommst, stellst du unter Einstellungen → Erinnerungen & Aufgaben ein."
      : "Welche Leads Sie per E-Mail bekommen, stellen Sie unter Einstellungen → Erinnerungen & Aufgaben ein.",
  };
}
