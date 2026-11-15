import { CalendarDays } from "lucide-react";
import { LeadLegalFooter } from "@/components/lead-legal-footer";

// Startseite der Buchungsadresse (dein-beratungstermin.de/ → hier, src/middleware.ts): neutral,
// ohne Markennamen und ohne Anrede. Gebucht wird über den persönlichen Link des Beraters.
export const metadata = {
  title: "Terminbuchung",
  robots: { index: false, follow: false },
};

export default function BookingStartPage() {
  return (
    <>
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-10 sm:py-16">
        <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-6 text-center shadow-[var(--shadow-md)] sm:p-8" data-buchung-start>
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[color:var(--surface-sunken)] text-[color:var(--muted)]">
            <CalendarDays className="h-6 w-6" />
          </span>
          <h1 className="mt-4 text-xl font-bold tracking-tight">Terminbuchung</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-[color:var(--muted)]">
            Hier werden Beratungstermine gebucht. Für einen Termin bitte den persönlichen Link aus der Nachricht des Beraters öffnen.
          </p>
        </div>
      </main>
      <LeadLegalFooter />
    </>
  );
}
