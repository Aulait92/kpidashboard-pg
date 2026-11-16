"use client";

// Karte „So holen Sie mehr raus“ (lib/zahlen-tipps): ermutigend, höchstens 3 Tipps mit Knopf zur Stelle,
// je Tipp „Ausblenden“ für 30 Tage.

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, Lightbulb, X } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { dismissTipAction } from "@/app/buyer/zahlen/actions";

export type TipView = { key: string; title: string; text: string; href: string; cta: string };

export function ZahlenTippsCard({ tips, intro, canDismiss = true }: { tips: TipView[]; intro: string | null; canDismiss?: boolean }) {
  const toast = useToast();
  const [hidden, setHidden] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const visible = tips.filter((t) => !hidden.includes(t.key));
  if (!visible.length) return null;
  const dismiss = (key: string) =>
    start(async () => {
      setHidden((h) => [...h, key]);
      const res = await dismissTipAction(key);
      if (!res.ok) {
        setHidden((h) => h.filter((k) => k !== key));
        toast.show({ message: res.error, tone: "error" });
      }
    });
  return (
    <section className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--brand-soft)] p-5" data-zahlen-tipps>
      <h3 className="flex items-center gap-2 text-[15px] font-semibold text-[color:var(--brand-dark)]">
        <Lightbulb className="h-4 w-4" /> So holen Sie mehr raus
      </h3>
      {intro ? <p className="mt-1 text-sm text-[color:var(--foreground)]">{intro}</p> : null}
      {/* Spalten nach Anzahl: ein einzelner Tipp nicht als schmale Karte in einem breiten Kasten (16.11.2026) */}
      <ul className={`mt-3 grid gap-3 ${visible.length >= 3 ? "md:grid-cols-3" : visible.length === 2 ? "md:grid-cols-2" : ""}`}>
        {visible.map((t) => (
          <li key={t.key} className="relative flex flex-col rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white p-4" data-tipp={t.key}>
            {canDismiss ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => dismiss(t.key)}
                className="absolute right-1 top-1 flex h-10 w-10 items-center justify-center rounded-full text-[color:var(--muted)] hover:bg-[color:var(--surface-sunken)]"
                aria-label="Tipp für 30 Tage ausblenden"
                title="Für 30 Tage ausblenden"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
            <div className="pr-8 text-sm font-semibold">{t.title}</div>
            <p className="mt-1 flex-1 text-sm text-[color:var(--muted)]">{t.text}</p>
            <Link href={t.href} className={buttonClass("secondary", "sm", "mt-3 self-start")}>
              {t.cta} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
