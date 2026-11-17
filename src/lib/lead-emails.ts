// Weitere E-Mail-Adressen eines Leads (Ole, 17.11.2026): Nennt der Lead im Chat eine neue Adresse (bot.ts update_email),
// wird sie die Haupt-E-Mail und die bisherige bleibt als weitere Adresse erhalten. Rein, ohne Datenbank, testbar.

import { EMAIL_RE } from "@/lib/whatsapp/phone";

const norm = (e: string | null | undefined) => (e ?? "").trim().toLowerCase();

/** Liste bereinigen: kleingeschrieben, gültig, ohne Dubletten (Groß/Klein egal) und ohne die Haupt-E-Mail. */
export function bereinigeWeitereEmails(list: readonly (string | null | undefined)[], haupt: string | null | undefined): string[] {
  const h = norm(haupt);
  const out: string[] = [];
  for (const raw of list) {
    const e = norm(raw);
    if (!e || e === h || !EMAIL_RE.test(e) || out.includes(e)) continue;
    out.push(e);
  }
  return out;
}

/** Neue Haupt-E-Mail: die bisherige wandert vorne in die weiteren Adressen. */
export function mitNeuerEmail(o: { alt: string | null | undefined; weitere: readonly string[] | null | undefined; neu: string }): { email: string; weitereEmails: string[] } {
  const email = norm(o.neu);
  return { email, weitereEmails: bereinigeWeitereEmails([o.alt, ...(o.weitere ?? [])], email) };
}

/** Eingabe „a@x.de, b@y.de“ (Komma, Semikolon, Leerzeichen oder Zeilen) → Liste bzw. Fehler bei ungültiger Adresse. */
export function parseWeitereEmails(text: string, haupt: string | null | undefined): { ok: true; list: string[] } | { ok: false; error: string } {
  const teile = text.split(/[\s,;]+/).map(norm).filter(Boolean);
  const falsch = teile.find((e) => !EMAIL_RE.test(e));
  if (falsch) return { ok: false, error: `Die weitere E-Mail-Adresse „${falsch}“ sieht nicht gültig aus.` };
  return { ok: true, list: bereinigeWeitereEmails(teile, haupt) };
}

/** Suchbedingung: vollständige Adresse auch unter den weiteren E-Mails finden (Postgres-Array, exakt, kleingeschrieben). */
export function weitereEmailsSuche(q: string): { weitereEmails: { has: string } }[] {
  const e = norm(q);
  return e.includes("@") ? [{ weitereEmails: { has: e } }] : [];
}
