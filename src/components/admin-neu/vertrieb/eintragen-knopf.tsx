"use client";

import { useEffect, useState } from "react";
import { NotebookPen } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { Sheet } from "@/components/ui/sheet";
import { ActivityForm } from "@/components/vertrieb/activity-form";

// Kontaktakte (Umbau 19.11.2026): „Eintragen“ öffnet Anruf, E-Mail oder Notiz mit Ergebnis im Fenster (wie der
// Lead-Verlauf in /buyer), statt eines immer offenen Formulars. Sprungmarke #aktivitaet (Verkaufen → Termine,
// „Ergebnis eintragen“) öffnet das Fenster sofort.

export function EintragenKnopf({
  contactId,
  hasOpenTasks,
  offenesAngebot,
  variant = "secondary",
  label = "Eintragen",
}: {
  contactId: string;
  hasOpenTasks: boolean;
  offenesAngebot: { id: string; number: string } | null;
  variant?: "primary" | "secondary";
  label?: string;
}) {
  const [offen, setOffen] = useState(false);
  useEffect(() => {
    const pruefen = () => {
      if (window.location.hash === "#aktivitaet") setOffen(true);
    };
    pruefen();
    window.addEventListener("hashchange", pruefen);
    return () => window.removeEventListener("hashchange", pruefen);
  }, []);
  const schliessen = () => {
    setOffen(false);
    if (window.location.hash === "#aktivitaet") history.replaceState(null, "", window.location.pathname + window.location.search);
  };
  return (
    <>
      <button type="button" onClick={() => setOffen(true)} className={buttonClass(variant, "md")} data-eintragen-knopf>
        <NotebookPen className="h-4 w-4" /> {label}
      </button>
      <Sheet open={offen} onClose={schliessen} title="Anruf, E-Mail oder Notiz eintragen">
        <div className="px-5 pb-5 pt-1" data-funktion="actions-logactivity--aktivitaet-erfassen-anruf-e-mail-notiz-ergebnis">
          <ActivityForm contactId={contactId} hasOpenTasks={hasOpenTasks} offenesAngebot={offenesAngebot} onDone={schliessen} />
        </div>
      </Sheet>
    </>
  );
}
