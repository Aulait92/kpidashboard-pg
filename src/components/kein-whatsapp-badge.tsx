"use client";

// Kennzeichen „Kein WhatsApp“ an Pipeline-Karte und Kontaktzeile (lib/kein-whatsapp-kennzeichen.ts).
// Ein Klick ruft an und öffnet nicht den Kontakt. Farben wie „Nicht erreicht“ (orange), Form wie die Hinweis-Chips
// an der Karte (Termin, Wiedervorlage); auf dem Handy so hoch, dass man sie gut trifft.

import { Phone } from "lucide-react";
import { cn } from "@/lib/utils";

export function KeinWhatsAppBadge({ phone, className }: { phone: string; className?: string }) {
  return (
    <a
      href={`tel:+${phone.replace(/[^\d]/g, "")}`}
      draggable={false}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      title="Kein WhatsApp: anrufen"
      aria-label="Kein WhatsApp: anrufen"
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1 rounded-md bg-orange-50 px-2 text-xs font-medium text-orange-700 ring-1 ring-inset ring-orange-200 transition hover:bg-orange-100 sm:h-auto sm:px-1.5 sm:py-0.5 sm:text-[11px]",
        className,
      )}
    >
      <Phone className="h-3 w-3" aria-hidden />
      Kein WhatsApp
    </a>
  );
}
