"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui";
import { Sheet } from "@/components/ui/sheet";

// Hauptaktion der Karte „Vertrag“ (Kundenakte › Abrechnung): öffnet die Formulare für Betreuungsgebühr, Zahlweise und
// Überweisung/Mahnungen im Fenster (am Handy von unten). Die Formulare kommen fertig vom Server (children).
// `offen`: nach dem Speichern (Rückmeldung in der Adresse) gleich wieder offen, damit die Meldung sichtbar ist.
export function VertragAendern({ offen = false, children }: { offen?: boolean; children: React.ReactNode }) {
  const [auf, setAuf] = useState(offen);
  return (
    <>
      <Button variant="primary" size="md" icon={Pencil} onClick={() => setAuf(true)}>
        Ändern
      </Button>
      <Sheet
        open={auf}
        onClose={() => setAuf(false)}
        title="Vertrag ändern"
        footer={
          <button type="button" onClick={() => setAuf(false)} className="h-12 w-full shrink-0 border-t border-[color:var(--border)] text-sm font-medium hover:bg-[color:var(--surface-sunken)]">
            Fertig
          </button>
        }
      >
        <div className="space-y-3 bg-[color:var(--surface-sunken)] p-3">{children}</div>
      </Sheet>
    </>
  );
}
