"use client";

// Banner „Neu: KI-Hilfe und gemeinsames Anzeigenlernen“ (Ole, 24.11.2026; Texte und Regeln: lib/datennutzung.ts).
// Wer: Inhaber eines Software-Kunden, beim normalen Arbeiten, oft am Handy. Aufgabe: die zwei Änderungen lesen und mit
// einem Tipp bestätigen. Sitzt im gemeinsamen Rahmen von /buyer (app/buyer/layout.tsx) über jeder Seite, bis
// „Verstanden“ gespeichert ist (für den ganzen Kunden, nicht nur für diesen Browser).
// Eine Hauptaktion („Verstanden“), „Mehr erfahren“ führt zur Detailseite mit Widerspruch. Solange das Banner steht,
// treten der Hinweis auf Mitteilungen und die Frage zur Nutzungsanalyse zurück (ein Hinweis zur Zeit).
// Nicht auf der Detailseite selbst und nicht in der Beratungspräsentation (lib/datennutzung.ts bannerAufSeiteAus).

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Info } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { BANNER_TEXT, DATENNUTZUNG_PFAD, MELDUNG, bannerAufSeiteAus } from "@/lib/datennutzung";
import { datennutzungAngezeigtAction, datennutzungVerstandenAction } from "@/app/buyer/einstellungen/datennutzung/actions";

export function DatennutzungBanner({ angezeigt }: { /** Erste Anzeige für diese Textversion ist schon festgehalten */ angezeigt: boolean }) {
  const pfad = usePathname() ?? "/buyer";
  const toast = useToast();
  const [weg, setWeg] = useState(false);
  const [pending, start] = useTransition();
  const gemeldet = useRef(angezeigt);
  const aus = bannerAufSeiteAus(pfad);

  // Erste Anzeige festhalten (Beginn der 14 Tage): erst wenn das Banner wirklich im Browser eines Inhabers steht
  useEffect(() => {
    if (aus || weg || gemeldet.current) return;
    gemeldet.current = true;
    void datennutzungAngezeigtAction();
  }, [aus, weg]);

  if (aus || weg) return null;

  const verstanden = () => {
    setWeg(true);
    start(async () => {
      const r = await datennutzungVerstandenAction("banner").catch(() => ({ ok: false as const, error: MELDUNG.fehler }));
      if (r.ok) return toast.show({ message: MELDUNG.verstanden });
      setWeg(false);
      toast.show({ message: r.error, tone: "error" });
    });
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pt-4 sm:px-6 lg:px-8" data-datennutzung-banner>
      <section
        aria-labelledby="datennutzung-banner-titel"
        className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-4 shadow-[var(--shadow-sm)] sm:p-5 lg:flex lg:items-center lg:gap-8"
      >
        <div className="min-w-0 flex-1">
          <h2 id="datennutzung-banner-titel" className="flex items-start gap-2 text-[15px] font-semibold leading-snug tracking-tight">
            <Info className="mt-[3px] h-4 w-4 shrink-0 text-[color:var(--brand)]" aria-hidden />
            {BANNER_TEXT.titel}
          </h2>
          <p className="mt-1.5 max-w-3xl text-[13px] leading-[1.45] text-[color:var(--muted)] sm:text-sm sm:leading-relaxed" data-datennutzung-text>
            {BANNER_TEXT.text}
          </p>
        </div>
        <div className="mt-3 flex gap-2 lg:mt-0 lg:shrink-0 lg:flex-col">
          <button type="button" onClick={verstanden} disabled={pending} className={buttonClass("primary", "md", "flex-1 sm:flex-none")} data-datennutzung-verstanden>
            {BANNER_TEXT.verstanden}
          </button>
          <Link href={DATENNUTZUNG_PFAD} className={buttonClass("secondary", "md", "flex-1 sm:flex-none")} data-datennutzung-mehr>
            {BANNER_TEXT.mehr}
          </Link>
        </div>
      </section>
    </div>
  );
}
