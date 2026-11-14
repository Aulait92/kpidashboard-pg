"use client";

// Kopierbarer Freigabe-Link für die IT des Kunden (Microsoft 365), siehe lib/microsoft-admin-consent.ts.

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { buttonClass } from "@/components/ui";

export function MicrosoftAdminConsent({ url, was = "Kalender und Postfach" }: { url: string; was?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* Zwischenablage nicht verfügbar: Link bleibt markierbar */
    }
  };
  return (
    <div className="mb-4 space-y-2 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950" data-microsoft-freigabe>
      <p className="font-medium">Microsoft 365: Leiten Sie diesen Link an Ihre IT weiter.</p>
      <p>Ihre IT gibt damit {was} einmalig für Ihr Unternehmen frei. Danach können Sie sich hier verbinden.</p>
      <div className="break-all rounded-[var(--radius-sm)] border border-amber-200 bg-white px-3 py-2 font-mono text-xs">{url}</div>
      <button type="button" onClick={copy} className={buttonClass("secondary", "sm")}>
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Kopiert" : "Link kopieren"}
      </button>
    </div>
  );
}
