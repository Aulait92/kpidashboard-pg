// Fußzeile der Endkunden-Seiten (Buchung, Termin verwalten, Empfehlung, Einwilligung, Abmelden,
// Erstinformation): Impressum und Datenschutz des Vermittlers aus seiner Website (Onboarding.websiteInfo),
// dazu unser Hinweis als technischer Dienstleister (Auftragsverarbeiter). Fehlen die Angaben des Vermittlers
// (oder ist kein Vermittler bekannt, z. B. Startseite der Buchungsadresse), gelten die allgemeinen Links des
// Betreibers. Ohne Markennamen im Text (Ole, 15.11.2026). SiteFooter zeigt auf diesen Seiten nichts.

import { prisma } from "@/lib/prisma";

const OPERATOR_IMPRINT = "https://performancegrowth.de/impressum";
const operatorPrivacy = () => process.env.BOOKING_PRIVACY_URL ?? "https://performancegrowth.de/datenschutz";

const httpUrl = (v: unknown): string | null => (typeof v === "string" && /^https?:\/\//i.test(v.trim()) ? v.trim() : null);

export type LeadLegalLinks = { imprint: string; privacy: string; processor: string | null };

/** Links aus den Website-Angaben des Vermittlers; reine Funktion (getestet). */
export function leadLegalLinks(websiteInfo: unknown): LeadLegalLinks {
  const web = (websiteInfo ?? {}) as { impressumUrl?: unknown; privacyUrl?: unknown };
  const imprint = httpUrl(web.impressumUrl);
  const privacy = httpUrl(web.privacyUrl);
  return {
    imprint: imprint ?? OPERATOR_IMPRINT,
    privacy: privacy ?? operatorPrivacy(),
    // Eigener Hinweis als Dienstleister nur, wenn oben die Angaben des Vermittlers stehen
    processor: imprint || privacy ? operatorPrivacy() : null,
  };
}

export async function LeadLegalFooter({ customerId }: { customerId?: string | null }) {
  const websiteInfo = customerId
    ? (await prisma.onboarding.findUnique({ where: { customerId }, select: { websiteInfo: true } }).catch(() => null))?.websiteInfo
    : null;
  const links = leadLegalLinks(websiteInfo);
  const cls = "hover:underline";
  return (
    <footer className="mt-8 px-4 py-4 text-center text-xs text-[color:var(--muted)] print:hidden" data-lead-footer>
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
        <a href={links.imprint} target="_blank" rel="noopener noreferrer" className={cls}>
          Impressum
        </a>
        <a href={links.privacy} target="_blank" rel="noopener noreferrer" className={cls}>
          Datenschutz
        </a>
        {links.processor ? (
          <a href={links.processor} target="_blank" rel="noopener noreferrer" className={cls}>
            Technischer Dienstleister
          </a>
        ) : null}
      </div>
    </footer>
  );
}
