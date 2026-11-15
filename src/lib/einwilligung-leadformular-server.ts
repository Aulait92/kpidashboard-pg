// Angaben für den Einwilligungstext im Leadformular aus der Kundenakte: Impressum der Website
// (Onboarding.websiteInfo), Vertriebskontakt und Login (lib/einwilligung-leadformular.ts).

import { prisma } from "@/lib/prisma";
import { consentMissing, leadFormConsentText, type ConsentAngaben } from "@/lib/einwilligung-leadformular";

type WebsiteInfo = { companyName?: string | null; address?: string | null; email?: string | null; privacyUrl?: string | null };

export async function consentAngabenFor(customerId: string): Promise<ConsentAngaben> {
  const c = await prisma.customer.findUnique({
    where: { id: customerId },
    select: {
      name: true,
      onboarding: { select: { websiteInfo: true } },
      salesContact: { select: { street: true, zip: true, city: true, email: true } },
      users: { where: { role: "BUYER" }, select: { email: true }, orderBy: { createdAt: "asc" }, take: 1 },
    },
  });
  const web = (c?.onboarding?.websiteInfo ?? {}) as WebsiteInfo;
  const sc = c?.salesContact;
  const scAddress = sc?.street && (sc.zip || sc.city) ? `${sc.street}, ${[sc.zip, sc.city].filter(Boolean).join(" ")}` : null;
  return {
    vermittler: web.companyName?.trim() || c?.name || null,
    anschrift: web.address?.trim() || scAddress,
    email: web.email?.trim() || sc?.email || c?.users[0]?.email || null,
    datenschutzUrl: web.privacyUrl?.trim() || null,
  };
}

/** Wortlaut für diesen Kunden und fehlende Angaben (Platzhalter im Text). */
export async function consentTextFor(customerId: string): Promise<{ text: string; missing: string[] }> {
  const x = await consentAngabenFor(customerId);
  return { text: leadFormConsentText(x), missing: consentMissing(x) };
}
