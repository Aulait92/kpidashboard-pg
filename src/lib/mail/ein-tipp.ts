// Vorlagen-Mails mit einem Tipp (Paket M6, Ole 18.11.2026, docs/plan-mail-vorlagen.md): Haken an der Stelle, an der der
// Vermittler ohnehin entscheidet, statt eines eigenen Dialogs.
//   nach_abschluss   Haken „Danke-Mail senden“ im Abschluss-Blatt neben „Glückwunsch per WhatsApp“ (Anlass „abschluss“)
//   tuer_offen       Haken beim Verlustgrund „Kein Interesse“, einmalig je Kontakt, nie nach Abmeldung oder STOPP
// Stufe je Vorlage (Customer.mailAblauf): „aus“ = kein Haken, „ein Tipp“ = Haken angeboten, „automatisch“ = Haken
// vorausgewählt. Gesendet wird über die zentrale Funktion (sendeVorlagenMail, von Hand: Sperren für Abmeldung und
// gelöschte Kontakte, Idempotenz je Anlass). Ohne Versand über die App (E-Mail-Funktionen aus, kein Versandweg) kommen
// Betreff und Text für „Im eigenen Mailprogramm öffnen“ bzw. „Text kopieren“ (components/mail-wege.tsx) mit.

import { prisma } from "@/lib/prisma";
import { leseMailAblauf } from "@/lib/mail/ablauf";
import { resendBereit } from "@/lib/mail/lead-versand";
import { ladeSperrDaten, sperrGrund, SPERR_TEXT, type SperrGrund } from "@/lib/mail/sperren";
import { bereiteVorlagenMail, sendeVorlagenMail } from "@/lib/mail/vorlagen-mail";
import type { VorlageKey } from "@/lib/mail/vorlagen";

export type EinTippMail = {
  key: VorlageKey;
  /** Haken: über die App senden (Postfach oder Versanddomain) */
  app: boolean;
  /** Ohne Versand über die App: Betreff und Text fürs eigene Mailprogramm */
  extern: { to: string; subject: string; text: string } | null;
  vorausgewaehlt: boolean;
  gesendet: boolean;
  an: string;
  /** Erster Satz der Mail für die Beschriftung des Hakens */
  vorschau: string;
  /** Ganze Mail für „Vorschau“ (Ole, 18.11.2026) */
  voll: { subject: string; text: string };
};

/** Erster Satz nach der Anrede (für die Zeile unter dem Haken). */
export function ersterSatz(text: string): string {
  const absaetze = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const kern = absaetze[1] ?? absaetze[0] ?? "";
  const satz = /^[^.!?]*[.!?]/.exec(kern.replace(/\s+/g, " "))?.[0] ?? kern;
  const t = satz.trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
}

/** Stand einer Ein-Tipp-Mail; null = nicht anbieten (Stufe aus, keine Adresse, gesperrt). */
export async function einTippMailStand(leadId: string, key: VorlageKey, o: { anlass: string; userId?: string | null }): Promise<EinTippMail | null> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { customerId: true, email: true, erasedAt: true, customer: { select: { mailAblauf: true } } } });
  if (!lead || lead.erasedAt || !lead.email?.trim()) return null;
  const stufe = leseMailAblauf(lead.customer.mailAblauf).stufen[key];
  if (stufe === "aus") return null;
  const [d, schon] = await Promise.all([
    ladeSperrDaten(leadId),
    prisma.leadMailVersand.count({ where: { leadId, vorlage: key, anlass: o.anlass, status: "gesendet" } }),
  ]);
  const grund: SperrGrund | null = sperrGrund(d, { vorlage: key, automatisch: false });
  if (grund && grund !== "mail_aus") return null;
  const gesendet = schon > 0 || (await prisma.contactMail.count({ where: { leadId, kind: key, status: { not: "nicht_versendet" } } })) > 0;
  const vb = await bereiteVorlagenMail(leadId, key, { userId: o.userId ?? null });
  if (!vb?.to) return null;
  const app = !grund && (!!vb.kontext.postfach || resendBereit());
  const inhalt = vb.inhalt({ text: "", html: "" });
  return {
    key,
    app,
    extern: app ? null : { to: vb.to, subject: inhalt.subject, text: inhalt.text },
    vorausgewaehlt: stufe === "auto" && app && !gesendet,
    gesendet,
    an: vb.to,
    vorschau: ersterSatz(inhalt.text),
    voll: { subject: inhalt.subject, text: inhalt.text },
  };
}

/** Mit einem Tipp senden (von Hand, über die App). Fehlertext in Sie-Form. */
export async function sendeEinTippMail(leadId: string, key: VorlageKey, o: { anlass: string; userId?: string | null; now?: Date }): Promise<{ ok: true } | { ok: false; error: string }> {
  const r = await sendeVorlagenMail(leadId, key, { automatisch: false, anlass: o.anlass, userId: o.userId ?? null, now: o.now });
  if (r.sent) return { ok: true };
  if (r.reason === "schon_gesendet") return { ok: false, error: "Diese E-Mail ist schon raus." };
  if (r.reason in SPERR_TEXT) return { ok: false, error: SPERR_TEXT[r.reason as SperrGrund] };
  if (r.reason === "not_configured") return { ok: false, error: "Der Versand über die App ist gerade nicht eingerichtet." };
  return { ok: false, error: "Die E-Mail konnte nicht gesendet werden." };
}
