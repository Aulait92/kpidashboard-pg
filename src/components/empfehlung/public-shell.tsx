// Rahmen der öffentlichen Empfehlungsseiten (/empfehlung/[token] und /kontakt): Kopfzeile im Namen des Vermittlers,
// eine Karte, darunter der rechtliche Fuß (Impressum bzw. Erstinformation und Datenschutz, § 5 DDG, § 15 VersVermV).

import { LeadLegalFooter } from "@/components/lead-legal-footer";
import { AdvisorHeader } from "@/components/empfehlung/advisor-header";
import { Phone } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { a, type Ansprache } from "@/lib/ansprache";
import { telHref } from "@/lib/empfehlung/shared";

export function ReferralShell({ children, advisor, label, customerId }: { children: React.ReactNode; advisor?: string; label?: string; customerId?: string | null }) {
  return (
    <>
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-4 sm:py-10">
        {advisor ? <AdvisorHeader name={advisor} label={label} /> : null}
        <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-5 shadow-[var(--shadow-md)] sm:p-7">{children}</div>
      </main>
      <LeadLegalFooter customerId={customerId} />
    </>
  );
}

/**
 * Ungültiger oder abgelaufener Link: klare nächste Handlung statt nur Text. Gibt es den Link noch (Modul aus, Kontakt
 * gelöscht), bietet die Seite den Anruf beim Vermittler an und zeigt dessen Erstinformation im Fuß (wie die anderen Seiten).
 */
export function ReferralInvalidLink({ kontakt }: { kontakt?: { customerId: string; vertreter: string; advisorPhone: string | null; an: Ansprache } | null }) {
  const an = kontakt?.an ?? "sie";
  return (
    <ReferralShell advisor={kontakt?.vertreter} customerId={kontakt?.customerId}>
      <h1 className="text-xl font-bold" data-referral-invalid>
        Dieser Link ist nicht mehr aktiv
      </h1>
      {kontakt?.advisorPhone ? (
        <>
          <p className="mt-2 text-sm leading-relaxed text-[color:var(--muted)]">
            {a(an, `Du erreichst ${kontakt.vertreter} trotzdem direkt.`, `Sie erreichen ${kontakt.vertreter} trotzdem direkt.`)}
          </p>
          <a href={telHref(kontakt.advisorPhone)} className={buttonClass("primary", "md", "mt-4 w-full")} data-referral-invalid-call>
            <Phone className="h-4 w-4" /> {kontakt.advisorPhone} anrufen
          </a>
        </>
      ) : (
        <p className="mt-2 text-sm leading-relaxed text-[color:var(--muted)]">
          {a(an, "Bitte frag die Person, die dir den Link geschickt hat, nach einem neuen Link.", "Bitte fragen Sie die Person, die Ihnen den Link geschickt hat, nach einem neuen Link.")}
        </p>
      )}
    </ReferralShell>
  );
}
