"use client";

// Startseite „Heute“, Desktop (Ole, 17.11.2026: „rechten Teil ausblenden können“): Kontakt rechts mit X bzw. Esc
// schließen, die Liste nutzt dann die volle Breite. Die App merkt sich die Wahl (Cookie pg-heute-rechts):
// X → „zu“, einen Kontakt öffnen → „auf“ (dann zeigt „Heute“ ohne Auswahl wieder gleich die erste Aufgabe).

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

export const HEUTE_RECHTS_COOKIE = "pg-heute-rechts";
const setze = (v: "auf" | "zu") => {
  document.cookie = `${HEUTE_RECHTS_COOKIE}=${v}; path=/buyer; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
};

export function HeuteRechtsSchliessen({ ausgewaehlt }: { ausgewaehlt: boolean }) {
  const router = useRouter();
  const schliessen = () => {
    setze("zu");
    router.push("/buyer", { scroll: false });
    router.refresh();
  };
  useEffect(() => {
    if (ausgewaehlt) setze("auf");
    const onKey = (e: KeyboardEvent) => {
      // Esc schließt nur, wenn kein Fenster offen ist und nicht in einem Eingabefeld getippt wird
      if (e.key !== "Escape" || document.querySelector("[role=dialog]")) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (window.matchMedia("(min-width: 1280px)").matches) schliessen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ausgewaehlt]);
  return (
    <button
      type="button"
      onClick={schliessen}
      aria-label="Kontakt schließen"
      title="Schließen (Esc)"
      className="absolute right-3 top-3 z-10 hidden h-9 w-9 items-center justify-center rounded-full text-[color:var(--muted)] hover:bg-[color:var(--surface-sunken)] hover:text-[color:var(--foreground)] xl:flex"
      data-heute-rechts-zu
    >
      <X className="h-5 w-5" />
    </button>
  );
}
