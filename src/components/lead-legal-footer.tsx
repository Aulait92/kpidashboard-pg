// Fußzeile der Endkunden-Seiten (Buchung, Termin verwalten, Empfehlung, Einwilligung, Abmelden,
// Erstinformation): Impressum und Datenschutz des Vermittlers aus seiner Website (Onboarding.websiteInfo),
// dazu unser Hinweis als technischer Dienstleister (Auftragsverarbeiter). Fehlen die Angaben des Vermittlers
// (oder ist kein Vermittler bekannt, z. B. Startseite der Buchungsadresse), gelten die allgemeinen Links des
// Betreibers. Ohne Markennamen im Text (Ole, 15.11.2026). SiteFooter zeigt auf diesen Seiten nichts.

import { after } from "next/server";
import { prisma } from "@/lib/prisma";

const OPERATOR_IMPRINT = "https://performancegrowth.de/impressum";
const operatorPrivacy = () => process.env.BOOKING_PRIVACY_URL ?? "https://performancegrowth.de/datenschutz";

const httpUrl = (v: unknown): string | null => (typeof v === "string" && /^https?:\/\//i.test(v.trim()) ? v.trim() : null);

export type LeadLegalLinks = { imprint: string; privacy: string; processor: string | null; imprintLabel?: string };

/** Beschriftung, wenn statt des Impressums die Erstinformation verlinkt ist (Rechtsvorprüfung 16.11.2026). */
export const ANBIETERANGABEN_LABEL = "Anbieterangaben (Erstinformation)";

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
  let links = leadLegalLinks(websiteInfo);
  // Ole, 16.11.2026 (Kundenlink zeigte unser Impressum): Ist der Vermittler bekannt, aber sein Impressum nicht
  // hinterlegt, führt „Impressum“ zu seiner Erstinformation (Name, Anschrift, Register); unser Datenschutz nur als
  // technischer Dienstleister.
  // Rechtsvorprüfung 16.11.2026: Dann heißt der Link nicht „Impressum“, sondern „Anbieterangaben (Erstinformation)“,
  // und wir legen einmalig eine Admin-Aufgabe „Impressum-URL fehlt“ an (lib/impressum-fehlt.ts, blockiert nicht).
  // Ole, 20.11.2026 („unter Datenschutz ist PG, unter Impressum Lohmann, nicht konsistent“): Ohne eigene
  // Datenschutz-URL des Vermittlers verlinkt „Datenschutz“ seine Datenschutzhinweise (er ist Verantwortlicher),
  // unsere Erklärung nur als „Technischer Dienstleister“.
  if (customerId && links.privacy === operatorPrivacy()) {
    const { datenschutzUrlFor } = await import("@/lib/erstinformation");
    const eigene = await datenschutzUrlFor(customerId).catch(() => null);
    if (eigene) links = { ...links, privacy: eigene, processor: operatorPrivacy() };
  }
  if (customerId && links.imprint === OPERATOR_IMPRINT) {
    const { erstinfoUrlFor } = await import("@/lib/erstinformation");
    const erstinfo = await erstinfoUrlFor(customerId).catch(() => null);
    if (erstinfo)
      links = {
        imprint: erstinfo,
        imprintLabel: ANBIETERANGABEN_LABEL,
        privacy: links.privacy,
        processor: links.privacy === operatorPrivacy() ? null : operatorPrivacy(),
      };
    // nach dem Senden der Seite, damit der Seitenaufruf nicht wartet
    after(async () => {
      const { impressumFehltAufgabe } = await import("@/lib/impressum-fehlt");
      await impressumFehltAufgabe(customerId);
    });
  }
  const cls = "hover:underline";
  return (
    <footer className="mt-8 px-4 py-4 text-center text-xs text-[color:var(--muted)] print:hidden" data-lead-footer>
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
        <a href={links.imprint} target="_blank" rel="noopener noreferrer" className={cls}>
          {links.imprintLabel ?? "Impressum"}
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
