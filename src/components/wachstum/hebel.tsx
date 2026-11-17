"use client";

// „Ihre 3 Hebel diese Woche“ auf Wachstum (Ole, 18.11.2026): die bisherigen Hinweise (nächster Schritt, Cross-Selling,
// Leads ohne WhatsApp, Tipps aus lib/zahlen-tipps) als bis zu 3 nummerierte Aufgaben, nach Wirkung sortiert, je mit Knopf.
// Ausblenden für 30 Tage wie bisher (nicht in der Vorschau, nur Inhaber).

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, X } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { dismissTipAction } from "@/app/buyer/zahlen/actions";

export type HebelView = { key: string; title: string; text: string; href: string; cta: string };

export function HebelKarte({ hebel, canDismiss }: { hebel: HebelView[]; canDismiss: boolean }) {
  const toast = useToast();
  const [hidden, setHidden] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const sichtbar = hebel.filter((h) => !hidden.includes(h.key));
  if (!sichtbar.length) return null;
  const weg = (key: string) =>
    start(async () => {
      setHidden((h) => [...h, key]);
      const res = await dismissTipAction(key);
      if (!res.ok) {
        setHidden((h) => h.filter((k) => k !== key));
        toast.show({ message: res.error, tone: "error" });
      }
    });
  return (
    <section className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-5 shadow-[var(--shadow-md)] sm:p-7" aria-labelledby="hebel" data-hebel>
      <h2 id="hebel" className="text-lg font-semibold tracking-tight sm:text-xl">
        {sichtbar.length === 1 ? "Ihr Hebel diese Woche" : `Ihre ${sichtbar.length} Hebel diese Woche`}
      </h2>
      <ol className={`mt-4 grid gap-3 ${sichtbar.length >= 3 ? "lg:grid-cols-3" : sichtbar.length === 2 ? "lg:grid-cols-2" : ""}`}>
        {sichtbar.map((h, i) => (
          <li key={h.key} className="relative flex gap-3.5 rounded-[var(--radius-md)] border border-[color:var(--border)] p-4" data-tipp={h.key}>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[color:var(--brand)] text-[15px] font-bold text-white" aria-hidden>
              {i + 1}
            </span>
            <div className="min-w-0 flex-1 pr-6">
              <div className="text-base font-semibold leading-snug">{h.title}</div>
              <p className="mt-0.5 text-[15px] leading-snug text-[color:var(--muted)]">{h.text}</p>
              <Link href={h.href} className="mt-2 inline-flex min-h-10 items-center gap-1 text-[15px] font-semibold text-[color:var(--brand)] hover:underline sm:min-h-0">
                {h.cta} <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
            {canDismiss ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => weg(h.key)}
                className="absolute right-1 top-1 flex h-10 w-10 items-center justify-center rounded-full text-[color:var(--muted)] hover:bg-[color:var(--surface-sunken)]"
                aria-label="Für 30 Tage ausblenden"
                title="Für 30 Tage ausblenden"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
