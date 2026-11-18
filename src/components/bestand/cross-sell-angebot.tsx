"use client";

// „Weiteres Produkt per Klick anbieten“ (Ole, 18.11.2026, Regeln lib/cross-sell-verkauf.ts): Leiste über der Liste
// „Ohne weiteres Produkt“ und kleiner Zusatz-Knopf an der Wiedervorlage auf Heute. Modul gebucht: direkt zur
// vorbefüllten Kampagne. Nicht gebucht: kurzes Blatt mit eigenen Zahlen und „Modul buchen“ (kein Preis).

import Link from "next/link";
import { useState } from "react";
import { Megaphone, X } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { buttonClass } from "@/components/ui";
import { cn } from "@/lib/utils";
import { CROSS_SELL_KAMPAGNE_HREF, crossSellLeisteText, crossSellNutzenSatz, MODUL_BUCHEN_HREF, type CrossSellVerkauf } from "@/lib/cross-sell-verkauf";

const TITEL = "Allen ein Produkt anbieten";

/** Blatt „Modul nicht gebucht“: ein Satz Nutzen, Hauptaktion „Modul buchen“. */
export function CrossSellModulBlatt({ offen, onClose, verkauf }: { offen: boolean; onClose: () => void; verkauf: Pick<CrossSellVerkauf, "anzahl" | "provision"> }) {
  return (
    <Sheet open={offen} onClose={onClose} title={TITEL}>
      <div className="space-y-4 px-5 py-4" data-cross-sell-blatt>
        <p className="text-[15px] leading-relaxed">{crossSellNutzenSatz(verkauf.anzahl, verkauf.provision)}</p>
        <Link href={MODUL_BUCHEN_HREF} className={buttonClass("primary", "md", "w-full")} onClick={onClose} data-cross-sell-buchen>
          Modul buchen
        </Link>
      </div>
    </Sheet>
  );
}

/** Knopf „Allen ein Produkt anbieten“: Kampagne (gebucht) bzw. Blatt (nicht gebucht). */
function AnbietenKnopf({ verkauf, className, children }: { verkauf: CrossSellVerkauf; className: string; children: React.ReactNode }) {
  const [offen, setOffen] = useState(false);
  if (verkauf.gebucht) {
    return (
      <Link href={CROSS_SELL_KAMPAGNE_HREF} className={className} data-cross-sell-anbieten="kampagne">
        {children}
      </Link>
    );
  }
  return (
    <>
      <button type="button" className={className} onClick={() => setOffen(true)} aria-haspopup="dialog" data-cross-sell-anbieten="blatt">
        {children}
      </button>
      <CrossSellModulBlatt offen={offen} onClose={() => setOffen(false)} verkauf={verkauf} />
    </>
  );
}

/** Leiste über der gefilterten Kontakte-Liste: „12 Kunden ohne weiteres Produkt · [Allen ein Produkt anbieten]“. */
export function CrossSellLeiste({ verkauf, filterWeg }: { verkauf: CrossSellVerkauf; filterWeg: string }) {
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--radius-lg)] border border-[#dbe6ff] bg-[color:var(--brand-soft)] px-4 py-3 text-sm"
      data-cross-sell-filter
      data-cross-sell-leiste
    >
      <span className="min-w-0 flex-1 font-medium text-[color:var(--brand-dark)]">
        <span className="tabular-nums">{crossSellLeisteText(verkauf.anzahl)}</span>
      </span>
      {/* Handy: Zahl und X in einer Zeile, Knopf darunter über die ganze Breite */}
      <AnbietenKnopf verkauf={verkauf} className={buttonClass("primary", "sm", "order-3 w-full sm:order-2 sm:w-auto")}>
        <Megaphone className="h-3.5 w-3.5" />
        {TITEL}
      </AnbietenKnopf>
      <Link href={filterWeg} aria-label="Filter entfernen" className="order-2 -mr-1 inline-flex h-10 w-10 items-center justify-center rounded-full sm:order-3 text-[color:var(--brand-dark)] hover:bg-white/60 sm:h-8 sm:w-8">
        <X className="h-4 w-4" />
      </Link>
    </div>
  );
}

/** Kleiner Zusatz-Knopf an der Wiedervorlage „Weiteres Produkt anbieten?“ (Heute), nur solange das Modul nicht gebucht ist. */
export function CrossSellZusatzKnopf({ verkauf, className }: { verkauf: CrossSellVerkauf; className?: string }) {
  return (
    <span onClick={(e) => e.stopPropagation()} className="contents">
      <AnbietenKnopf verkauf={verkauf} className={cn("min-h-10 text-left text-xs font-semibold text-[color:var(--brand)] hover:underline sm:min-h-0", className)}>
        Allen auf einmal anbieten
      </AnbietenKnopf>
    </span>
  );
}
