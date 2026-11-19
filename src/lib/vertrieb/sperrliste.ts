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
 * Adressen von Kontakten, die auf Verlangen gelöscht wurden (Art. 17, lib/vertrieb/art17.ts). Dort steht nur noch der
 * SHA-256-Hash (SalesContact.sperrHashes). Liefert die Adressen aus der Eingabe, die gesperrt sind (klein geschrieben).
 */
export async function geloeschteAdressen(emails: (string | null | undefined)[]): Promise<Set<string>> {
  const nachHash = new Map<string, string>();
  for (const e of emails) if (e && e.includes("@")) nachHash.set(emailHash(e), norm(e));
  const out = new Set<string>();
  if (!nachHash.size) return out;
  const hashes = [...nachHash.keys()];
  for (let i = 0; i < hashes.length; i += 1000) {
    const teil = hashes.slice(i, i + 1000);
    const rows = await prisma.salesContact.findMany({ where: { sperrHashes: { hasSome: teil } }, select: { sperrHashes: true } });
    for (const r of rows) for (const h of r.sperrHashes) if (nachHash.has(h)) out.add(nachHash.get(h)!);
  }
  return out;
}

/** Hülle des auf Verlangen gelöschten Kontakts zu dieser Adresse (über den Hash) oder null. */
export async function geloeschterKontaktId(email: string | null | undefined): Promise<string | null> {
  if (!email?.includes("@")) return null;
  const c = await prisma.salesContact.findFirst({ where: { sperrHashes: { has: emailHash(email) } }, select: { id: true } });
  return c?.id ?? null;
}

/** Vertriebskontakt gesperrt? „Nie kontaktieren“, Hauptadresse, weitere Adressen oder Cold-Mail-Abmeldung. */
export async function kontaktGesperrt(contactId: string | null | undefined): Promise<boolean> {
  if (!contactId) return false;
  const c = await prisma.salesContact.findUnique({ where: { id: contactId }, select: { email: true, altEmails: true, nieKontaktierenAt: true } });
  if (c?.nieKontaktierenAt) return true;
  if (c && [c.email, ...c.altEmails].some(emailGesperrt)) return true;
  return !!(await prisma.salesCampaignLead.findFirst({ where: { contactId, unsubscribed: true }, select: { id: true } }));
}
