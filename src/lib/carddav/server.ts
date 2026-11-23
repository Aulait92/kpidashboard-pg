// Karten für das Adressbuch „Vertrieb performancegrowth“ (CardDAV, lib/carddav/dav.ts) aus der Datenbank.
// Nur Vertriebskontakte (SalesContact mit Nummern aus phone und SalesContactPhone), keine Leads von Kunden.
// Ohne Telefonnummer keine Karte (das Adressbuch dient der Anruferkennung). Auf Verlangen gelöschte Kontakte
// (Art. 17) fehlen. Einmal gebaut, 60 Sekunden zwischengespeichert (tausende Kontakte: eine Abfrage je Minute).

import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { CUSTOMER_LABEL, STAGE_LABEL } from "@/lib/vertrieb/crm";
import type { Adressbuch, Karte } from "./dav";
import { buildVCard, kartenUid, vcardEtag } from "./vcard";

const CACHE_MS = 60_000;
let cache: { at: number; buch: Adressbuch } | null = null;

/** Nur für Tests. */
export function resetCarddavCache() {
  cache = null;
}

/** Basis der App für den Link zur Kontaktakte (APP_URL), sonst kein Link. */
function appBasis(): string | null {
  const raw = process.env.APP_URL?.trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.protocol === "http:" ? u.origin : null;
  } catch {
    return null;
  }
}

export type Zeile = {
  id: string;
  name: string;
  salutation: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  stage: keyof typeof STAGE_LABEL;
  customerStage: keyof typeof CUSTOMER_LABEL | null;
  nieKontaktierenAt: Date | null;
  updatedAt: Date;
  phones: { phone: string; createdAt: Date }[];
};

/** Kurzer Stand für die Notiz: Kundenstatus vor Vertriebsstufe, „nicht kontaktieren“ dahinter. */
export function kartenStatus(z: Pick<Zeile, "stage" | "customerStage" | "nieKontaktierenAt">): string {
  const s = z.customerStage ? `Kunde: ${CUSTOMER_LABEL[z.customerStage] ?? z.customerStage}` : (STAGE_LABEL[z.stage] ?? z.stage);
  return z.nieKontaktierenAt ? `${s} · nicht kontaktieren` : s;
}

/** Karten bauen (ohne Datenbank, testbar). ctag: neuester Stand + Anzahl + Prüfsumme aller ETags. */
export function baueAdressbuch(zeilen: Zeile[], basis: string | null): Adressbuch {
  const karten: Karte[] = [];
  let neuester = 0;
  const summe = createHash("sha256");
  for (const z of zeilen) {
    // Weitere Nummern bekommen kein updatedAt am Kontakt: ihr Anlegedatum zählt für REV mit
    const stand = Math.max(z.updatedAt.getTime(), ...z.phones.map((p) => p.createdAt.getTime()));
    const vcard = buildVCard(
      {
        id: z.id,
        name: z.name,
        salutation: z.salutation,
        firstName: z.firstName,
        lastName: z.lastName,
        phones: [z.phone, ...z.phones.map((p) => p.phone)],
        status: kartenStatus(z),
        updatedAt: new Date(stand),
      },
      { kontaktUrl: basis ? `${basis}/admin/neu/vertrieb/kontakte/${z.id}` : null },
    );
    if (!vcard) continue;
    const etag = vcardEtag(vcard);
    karten.push({ uid: kartenUid(z.id), vcard, etag });
    neuester = Math.max(neuester, stand);
    summe.update(etag);
  }
  const ctag = `${neuester}-${karten.length}-${summe.digest("base64url").slice(0, 12)}`;
  return { karten, ctag };
}

/** Alle Karten (60 s zwischengespeichert). */
export async function ladeAdressbuch(now = Date.now()): Promise<Adressbuch> {
  if (cache && now - cache.at < CACHE_MS) return cache.buch;
  const zeilen = await prisma.salesContact.findMany({
    where: {
      art17GeloeschtAt: null,
      OR: [{ phone: { not: null } }, { phones: { some: {} } }],
    },
    select: {
      id: true,
      name: true,
      salutation: true,
      firstName: true,
      lastName: true,
      phone: true,
      stage: true,
      customerStage: true,
      nieKontaktierenAt: true,
      updatedAt: true,
      phones: { select: { phone: true, createdAt: true }, orderBy: { createdAt: "asc" } },
    },
    orderBy: { id: "asc" },
  });
  const buch = baueAdressbuch(zeilen, appBasis());
  cache = { at: now, buch };
  return buch;
}
