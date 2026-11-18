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
          className="mt-2 inline-flex min-h-10 w-full items-center justify-center gap-1 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white text-sm font-medium text-[color:var(--brand)] hover:bg-[color:var(--surface-sunken)]"
        >
          Alle {punkte.length} anzeigen
          <ChevronDown className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
