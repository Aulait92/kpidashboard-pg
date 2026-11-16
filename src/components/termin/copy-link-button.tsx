"use client";

import { useState } from "react";
import { CalendarCheck, Check } from "lucide-react";

/** Vertriebskontakt: persönlichen Link zum Entscheidungs-Call kopieren (zum Senden per Mail oder WhatsApp). */
export function CopyLinkButton({ url, label }: { url: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn-ghost"
      title="Persönlichen Buchungslink kopieren"
      data-entscheidungs-link
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          window.prompt("Link kopieren:", url);
        }
      }}
    >
      {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <CalendarCheck className="h-4 w-4" />} {copied ? "Link kopiert" : label}
    </button>
  );
}
