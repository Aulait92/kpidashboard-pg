"use client";

// Kleine Knöpfe der Chat-Seite (Kundenbereich): Termin buchen (gleiches Fenster wie im Kontakt, lib/lead-booking),
// zum Eingabefeld bzw. zum Nachfassen springen.

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { openLeadBooking } from "@/components/lead-booking";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

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

/**
 * Handy (Ole, 18.11.2026): Tipp auf den Namen öffnet die Details (Termin, Angaben, Kontakt) als Blatt von unten,
 * statt einer eigenen „Details“-Leiste über dem Chat. Der Inhalt kommt fertig vom Server.
 */
export function ChatDetailsKnopf({ name, titel, children }: { name: string; titel: string; children: React.ReactNode }) {
  const [offen, setOffen] = useState(false);
  const zu = useCallback(() => setOffen(false), []);
  return (
    <>
      <button
        type="button"
        onClick={() => setOffen(true)}
        aria-haspopup="dialog"
        className="flex min-w-0 max-w-full items-center gap-0.5 text-left text-[17px] font-semibold"
        data-chat-details-knopf
      >
        <span className="truncate">{name}</span>
        <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--muted)]" />
      </button>
      <Sheet
        open={offen}
        onClose={zu}
        title={titel}
        footer={
          <button type="button" onClick={zu} className="h-12 w-full shrink-0 border-t border-[color:var(--border)] text-sm font-medium text-[color:var(--muted)] hover:bg-[color:var(--surface-sunken)]">
            Schließen
          </button>
        }
      >
        <div className="space-y-3 bg-[color:var(--surface-sunken)] p-3" data-lead-infos>
          {children}
        </div>
      </Sheet>
    </>
  );
}

const HINWEIS_ZAEHLER = "chat-hinweis-pausiert";
const HINWEIS_GESCHRIEBEN = "chat-selbst-geschrieben";
const HINWEIS_MAX = 3;

function lies(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function schreib(key: string, wert: string) {
  try {
    window.localStorage.setItem(key, wert);
  } catch {
    /* privater Modus o. ä.: Hinweis bleibt dann einfach sichtbar */
  }
}

/** Merkt sich (nur dieses Gerät), dass der Vermittler selbst geschrieben hat. Am Formular über onSubmit. */
export function merkeSelbstGeschrieben() {
  schreib(HINWEIS_GESCHRIEBEN, "1");
}

/**
 * „Wenn Sie schreiben, pausiert der Assistent“ (Ole, 18.11.2026): am Handy nur die ersten 3 Male und nur, solange der
 * Vermittler noch nie selbst geschrieben hat. Ab md (Desktop, Tablet) unverändert immer sichtbar.
 */
export function SchreibHinweis({ chatId, schonGeschrieben, children }: { chatId: string; schonGeschrieben: boolean; children: React.ReactNode }) {
  // Startet am Handy unsichtbar (kein Aufblitzen für alle, die den Hinweis nicht mehr brauchen)
  const [handy, setHandy] = useState(false);
  const gezaehlt = useRef<string | null>(null);
  useEffect(() => {
    if (schonGeschrieben) schreib(HINWEIS_GESCHRIEBEN, "1");
    const geschrieben = schonGeschrieben || lies(HINWEIS_GESCHRIEBEN) === "1";
    const n = Number(lies(HINWEIS_ZAEHLER) ?? "0") || 0;
    // Jeder geöffnete Chat zählt einmal (nicht jede Aktualisierung der Seite)
    if (!geschrieben && n < HINWEIS_MAX && gezaehlt.current !== chatId) {
      gezaehlt.current = chatId;
      schreib(HINWEIS_ZAEHLER, String(n + 1));
    }
    setHandy(!geschrieben && gezaehlt.current === chatId);
  }, [chatId, schonGeschrieben]);
  return (
    <p className={cn("mt-1.5 px-1 text-xs text-[color:var(--muted)]", handy ? "" : "hidden md:block")} data-chat-schreibhinweis={handy ? "an" : "aus"}>
      {children}
    </p>
  );
}

/** Antwortformular: merkt sich beim Absenden, dass selbst geschrieben wurde (für den Hinweis oben). */
export function MerkFormular({ className, action, children }: { className?: string; action: (fd: FormData) => void | Promise<void>; children: React.ReactNode }) {
  return (
    <form action={action} className={className} onSubmit={merkeSelbstGeschrieben}>
      {children}
    </form>
  );
}
