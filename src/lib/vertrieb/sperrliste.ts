// Feste Sperrliste im Vertrieb (Ole, 16.11.2026): An diese Adressen und Domains geht aus der App nie eine Nachricht
// (Follow-ups, Später-Abfolge, Zahlungserinnerung, WhatsApp über die Support-Nummer). Anlass: Unterlassungsvertrag
// (Az. ABCNX), jede weitere Werbe-Mail wäre eine Vertragsstrafe. Einzelne Adressen stehen nur als SHA-256-Hash im
// Code (keine personenbezogenen Daten im Repo); weitere Einträge ohne Deploy über VERTRIEB_SPERRLISTE
// (kommagetrennt, Adressen oder @domain). Dazu je Kontakt das Merkmal „nie kontaktieren“ (Ole, 19.11.2026,
// lib/vertrieb/nie-kontaktieren-server.ts): Austragung, Widerspruch, Datenschutzfrage, Abmeldung, von Hand. Gesetzt
// trägt es die Adresse auch in die Instantly-Blocklist ein und stoppt die Kampagnen; die feste Liste hier nicht.

import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

/** Gesperrte Domains (inkl. Subdomains). */
export const SPERR_DOMAINS = ["minimi-kanzlei.de", "getminimi.de", "getminimi.com"] as const;

/** SHA-256 (hex) gesperrter E-Mail-Adressen, klein geschrieben und ohne Leerzeichen. */
export const SPERR_EMAIL_HASHES: readonly string[] = [
  // Unterlassungsvertrag Az. ABCNX (16.11.2026). Nur die Adresse, nicht die Domain (Allianz-Vertreter sind Zielgruppe).
  "083c7c828aa64dc70ad2929eca14c9ed3647e66e1d02cc8bb75aad413eaa62d5",
];

const hash = (email: string) => createHash("sha256").update(email).digest("hex");
const norm = (email: string) => email.trim().toLowerCase();

/** SHA-256 (hex) einer Adresse, klein geschrieben und ohne Leerzeichen (Sperrvermerk gelöschter Kontakte). */
export const emailHash = (email: string) => hash(norm(email));

function envEintraege(): { emails: Set<string>; domains: string[] } {
  const raw = (process.env.VERTRIEB_SPERRLISTE ?? "").split(",").map(norm).filter(Boolean);
  return { emails: new Set(raw.filter((e) => !e.startsWith("@"))), domains: raw.filter((e) => e.startsWith("@")).map((d) => d.slice(1)) };
}

/** Steht diese Adresse auf der Sperrliste? (rein, ohne Datenbank) */
export function emailGesperrt(email: string | null | undefined): boolean {
  const e = norm(email ?? "");
  if (!e.includes("@")) return false;
  const domain = e.split("@").pop()!;
  const env = envEintraege();
  const domains = [...SPERR_DOMAINS, ...env.domains];
  if (domains.some((d) => domain === d || domain.endsWith(`.${d}`))) return true;
  return env.emails.has(e) || SPERR_EMAIL_HASHES.includes(hash(e));
}

/**
 * Sperrvermerk einer Domain (Ole, 19.11.2026, Datenschutz und Recht): SHA-256 von „@domain“, klein geschrieben. Steht in
 * SalesContact.sperrHashes neben den Adress-Hashes; nur bei eigener Agentur-Domain (nicht Freemail, nicht Konzern bzw.
 * Portal, lib/vertrieb/datenschutz-recht.ts sperrDomainVon).
 */
export const domainHash = (domain: string) => hash(`@${domain.trim().toLowerCase().replace(/^@/, "")}`);

/** Domain-Teile einer Adresse, von der vollen Domain bis zur Registrierungsdomain (a.b.agentur.de → a.b.agentur.de, b.agentur.de, agentur.de). */
function domainsVon(email: string): string[] {
  const teile = (email.split("@").pop() ?? "").split(".").filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i <= teile.length - 2; i++) out.push(teile.slice(i).join("."));
  return out;
}

