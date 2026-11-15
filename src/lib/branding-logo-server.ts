// Logo des Kunden speichern, bestätigen, entfernen (lib/branding-logo.ts).

import { prisma } from "@/lib/prisma";
import { bildTyp, LOGO_MAX_BYTES, logoDataUri, logoVonWebseite, svgBereinigen } from "@/lib/branding-logo";

export type LogoStand = { dataUri: string | null; source: string | null; bestaetigt: boolean; website: string | null };

export async function loadLogoStand(customerId: string): Promise<LogoStand> {
  const [c, ob] = await Promise.all([
    prisma.customer.findUnique({ where: { id: customerId }, select: { brandLogo: true, brandLogoType: true, brandLogoSource: true, brandLogoConfirmedAt: true } }),
    prisma.onboarding.findUnique({ where: { customerId }, select: { websiteInfo: true } }).catch(() => null),
  ]);
  const web = (ob?.websiteInfo ?? {}) as { sourceUrl?: string | null; impressumUrl?: string | null };
  let website: string | null = web.sourceUrl ?? null;
  if (!website && web.impressumUrl) {
    try {
      website = new URL(web.impressumUrl).origin;
    } catch {
      website = null;
    }
  }
  return {
    dataUri: c?.brandLogo && c.brandLogoType ? logoDataUri(new Uint8Array(c.brandLogo), c.brandLogoType) : null,
    source: c?.brandLogoSource ?? null,
    bestaetigt: !!c?.brandLogoConfirmedAt,
    website,
  };
}

async function speichern(customerId: string, data: Uint8Array, type: string, source: string) {
  await prisma.customer.update({
    where: { id: customerId },
    data: { brandLogo: Buffer.from(data), brandLogoType: type, brandLogoSource: source.slice(0, 500), brandLogoConfirmedAt: null },
  });
}

/** Logo von der Webseite holen und unbestätigt speichern. */
export async function logoHolen(customerId: string, website: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const r = await logoVonWebseite(website);
  if ("error" in r) return { ok: false, error: r.error };
  await speichern(customerId, r.data, r.type, r.source);
  return { ok: true };
}

/** Hochgeladenes Logo prüfen und unbestätigt speichern. */
export async function logoHochladen(customerId: string, fileName: string, raw: Uint8Array): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!raw.length) return { ok: false, error: "Bitte eine Datei auswählen." };
  if (raw.length > LOGO_MAX_BYTES) return { ok: false, error: "Das Logo ist zu groß (höchstens 1 MB)." };
  const type = bildTyp("", raw);
  if (!type) return { ok: false, error: "Bitte ein Logo als PNG, JPG oder SVG hochladen." };
  const data = type === "image/svg+xml" ? new TextEncoder().encode(svgBereinigen(new TextDecoder().decode(raw))) : raw;
  await speichern(customerId, data, type, `Upload: ${fileName}`);
  return { ok: true };
}

export async function logoBestaetigen(customerId: string): Promise<boolean> {
  const n = await prisma.customer.updateMany({ where: { id: customerId, brandLogo: { not: null } }, data: { brandLogoConfirmedAt: new Date() } });
  return n.count > 0;
}

export async function logoEntfernen(customerId: string): Promise<void> {
  await prisma.customer.update({ where: { id: customerId }, data: { brandLogo: null, brandLogoType: null, brandLogoSource: null, brandLogoConfirmedAt: null } });
}
