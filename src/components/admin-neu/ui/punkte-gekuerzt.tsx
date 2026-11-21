"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { HeuteList } from "@/components/admin/heute-list";
import type { HeuteItem } from "@/lib/admin-heute";

// Karte einer Rolle auf Mein Tag (Admin v2): die dringendsten Punkte mit Schnellknöpfen, der Rest hinter „Alle anzeigen“,
// damit am Handy alle Rollen ohne langes Scrollen zu sehen sind.
export function PunkteGekuerzt({ punkte, max = 3 }: { punkte: HeuteItem[]; max?: number }) {
  const [alle, setAlle] = useState(false);
  const rest = punkte.length - max;
  return (
    <div>
      <HeuteList items={alle || rest <= 0 ? punkte : punkte.slice(0, max)} ohneBereich />
      {rest > 0 && !alle ? (
        <button
          type="button"
          onClick={() => setAlle(true)}
          // Schlichter Textlink statt eigener Karte (Umbau 20.11.2026: weniger Kästen auf Mein Tag)
          className="mt-1 inline-flex min-h-10 items-center gap-1 px-1 text-sm font-medium text-[color:var(--brand)] hover:underline"
        >
          {rest === 1 ? "1 weiterer Punkt" : `${rest} weitere Punkte`}
          <ChevronDown className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