/**
 * Adressen, die über einen Sperrvermerk als Hash gesperrt sind: auf Verlangen gelöscht (Art. 17, lib/vertrieb/art17.ts;
 * dort steht nur noch der SHA-256 in SalesContact.sperrHashes) oder Domain eines Datenschutz- bzw. Rechtsfalls (Hash der
 * Domain, lib/vertrieb/datenschutz-recht-server.ts). Liefert die Adressen aus der Eingabe, die gesperrt sind (klein
 * geschrieben).
 */
export async function geloeschteAdressen(emails: (string | null | undefined)[]): Promise<Set<string>> {
  const nachHash = new Map<string, Set<string>>();
  const merke = (h: string, e: string) => {
    const set = nachHash.get(h) ?? new Set<string>();
    set.add(e);
    nachHash.set(h, set);
  };
  for (const roh of emails) {
    if (!roh || !roh.includes("@")) continue;
    const e = norm(roh);
    merke(emailHash(e), e);
    for (const d of domainsVon(e)) merke(domainHash(d), e);
  }
  const out = new Set<string>();
  if (!nachHash.size) return out;
  const hashes = [...nachHash.keys()];
  for (let i = 0; i < hashes.length; i += 1000) {
    const teil = hashes.slice(i, i + 1000);
    const rows = await prisma.salesContact.findMany({ where: { sperrHashes: { hasSome: teil } }, select: { sperrHashes: true } });
    for (const r of rows) for (const h of r.sperrHashes) for (const e of nachHash.get(h) ?? []) out.add(e);
  }
  return out;
}

/** Hülle des auf Verlangen gelöschten Kontakts zu dieser Adresse (über den Hash) oder null. */
export async function geloeschterKontaktId(email: string | null | undefined): Promise<string | null> {
  if (!email?.includes("@")) return null;
  const c = await prisma.salesContact.findFirst({ where: { sperrHashes: { has: emailHash(email) } }, select: { id: true } });
  return c?.id ?? null;
}

/**
 * Vertriebskontakt gesperrt? „Nie kontaktieren“, Hauptadresse, weitere Adressen, Cold-Mail-Abmeldung, ein Fall
 * „Datenschutz und Recht“ (auch wenn die Sperre von Hand aufgehoben wurde) oder ein Sperrvermerk als Hash (Adresse
 * bzw. eigene Domain eines anderen Kontakts mit Datenschutz- oder Rechtsfall).
 */
export async function kontaktGesperrt(contactId: string | null | undefined): Promise<boolean> {
  if (!contactId) return false;
  return (await gesperrteKontakte([contactId])).has(contactId);
}

/**
 * Wie {@link kontaktGesperrt} für viele Kontakte auf einmal (feste Zahl von Abfragen, z. B. Übersicht „Geplante
 * Nachrichten“, lib/vertrieb/geplante-nachrichten-server.ts). Liefert die gesperrten Kontakt-IDs.
 */
export async function gesperrteKontakte(contactIds: readonly string[]): Promise<Set<string>> {
  const ids = [...new Set(contactIds.filter(Boolean))];
  const out = new Set<string>();
  if (!ids.length) return out;
  const [contacts, faelle, abgemeldet] = await Promise.all([
    prisma.salesContact.findMany({ where: { id: { in: ids } }, select: { id: true, email: true, altEmails: true, nieKontaktierenAt: true } }),
    prisma.datenschutzFallEreignis.findMany({ where: { contactId: { in: ids } }, select: { contactId: true }, distinct: ["contactId"] }),
    prisma.salesCampaignLead.findMany({ where: { contactId: { in: ids }, unsubscribed: true }, select: { contactId: true }, distinct: ["contactId"] }),
  ]);
  for (const f of faelle) if (f.contactId) out.add(f.contactId);
  for (const l of abgemeldet) if (l.contactId) out.add(l.contactId);
  for (const c of contacts) if (c.nieKontaktierenAt || [c.email, ...c.altEmails].some(emailGesperrt)) out.add(c.id);
  const offen = contacts.filter((c) => !out.has(c.id));
  if (offen.length) {
    const geloescht = await geloeschteAdressen(offen.flatMap((c) => [c.email, ...c.altEmails]));
    if (geloescht.size) for (const c of offen) if ([c.email, ...c.altEmails].some((e) => !!e && geloescht.has(norm(e)))) out.add(c.id);
  }
  return out;
}
