// Rahmen der öffentlichen Empfehlungsseiten (/empfehlung/[token] und /kontakt): Kopfzeile im Namen des Vermittlers,
// eine Karte, darunter der rechtliche Fuß (Impressum bzw. Erstinformation und Datenschutz, § 5 DDG, § 15 VersVermV).

import { LeadLegalFooter } from "@/components/lead-legal-footer";
import { AdvisorHeader } from "@/components/empfehlung/advisor-header";

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

/** Ungültiger oder abgelaufener Link: klare nächste Handlung statt nur Text. */
export function ReferralInvalidLink() {
  return (
    <ReferralShell>
      <h1 className="text-xl font-bold" data-referral-invalid>
        Dieser Link ist nicht mehr aktiv
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-[color:var(--muted)]">Bitte fragen Sie die Person, die Ihnen den Link geschickt hat, nach einem neuen Link.</p>
    </ReferralShell>
  );
}
