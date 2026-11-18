// E-Mails in der Customer Journey (Ole, 17.11.2026, docs/plan-mail-vorlagen.md): Stufe je Vorlage und BCC-Kopie je
// Kunde (Customer.mailAblauf). Rein, ohne Datenbank, auch im Browser nutzbar; getestet (tests/unit/mail-ablauf.test.ts).
//
//   Stufen:  auto = die App sendet von selbst (Auslöser in M3/M4), tipp = Vorschlag mit einem Tipp, aus = nie.
//   BCC:     Kopie jeder Mail, die über unsere Versanddomain (Resend) rausgeht, an eine wählbare Adresse
//            (Standard: die eigene). Mit verbundenem Postfach liegt die Mail ohnehin in „Gesendet“.
//   null:    Voreinstellungen laut Plan, BCC aus. „Ja, Mails in meinem Namen senden“ (Einstellungen → Assistent)
//            setzt die Voreinstellungen, schaltet die Kopie an und merkt sich den Zeitpunkt.

import type { VorlageKey } from "@/lib/mail/vorlagen";

export type MailStufe = "auto" | "tipp" | "aus";
export const MAIL_STUFEN: readonly MailStufe[] = ["auto", "tipp", "aus"] as const;
export const STUFE_LABEL: Record<MailStufe, string> = { auto: "Automatisch", tipp: "Ein Tipp", aus: "Aus" };

/** Alle Vorlagen in der Reihenfolge der Customer Journey (Liste in den Einstellungen). */
export const ABLAUF_VORLAGEN: readonly VorlageKey[] = [
  "termin_vorbereitung",
  "nicht_erreicht",
  "nicht_erschienen",
  "wie_besprochen",
  "angebot",
  "beratungsdoku",
  "nachfassen_angebot",
  "unterlagen_fehlen",
  "nach_abschluss",
  "willkommen",
  "kuendigung",
  "tuer_offen",
] as const;

/** Voreinstellungen laut Plan (Ole, 17.11.2026). */
export const STANDARD_STUFEN: Record<VorlageKey, MailStufe> = {
  termin_vorbereitung: "auto",
  nicht_erreicht: "auto",
  nicht_erschienen: "auto",
  wie_besprochen: "auto",
  nachfassen_angebot: "auto",
  angebot: "tipp",
  beratungsdoku: "tipp",
  unterlagen_fehlen: "tipp",
  nach_abschluss: "tipp",
  willkommen: "tipp",
  tuer_offen: "tipp",
  // Von Hand: Aufgabe, wenn der Komplettcheck einen zu ersetzenden Vertrag zeigt
  kuendigung: "tipp",
};

/** Vorlagen, die nie automatisch gehen (brauchen PDF, Prüfung oder Vertragsdaten): nur „ein Tipp“ oder „aus“. */
export const NUR_TIPP: ReadonlySet<VorlageKey> = new Set<VorlageKey>(["angebot", "beratungsdoku", "kuendigung"]);

/** Werbliche Mails (Nachfassen, erneute Ansprache): Abmeldelink im Rahmen, Abmeldung sperrt auch den Versand von Hand. */
export const WERBLICH: ReadonlySet<VorlageKey> = new Set<VorlageKey>(["nachfassen_angebot", "nicht_erschienen", "tuer_offen"]);

/** Wann die Mail kommt (eine Zeile in der Liste, Sie-Form). */
export const VORLAGE_WANN: Record<VorlageKey, string> = {
  termin_vorbereitung: "Mit der Terminbestätigung und am Vortag",
  nicht_erreicht: "Nach dem 2. Anrufversuch ohne Erfolg",
  nicht_erschienen: "Am selben Tag, wenn der Termin ausfällt",
  wie_besprochen: "Zum vereinbarten Tag",
  angebot: "Wenn Sie das Angebot über die App senden",
  beratungsdoku: "Mit dem Angebot",
  nachfassen_angebot: "5 Tage nach dem Angebot",
  unterlagen_fehlen: "Wenn Angaben fehlen, Erinnerung nach 3 Tagen",
  nach_abschluss: "Beim Eintragen des Abschlusses",
  willkommen: "Wenn die Police da ist",
  kuendigung: "Wenn ein alter Vertrag gekündigt werden muss",
  tuer_offen: "Bei Verlustgrund „kein Interesse“",
};

