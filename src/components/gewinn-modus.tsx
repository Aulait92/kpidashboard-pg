"use client";

// Umschalter der Karte „Gewinn“ auf /buyer/zahlen (Ole, 14.11.2026): „Inkl. Bestand“ (Standard, plus künftige
// Bestandsprovision der Verträge dieses Zeitraums, 5 Jahre) oder „Nur jetzt“. Die Wahl
// wird je Login gespeichert (in der Admin-Vorschau nur im Browser, per Cookie).

import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setGewinnModusAction } from "@/app/buyer/zahlen/actions";

export function GewinnModusSwitch({ mitBestand }: { mitBestand: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [value, setValue] = useOptimistic(mitBestand);
  const choose = (next: boolean) => {
    if (next === value) return;
    start(async () => {
      setValue(next);
      await setGewinnModusAction(next);
      router.refresh();
    });
  };
  const opt = (v: boolean, label: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={value === v}
      onClick={() => choose(v)}
      className={`min-h-8 rounded-[6px] px-2.5 py-1 text-xs font-medium transition ${value === v ? "bg-white text-[color:var(--foreground)] shadow-sm" : "text-[color:var(--muted)]"}`}
    >
      {label}
    </button>
  );
  return (
    <div
      className={`mt-2 inline-grid grid-flow-col gap-1 rounded-[var(--radius-sm)] bg-[color:var(--surface-sunken,#f1f5f9)] p-1 ${pending ? "opacity-70" : ""}`}
      role="radiogroup"
      aria-label="Gewinn rechnen"
      data-gewinn-modus={value ? "bestand" : "jetzt"}
    >
      {opt(true, "Inkl. Bestand")}
      {opt(false, "Nur jetzt")}
    </div>
  );
}
