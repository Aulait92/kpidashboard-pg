// Rahmen der Vorlagen-Mails an Leads (Ole, 17.11.2026, Paket M0): Text aus der Vorlage, Signatur des Versandwegs
// (Postfach oder Anbieterangaben), optional Knöpfe (z. B. Termin buchen) und bei werblichen Mails der Abmeldelink.
// Rein, ohne Datenbank (tests/unit/mail-vorlagen-zentral.test.ts). Keine Gedankenstriche, Ansprache neutral.

import type { LeadSignatur } from "@/lib/mail/lead-absender";

export type MailKnopf = { label: string; url: string };

/** Platzhalter für die Signatur im gefüllten Text (wird je Versandweg ersetzt). */
export const SIGNATUR_MARKE = "\u0000SIGNATUR\u0000";

/** Abmeldehinweis unter werblichen Mails (für Du und Sie gleich). */
export const ABMELDE_TEXT = "Keine weiteren E-Mails gewünscht? Hier abmelden:";

function esc(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Absatz als HTML: Zeilenumbrüche, Adressen anklickbar. */
function absatz(t: string): string {
  return esc(t)
    .replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}" style="color:#2563eb">${u}</a>`)
    .replace(/\n/g, "<br>");
}

const knopf = (k: MailKnopf, primary: boolean) =>
  `<a href="${esc(k.url)}" style="display:inline-block;margin:4px 6px 4px 0;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;${
    primary ? "background:#2563eb;color:#ffffff" : "border:1px solid #d6dde8;color:#0b1220"
  }">${esc(k.label)}</a>`;

/**
 * Text und HTML aus dem gefüllten Vorlagentext (`text` enthält SIGNATUR_MARKE an der Stelle der Signatur, sonst
 * kommt sie ans Ende). Knöpfe stehen vor der Signatur, der Abmeldelink klein darunter.
 */
export function mailRahmen(o: { text: string; signatur: LeadSignatur | null; knoepfe?: MailKnopf[]; abmeldeUrl?: string | null }): { text: string; html: string } {
  const sig = o.signatur;
  const roh = o.text.includes(SIGNATUR_MARKE) ? o.text : sig ? `${o.text.trimEnd()}\n\n${SIGNATUR_MARKE}` : o.text;
  const [vor, nach = ""] = roh.split(SIGNATUR_MARKE);
  const knoepfe = (o.knoepfe ?? []).filter((k) => k.url.trim());
  const abmelden = o.abmeldeUrl?.trim() || null;

  const text = [
    vor.trimEnd(),
    ...(knoepfe.length ? ["", ...knoepfe.map((k) => `${k.label}: ${k.url}`)] : []),
    ...(roh.includes(SIGNATUR_MARKE) && sig ? ["", sig.text] : []),
    ...(nach.trim() ? ["", nach.trim()] : []),
    ...(abmelden ? ["", `${ABMELDE_TEXT} ${abmelden}`] : []),
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const absaetze = (t: string) =>
    t
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => `<p style="margin:0 0 14px">${absatz(p)}</p>`)
      .join("");
  const html = `
<div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0b1220;font-size:15px;line-height:1.5">
  ${absaetze(vor)}
  ${knoepfe.length ? `<p style="margin:4px 0 8px">${knoepfe.map((k, i) => knopf(k, i === 0)).join("")}</p>` : ""}
  ${sig ? sig.html : ""}
  ${absaetze(nach)}
  ${abmelden ? `<p style="margin:28px 0 0;font-size:12px;color:#6b7a96">${esc(ABMELDE_TEXT)} <a href="${esc(abmelden)}" style="color:#6b7a96">abmelden</a></p>` : ""}
</div>`;
  return { text, html };
}