/** Auslöser, die schon laufen. Die übrigen automatischen Mails kommen mit den Paketen M3 und M4 („demnächst“). */
export const AUSLOESER_AKTIV: ReadonlySet<VorlageKey> = new Set<VorlageKey>([]);

export type MailBcc = { an: boolean; /** null = eigene Adresse des Logins */ adresse: string | null };

export type MailAblauf = {
  stufen: Record<VorlageKey, MailStufe>;
  bcc: MailBcc;
  /** „Ja, Mails in meinem Namen senden“ bestätigt (ISO); null = Erklärschritt noch offen */
  bestaetigtAt: string | null;
};

const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
export const istMailAdresse = (v: string | null | undefined) => !!v && EMAIL.test(v.trim());

const istStufe = (v: unknown): v is MailStufe => v === "auto" || v === "tipp" || v === "aus";

/** Erlaubte Stufe für eine Vorlage: „auto“ bei NUR_TIPP wird zu „tipp“. */
export function erlaubteStufe(key: VorlageKey, s: MailStufe): MailStufe {
  return s === "auto" && NUR_TIPP.has(key) ? "tipp" : s;
}

/** Customer.mailAblauf lesen; fehlende oder ungültige Angaben bekommen die Voreinstellung. */
export function leseMailAblauf(raw: unknown): MailAblauf {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const st = o.stufen && typeof o.stufen === "object" ? (o.stufen as Record<string, unknown>) : {};
  const stufen = { ...STANDARD_STUFEN };
  for (const k of ABLAUF_VORLAGEN) if (istStufe(st[k])) stufen[k] = erlaubteStufe(k, st[k]);
  const b = o.bcc && typeof o.bcc === "object" ? (o.bcc as Record<string, unknown>) : {};
  const adresse = typeof b.adresse === "string" && istMailAdresse(b.adresse) ? b.adresse.trim().toLowerCase() : null;
  const at = typeof o.bestaetigtAt === "string" && !Number.isNaN(Date.parse(o.bestaetigtAt)) ? o.bestaetigtAt : null;
  return { stufen, bcc: { an: b.an === true, adresse }, bestaetigtAt: at };
}

/** Als JSON speichern (nur die eigenen Felder). */
export function mailAblaufJson(a: MailAblauf): { stufen: Record<string, MailStufe>; bcc: MailBcc; bestaetigtAt: string | null } {
  return { stufen: { ...a.stufen }, bcc: { an: a.bcc.an, adresse: a.bcc.adresse }, bestaetigtAt: a.bestaetigtAt };
}

/** „Ja, Mails in meinem Namen senden“: Voreinstellungen, BCC an die eigene Adresse, bestätigt jetzt. */
export function voreinstellungen(now = new Date()): MailAblauf {
  return { stufen: { ...STANDARD_STUFEN }, bcc: { an: true, adresse: null }, bestaetigtAt: now.toISOString() };
}

/** Stufe einer Vorlage ändern (rein). */
export function mitStufe(a: MailAblauf, key: VorlageKey, s: MailStufe): MailAblauf {
  return { ...a, stufen: { ...a.stufen, [key]: erlaubteStufe(key, s) } };
}

/**
 * Empfänger der Kopie (nur Resend-Weg): gewählte Adresse, sonst die eigene. null, wenn aus, keine gültige Adresse
 * oder die Kopie an den Empfänger der Mail selbst ginge.
 */
export function bccEmpfaenger(a: MailAblauf, eigene: string | null | undefined, an?: string | null): string | null {
  if (!a.bcc.an) return null;
  const ziel = (a.bcc.adresse ?? eigene ?? "").trim().toLowerCase();
  if (!istMailAdresse(ziel)) return null;
  if (an && an.trim().toLowerCase() === ziel) return null;
  return ziel;
}
