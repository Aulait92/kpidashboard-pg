"use client";

// Vorsorge-Themen in der Terminvorbereitung (Cross-Selling Teil C2): höchstens ein Thema je Termin, nur als Hinweis.
// Wer ein Thema nicht anbietet (z. B. Vertreter ohne PKV), schaltet es hier ab. Standard: alle an.

import { useState, useTransition } from "react";
import { useToast } from "@/components/ui/toast";
import { VORSORGE_THEMEN, type VorsorgeKey } from "@/lib/schutz-ueberblick";
import { vorsorgeThemenAction } from "./actions";

export function VorsorgeForm({ aus: start, canEdit }: { aus: string[]; canEdit: boolean }) {
  const toast = useToast();
  const [aus, setAus] = useState(start);
  const [pending, run] = useTransition();
  const schalten = (key: VorsorgeKey, an: boolean) => {
    const vorher = aus;
    const neu = an ? aus.filter((x) => x !== key) : [...aus, key];
    setAus(neu);
    run(async () => {
      const r = await vorsorgeThemenAction(neu);
      if (!r.ok) {
        setAus(vorher);
        toast.show({ message: r.error, tone: "error" });
      }
    });
  };
  return (
    <div className="divide-y divide-[color:var(--border)]" data-vorsorge-themen>
      {(Object.keys(VORSORGE_THEMEN) as VorsorgeKey[]).map((key) => (
        <label key={key} className="flex min-h-12 cursor-pointer items-center gap-3 px-5 py-3 text-[15px]">
          <input type="checkbox" className="h-4 w-4" checked={!aus.includes(key)} disabled={!canEdit || pending} onChange={(e) => schalten(key, e.target.checked)} />
          {VORSORGE_THEMEN[key]}
        </label>
      ))}
    </div>
  );
}
