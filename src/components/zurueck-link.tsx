"use client";

// „Zurück“-Link für Unterseiten, die man aus einem Kontakt heraus öffnet (Ole, 15.11.2026: „Zum Kontakt“ in der
// Terminvorbereitung öffnete nur das Kontakt-Fenster über der Vorbereitung).
// - back: Man kam aus der App hierher (z. B. ?von=kontakt) → Browser-Zurück, damit Liste, offener Kontakt und
//   Scrollposition wie vorher sind und die Unterseite weg ist.
// - sonst echte Navigation auf href (hart, also ohne das abfangende Kontakt-Fenster: volle Kontaktseite).
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

export function ZurueckLink({ href, back, children }: { href: string; back: boolean; children: ReactNode }) {
  const router = useRouter();
  return (
    <a
      href={href}
      data-zurueck
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        if (back && window.history.length > 1) router.back();
        else window.location.assign(href);
      }}
      className="mb-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-[color:var(--brand)] hover:underline"
    >
      <ArrowLeft className="h-4 w-4" /> {children}
    </a>
  );
}
