"use client";

import type { ReactNode } from "react";

/**
 * Formular in einem <details>: schließt das aufgeklappte Feld beim Absenden
 * (z. B. „Bearbeiten“ im Verlauf). Löschen-Knöpfe mit eigener formAction
 * schließen es ebenfalls – der Eintrag verschwindet danach ohnehin.
 */
export function CloseDetailsForm({
  action,
  className,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>;
  className?: string;
  children: ReactNode;
}) {
  return (
    <form
      action={action}
      className={className}
      onSubmit={(e) => {
        const details = e.currentTarget.closest("details");
        // Nach dem Absenden zuklappen (Server-Action läuft weiter)
        if (details) setTimeout(() => details.removeAttribute("open"), 0);
      }}
    >
      {children}
    </form>
  );
}
