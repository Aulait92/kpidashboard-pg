// Antwortadresse für Mails an Leads ohne verbundenes Postfach (Ole, 18.11.2026, Paket M2, docs/plan-mail-vorlagen.md
// Regel 4): Reply-To <kurzname>.<leadcode>@antwort.dein-beratungstermin.de. Antworten kommen über Resend Receiving
// (MX der Subdomain, Region EU) als Webhook „email.received“ an (lib/mail/eingang.ts), stehen im Kontaktverlauf und
// gehen als Weiterleitung an den Vermittler.
//
//   kurzname  Buchungsseite des Kunden (CalendarConnection.bookingSlug), nur zur Orientierung; ohne Slug entfällt er.
//   leadcode  8 Zeichen base32 aus HMAC(AUTH_SECRET, Lead-ID): nicht erratbar, je Lead fest, in Lead.antwortCode
//             gespeichert (Suche beim Eingang). Frühere Kurznamen (bookingSlugAlt) gelten beim Eingang weiter.
//   Schalter  MAIL_ANTWORT_EINGANG (Standard aus): aus = Reply-To bleibt die Adresse des Vermittlers.
// Mit verbundenem Postfach nie (Ole): Antworten landen dort direkt.
// Reine Funktionen getestet in tests/unit/mail-eingang.test.ts.

import crypto from "node:crypto";

export const ANTWORT_DOMAIN = "antwort.dein-beratungstermin.de";

/** Schalter MAIL_ANTWORT_EINGANG: Antwortadresse vergeben und Eingänge ohne Code verarbeiten. Standard aus. */
export function antwortEingangAn(env: Record<string, string | undefined> = process.env): boolean {
  return /^(1|true|ja|an|on)$/i.test((env.MAIL_ANTWORT_EINGANG ?? "").trim());
}

const BASE32 = "abcdefghijklmnopqrstuvwxyz234567";
export const CODE_LAENGE = 8;
const CODE = new RegExp(`^[a-z2-7]{${CODE_LAENGE}}$`);

/** Leadcode (rein): 8 Zeichen base32 (40 Bit) aus HMAC-SHA256 über die Lead-ID. */
export function leadCode(leadId: string, secret = process.env.AUTH_SECRET ?? "dev-secret"): string {
  const h = crypto.createHmac("sha256", secret).update(`mail-antwort:${leadId}`).digest();
  let bits = 0;
  let wert = 0;
  let out = "";
  for (const byte of h) {
    wert = (wert << 8) | byte;
    bits += 8;
    while (bits >= 5 && out.length < CODE_LAENGE) {
      out += BASE32[(wert >>> (bits - 5)) & 31];
      bits -= 5;
    }
    if (out.length >= CODE_LAENGE) break;
  }
  return out;
}

/** Kurzname für die Adresse (rein): klein, nur a-z, 0-9 und Bindestrich, höchstens 30 Zeichen; null, wenn leer. */
export function kurzname(slug: string | null | undefined): string | null {
  const s = (slug ?? "")
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30)
    .replace(/-$/, "");
  return s || null;
}

/** Antwortadresse (rein): „kurz.code@antwort…“, ohne Kurzname „code@antwort…“. */
export function antwortAdresse(kurz: string | null | undefined, code: string, domain = ANTWORT_DOMAIN): string {
  const k = kurzname(kurz);
  return `${k ? `${k}.` : ""}${code}@${domain}`;
}

/** Reine Adresse aus „Name <a@b>“ bzw. „a@b“, klein; null, wenn keine Adresse erkennbar. */
export function reineAdresse(v: string | null | undefined): string | null {
  const raw = (v ?? "").trim();
  if (!raw) return null;
  const m = /<([^<>\s]+@[^<>\s]+)>/.exec(raw);
  const a = (m ? m[1] : raw).trim().replace(/^mailto:/i, "").toLowerCase();
  return /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(a) ? a : null;
}

/**
 * Empfängeradresse auf der Antwort-Domain zerlegen (rein): `code` nur bei gültiger Form, `kurz` sonst der Rest.
 * null, wenn die Adresse nicht auf der Antwort-Domain liegt.
 */
export function parseAntwortAdresse(adresse: string, domain = ANTWORT_DOMAIN): { kurz: string | null; code: string | null } | null {
  const a = reineAdresse(adresse);
  if (!a) return null;
  const at = a.lastIndexOf("@");
  if (a.slice(at + 1) !== domain) return null;
  const local = a.slice(0, at).split("+")[0];
  const punkt = local.lastIndexOf(".");
  const letzter = punkt >= 0 ? local.slice(punkt + 1) : local;
  if (CODE.test(letzter)) return { kurz: punkt > 0 ? kurzname(local.slice(0, punkt)) : null, code: letzter };
  return { kurz: kurzname(local), code: null };
}

/**
 * Antwortadresse für diesen Lead (Datenbank): Code bei Bedarf speichern (fester Wert, daher ohne Wettlauf). null, wenn
 * es den Lead nicht gibt oder er gelöscht ist. `speichern: false` (Vorschau): nur berechnen.
 */
export async function antwortAdresseFuer(leadId: string, o: { speichern?: boolean } = {}): Promise<string | null> {
  const { prisma } = await import("@/lib/prisma");
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { antwortCode: true, erasedAt: true, customer: { select: { calendarConnection: { select: { bookingSlug: true } } } } },
  });
  if (!lead || lead.erasedAt) return null;
  let code = lead.antwortCode;
  if (!code) {
    code = leadCode(leadId);
    if (o.speichern !== false) {
      try {
        await prisma.lead.updateMany({ where: { id: leadId, antwortCode: null }, data: { antwortCode: code } });
      } catch {
        // Gleicher Code bei einem anderen Lead (40 Bit, praktisch ausgeschlossen): ohne Antwortadresse senden
        return null;
      }
    }
  }
  return antwortAdresse(lead.customer.calendarConnection?.bookingSlug ?? null, code);
}
