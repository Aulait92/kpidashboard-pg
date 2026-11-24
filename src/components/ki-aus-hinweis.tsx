// Ruhiger Hinweis an den Stellen, die wegen des Widerspruchs gegen Amazon Web Services abgeschaltet sind (Ole,
// 24.11.2026; lib/datennutzung.ts kiAusSaetze): steht statt der KI-Knöpfe bzw. statt eines Fehlers, in zwei Sätzen:
// was aus ist und seit wann, dann der nächste Schritt. Der Inhaber ändert es unter Einstellungen → KI-Hilfe und
// Anzeigenlernen, Mitarbeiter wenden sich an ihn. In Blättern mit ungespeichertem Text ohne Link (link = false), damit
// ein Tipp nicht den Entwurf verwirft.

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { DATENNUTZUNG_PFAD, kiAusSaetze, type KiAus, type KiAusWas } from "@/lib/datennutzung";
import { cn } from "@/lib/utils";

export function KiAusHinweis({ was, hinweis, link = true, className }: { was: KiAusWas; hinweis: KiAus; link?: boolean; className?: string }) {
  const s = kiAusSaetze(was, hinweis);
  return (
    <p className={cn("flex items-start gap-1.5 text-[13px] leading-snug text-[color:var(--muted)]", className)} data-ki-aus>
      <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>
        {s.was}{" "}
        {link && hinweis.inhaber ? (
          <Link href={DATENNUTZUNG_PFAD} className="-my-2.5 inline-block py-2.5 font-medium text-[color:var(--brand)] hover:underline" data-ki-aus-link>
            {s.schritt}
          </Link>
        ) : (
          s.schritt
        )}
      </span>
    </p>
  );
}
