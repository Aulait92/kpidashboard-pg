// E-Mails aus der Kontaktakte (Ole, 23.11.2026): Vorlagen mit Platzhaltern, Empfänger und Prüfung vor dem Senden.
// Rein (ohne Datenbank), damit das Fenster im Browser dieselbe Füllung zeigt, die der Server prüft.
//
// Platzhalter: {anrede} („Hallo Herr Weber“ bzw. „Hallo Max“, ohne Komma), {vorname}, {nachname}, {firma},
// {angebotslink} (Link zum aktuellen Angebot; ohne Angebot entfällt die ganze Zeile), {ole} (Name und Firma des
// Absenders). Sie-Form ist Standard; die Du-Fassung einer Vorlage (bodyDu) gilt, wenn im Fenster „Du“ gewählt ist.

export const CRM_PLATZHALTER = ["{anrede}", "{vorname}", "{nachname}", "{firma}", "{angebotslink}", "{ole}"] as const;
type Key = (typeof CRM_PLATZHALTER)[number] extends `{${infer K}}` ? K : never;

export type CrmVorlage = { id: string; name: string; subject: string; body: string; bodyDu: string | null };
export type CrmWerte = Record<Key, string>;
export type CrmKontakt = { name: string; salutation: string | null; firstName: string | null; lastName: string | null };

const gross = (s: string) => (s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s);

/** Begrüßung ohne Komma: Sie „Hallo Herr Weber“ (sonst „Guten Tag“), Du „Hallo Max“ (sonst „Hallo“). */
export function crmAnrede(k: CrmKontakt, du: boolean): string {
  if (du) {
    const vor = k.firstName?.trim();
    return vor ? `Hallo ${vor}` : "Hallo";
  }
  const sal = k.salutation?.trim();
  const nach = k.lastName?.trim();
  if (sal && /^(herr|frau)$/i.test(sal) && nach) return `Hallo ${gross(sal)} ${nach}`;
  return "Guten Tag";
}

/** Name und Firma unter der Mail: Anzeigename, sonst aus der Adresse („ole.kannapinn@…“ → „Ole Kannapinn“). */
export function absenderName(displayName: string | null | undefined, email: string): string {
  const name =
    displayName?.trim() ||
    email
      .split("@")[0]
      .split(/[._-]+/)
      .filter(Boolean)
      .map(gross)
      .join(" ");
  return `${name}\nperformancegrowth`;
}

export function crmWerte(k: CrmKontakt, x: { du: boolean; angebotslink: string | null; absender: string }): CrmWerte {
  return {
    anrede: crmAnrede(k, x.du),
    vorname: k.firstName?.trim() ?? "",
    nachname: k.lastName?.trim() ?? "",
    firma: k.name.trim(),
    angebotslink: x.angebotslink ?? "",
    ole: x.absender,
  };
}

/**
 * Platzhalter füllen. Eine Zeile mit leerem {angebotslink} entfällt ganz (samt doppelter Leerzeile danach);
 * andere leere Werte werden einfach leer eingesetzt. Unbekannte Klammern bleiben stehen.
 */
export function fuelleCrm(text: string, w: CrmWerte): string {
  const zeilen = text.replace(/\r\n/g, "\n").split("\n");
  const raus: string[] = [];
  for (const z of zeilen) {
    if (z.includes("{angebotslink}") && !w.angebotslink) {
      // Leerzeile davor nicht doppelt stehen lassen
      if (raus.length && raus[raus.length - 1].trim() === "") raus.pop();
      continue;
    }
    raus.push(z.replace(/\{(anrede|vorname|nachname|firma|angebotslink|ole)\}/g, (_, k: Key) => w[k]));
  }
  return raus.join("\n").replace(/^\n+/, "");
}

/** Betreff und Text einer Vorlage für diesen Kontakt (Du-Fassung, wenn gewählt und vorhanden). */
export function vorlageFuellen(v: CrmVorlage, w: CrmWerte, du: boolean): { subject: string; body: string } {
  return { subject: fuelleCrm(v.subject, w).trim(), body: fuelleCrm(du && v.bodyDu?.trim() ? v.bodyDu : v.body, w) };
}

