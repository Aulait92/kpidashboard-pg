"use client";

// Karte „Ihre Buchungsseite“ unter Mein Kalender: Link zur eigenen Buchungsseite (/book/<slug>)
// mit Kopieren und Öffnen (Ole, 14.11.2026; auch für das Google-Demo-Video).

import { useState } from "react";
import { Check, Copy, ExternalLink, Link2 } from "lucide-react";
import { buttonClass, Card, CardHeader } from "@/components/ui";

export function BookingLinkCard({ url, calendarConnected }: { url: string | null; calendarConnected: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* Zwischenablage nicht verfügbar */
    }
  };
  return (
    <Card className="mb-6" data-buchungsseite>
      <CardHeader title="Ihre Buchungsseite" icon={Link2} />
      <div className="space-y-3 p-5 text-[15px]">
        <p className="text-[color:var(--muted)]">
          Über diesen Link buchen Interessenten selbst einen Termin bei Ihnen. Ideal für Ihre E-Mail-Signatur, WhatsApp und Ihre Website.
        </p>
        {url ? (
          <>
            <div className="break-all rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--surface-sunken)] px-3 py-2 font-mono text-sm">
              {url}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={copy} className={buttonClass("primary", "sm")}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Kopiert" : "Kopieren"}
              </button>
              <a href={url} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary", "sm")}>
                <ExternalLink className="h-4 w-4" /> Öffnen
              </a>
            </div>
          </>
        ) : null}
        {!calendarConnected ? (
          <p className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Verbinden Sie zuerst Ihren Kalender, dann zeigt die Seite nur Ihre freien Zeiten.
          </p>
        ) : null}
      </div>
    </Card>
  );
}
