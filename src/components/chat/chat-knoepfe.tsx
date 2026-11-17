"use client";

// Kleine Knöpfe der Chat-Seite (Kundenbereich): Termin buchen (gleiches Fenster wie im Kontakt, lib/lead-booking),
// zum Eingabefeld bzw. zum Nachfassen springen.

import { openLeadBooking } from "@/components/lead-booking";

export function TerminBuchenKnopf({ leadId, name, className, children }: { leadId: string; name: string; className?: string; children: React.ReactNode }) {
  return (
    <button type="button" className={className} onClick={() => openLeadBooking(leadId, name)} data-chat-termin-buchen>
      {children}
    </button>
  );
}

/** Springt zu einem Element (Eingabefeld, Nachfassen) und setzt den Fokus. */
export function SprungKnopf({ ziel, className, children }: { ziel: string; className?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        const el = document.getElementById(ziel);
        if (!el) return;
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        const fokus = el.matches("textarea, input, button") ? el : el.querySelector<HTMLElement>("textarea, input, button[type=submit]");
        (fokus as HTMLElement | null)?.focus({ preventScroll: true });
      }}
    >
      {children}
    </button>
  );
}
