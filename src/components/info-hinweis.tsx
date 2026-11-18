"use client";

// Kurze Erklärung zu einem Fachbegriff (Usability-Check 18.11.2026): ein Satz hinter einem kleinen „i“. Hervorgegangen
// aus dem Hinweis-Symbol der WhatsApp-Einstellungen im Admin (nur `title`); jetzt auch am Handy: Antippen öffnet den Satz
// unter dem Symbol, erneutes Antippen, Escape oder ein Tipp daneben schließt ihn. Am Rechner zeigt `title` ihn auch beim
// Darüberfahren.

import { useEffect, useId, useRef, useState } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

export function InfoHinweis({ text, begriff, className }: { text: string; /** Begriff für Vorleseprogramme („Erklärung: CLV“) */ begriff?: string; className?: string }) {
  const [offen, setOffen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const id = useId();
  useEffect(() => {
    if (!offen) return;
    const zu = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOffen(false);
    };
    document.addEventListener("pointerdown", zu);
    document.addEventListener("keydown", zu);
    return () => {
      document.removeEventListener("pointerdown", zu);
      document.removeEventListener("keydown", zu);
    };
  }, [offen]);
  return (
    <span ref={ref} className={cn("relative inline-flex align-middle", className)} data-info-hinweis>
      <button
        type="button"
        title={text}
        aria-label={begriff ? `Erklärung: ${begriff}` : "Erklärung"}
        aria-expanded={offen}
        aria-controls={id}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOffen((o) => !o);
        }}
        className="-m-1.5 inline-flex h-7 w-7 items-center justify-center rounded-full text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
      >
        <Info className="h-3.5 w-3.5" aria-hidden />
      </button>
      {offen ? (
        <span
          id={id}
          role="note"
          className="absolute left-1/2 top-full z-40 mt-1.5 w-64 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-[var(--radius-md)] bg-[color:var(--foreground)] px-3 py-2 text-left text-[13px] font-normal normal-case leading-snug tracking-normal text-white shadow-lg"
        >
          {text}
        </span>
      ) : null}
    </span>
  );
}
