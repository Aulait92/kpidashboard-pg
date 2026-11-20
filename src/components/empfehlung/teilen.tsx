"use client";

// Öffentliche Seite des Empfehlenden (/empfehlung/[token]): „An wen?“ wählen, eine Hauptaktion „Per WhatsApp
// weiterleiten“ (Paket 3, 20.11.2026). Die Auswahl bestimmt die Ansprache der Nachricht und der Kontaktseite.
// Eigene kleine Datei, damit die öffentliche Seite nicht den ganzen Vermittler-Code lädt.

import { useState } from "react";
import { Check, CheckCircle2, Circle, MessageCircle, Share2 } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { haptic } from "@/lib/haptics";
import type { Ansprache } from "@/lib/ansprache";

export type ShareAudience = { an: Ansprache; label: string; hint: string };

export function ShareReferral({ texts, audiences }: { texts: Record<Ansprache, string>; audiences: readonly ShareAudience[] }) {
  const [an, setAn] = useState<Ansprache>(audiences[0]?.an ?? "du");
  const [copied, setCopied] = useState(false);
  const text = texts[an];
  return (
    <div className="space-y-3" data-referral-share>
      <div role="radiogroup" aria-label="An wen?" className="grid grid-cols-2 gap-2" data-referral-audience>
        {audiences.map((x) => {
          const on = x.an === an;
          const Icon = on ? CheckCircle2 : Circle;
          return (
            <button
              key={x.an}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => {
                setAn(x.an);
                setCopied(false);
                haptic("light");
              }}
              className={`flex min-h-12 items-center gap-2 rounded-[var(--radius-md)] border px-3 py-2 text-left transition ${
                on ? "border-[color:var(--brand)] bg-[color:var(--brand-soft,#eff6ff)]" : "border-[color:var(--border)] bg-white hover:border-[color:var(--border-strong)]"
              }`}
              data-referral-audience-option={x.an}
            >
              <Icon className={`h-5 w-5 shrink-0 ${on ? "text-[color:var(--brand)]" : "text-[color:var(--border-strong)]"}`} />
              <span className="min-w-0">
                <span className="block text-sm font-medium leading-tight">{x.label}</span>
                <span className="block text-xs text-[color:var(--muted)]">{x.hint}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="rounded-[var(--radius-md)] bg-[color:var(--surface-sunken)] px-4 py-3 text-sm leading-relaxed [overflow-wrap:anywhere]" data-referral-text>
        {text}
      </div>
      <a
        href={`https://wa.me/?text=${encodeURIComponent(text)}`}
        target="_blank"
        rel="noopener noreferrer"
        className={buttonClass("primary", "md", "h-12 w-full text-base")}
        onClick={() => haptic("light")}
        data-referral-whatsapp-share
      >
        <MessageCircle className="h-5 w-5" /> Per WhatsApp weiterleiten
      </a>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="text-sm text-[color:var(--muted)]">Gern an mehrere schicken.</span>
        <button
          type="button"
          className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-[color:var(--brand)] hover:underline"
          onClick={async () => {
            // Teilen-Menü des Handys (SMS, Signal, E-Mail …), sonst Text kopieren
            if (typeof navigator.share === "function") {
              await navigator.share({ text }).catch(() => {});
              return;
            }
            await navigator.clipboard?.writeText(text).catch(() => {});
            setCopied(true);
            haptic("success");
          }}
        >
          {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />} {copied ? "Kopiert" : "Anders teilen"}
        </button>
      </div>
    </div>
  );
}