/** Noch ungefüllte Platzhalter im Text (z. B. von Hand eingetippt). */
export function offenePlatzhalter(text: string): string[] {
  return [...new Set(text.match(/\{(anrede|vorname|nachname|firma|angebotslink|ole)\}/g) ?? [])];
}

const MAIL_RE = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[a-z]{2,}$/i;
export const gueltigeAdresse = (a: string) => MAIL_RE.test(a.trim());

/** Adressen des Kontakts zur Auswahl (Haupt-Adresse zuerst, ohne Dubletten und ungültige). */
export function empfaengerListe(c: { email: string; altEmails?: string[] | null }): string[] {
  const alle = [c.email, ...(c.altEmails ?? [])].map((a) => a.trim().toLowerCase()).filter(gueltigeAdresse);
  // Platzhalter-Adressen (Art. 17, Import ohne Adresse) nie anbieten
  return [...new Set(alle)].filter((a) => !a.endsWith(".invalid"));
}

export const BETREFF_MAX = 200;
export const TEXT_MAX = 10_000;

export type MailEingabe = { to: string; subject: string; body: string };

/** Prüfung vor dem Senden (Server): Empfänger gehört zum Kontakt, Betreff und Text da, nichts mehr offen. */
export function pruefeMail(m: MailEingabe, erlaubt: string[]): { ok: true; mail: MailEingabe } | { ok: false; error: string } {
  const to = m.to.trim().toLowerCase();
  const subject = m.subject.replace(/[\r\n]+/g, " ").trim();
  const body = m.body.replace(/\r\n/g, "\n").trim();
  if (!gueltigeAdresse(to)) return { ok: false, error: "Bitte eine gültige E-Mail-Adresse wählen." };
  if (!erlaubt.includes(to)) return { ok: false, error: "Diese Adresse gehört nicht zum Kontakt." };
  if (!subject) return { ok: false, error: "Bitte einen Betreff eingeben." };
  if (!body) return { ok: false, error: "Bitte einen Text eingeben." };
  if (subject.length > BETREFF_MAX) return { ok: false, error: `Der Betreff ist zu lang (höchstens ${BETREFF_MAX} Zeichen).` };
  if (body.length > TEXT_MAX) return { ok: false, error: "Der Text ist zu lang." };
  const offen = offenePlatzhalter(`${subject}\n${body}`);
  if (offen.length) return { ok: false, error: `Noch nicht ausgefüllt: ${offen.join(", ")}` };
  return { ok: true, mail: { to, subject, body } };
}

/** Kurzfassung für den Verlauf (Betreff als Titel, Text gekürzt). */
export function verlaufEintrag(m: MailEingabe, von: string): { outcome: string; note: string } {
  const kurz = m.body.length > 600 ? `${m.body.slice(0, 600).trimEnd()} …` : m.body;
  return { outcome: `E-Mail: ${m.subject}`.slice(0, 190), note: `An: ${m.to}\nVon: ${von}\n\n${kurz}` };
}

/** Eingaben im Vorlagen-Formular prüfen (Einstellungen). */
export function pruefeVorlage(v: { name: string; subject: string; body: string; bodyDu?: string | null }): { ok: true; v: Omit<CrmVorlage, "id"> } | { ok: false; error: string } {
  const name = v.name.trim();
  const subject = v.subject.replace(/[\r\n]+/g, " ").trim();
  const body = v.body.replace(/\r\n/g, "\n").trim();
  const bodyDu = v.bodyDu?.replace(/\r\n/g, "\n").trim() || null;
  if (!name || name.length > 80) return { ok: false, error: "Bitte einen Namen (bis 80 Zeichen) eingeben." };
  if (!subject || subject.length > BETREFF_MAX) return { ok: false, error: "Bitte einen Betreff eingeben." };
  if (!body || body.length > TEXT_MAX || (bodyDu?.length ?? 0) > TEXT_MAX) return { ok: false, error: "Bitte einen Text eingeben (höchstens 10.000 Zeichen)." };
  return { ok: true, v: { name, subject, body, bodyDu } };
}
