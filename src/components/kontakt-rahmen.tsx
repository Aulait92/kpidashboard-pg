import type { ReactNode } from "react";

/**
 * Rahmen um die Kontaktansicht rechts auf „Heute“ (Usability-Check 25.11.2026, Datenschutz): Die Auswahl wechselt
 * dort nur über den Suchparameter, React behält deshalb den Zustand aller Fenster darin (E-Mail-Empfänger, Betreff,
 * Entwurf, WhatsApp-Eingabe, Termin-Fenster). Der Schlüssel je Kontakt baut alles neu auf, sobald ein anderer Kontakt
 * geöffnet wird; so kann keine Adresse des vorherigen Kontakts stehen bleiben.
 */
export function KontaktRahmen({ leadId, className, children }: { leadId: string; className?: string; children: ReactNode }) {
  return (
    <div key={leadId} className={className} data-kontakt-rahmen={leadId}>
      {children}
    </div>
  );
}
