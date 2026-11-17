"use client";

// Umschalter „Rechnet sich das?“ auf Wachstum (Ole, 14.11.2026; seit 18.11.2026 im Hero): „Inkl. Bestand (5 Jahre)“
// (Standard, plus künftige Bestandsprovision der Verträge dieses Zeitraums) oder „Nur Abschlussprovision“. Die Wahl
// wird je Login gespeichert (in der Admin-Vorschau nur im Browser, per Cookie).

import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setGewinnModusAction } from "@/app/buyer/zahlen/actions";

export function GewinnModusSwitch({ mitBestand, makler = false }: { mitBestand: boolean; makler?: boolean }) {
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
  const opt = (v: boolean, kurz: string, rest: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={value === v}
      onClick={() => choose(v)}
      className={`min-h-10 whitespace-nowrap rounded-[6px] px-3 py-1.5 text-sm font-semibold transition sm:min-h-9 ${value === v ? "bg-white text-[color:var(--foreground)] shadow-sm" : "text-[color:var(--muted)] hover:text-[color:var(--foreground)]"}`}
    >
      {kurz}
      <span className="hidden sm:inline">{rest}</span>
    </button>
  );
  return (
    <div
      className={`grid w-full grid-cols-2 gap-1 sm:inline-grid sm:w-auto sm:grid-flow-col sm:grid-cols-none rounded-[var(--radius-sm)] bg-[color:var(--surface-sunken,#f1f5f9)] p-1 ring-1 ring-inset ring-[color:var(--border)] ${pending ? "opacity-70" : ""}`}
      role="radiogroup"
      aria-label="Rechnen mit"
      data-gewinn-modus={value ? "bestand" : "jetzt"}
    >
      {opt(true, "Inkl. Bestand", " (5 Jahre)")}
      {opt(false, makler ? "Nur 1. Jahr" : "Nur Abschluss", makler ? "" : "provision")}
    </div>
  );
}
