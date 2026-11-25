"use client";

// Banner „Neu: KI-Hilfe und gemeinsames Anzeigenlernen“ (Ole, 24.11.2026; Texte und Regeln: lib/datennutzung.ts).
// Wer: Inhaber eines Software-Kunden, beim normalen Arbeiten, oft am Handy. Aufgabe: die zwei Änderungen lesen und mit
// einem Tipp bestätigen. Steht nur auf „Heute“ unter der Überschrift, in der Breite der Seitenspalte (Usability-Check
// 25.11.2026, U2: vorher über jeder Seite, am Handy 300 px hoch), bis „Verstanden“ gespeichert ist (für den ganzen
// Kunden, nicht nur für diesen Browser). Eingebunden über DatennutzungHeute (datennutzung-heute.tsx).
// Eine Hauptaktion („Verstanden“), „Mehr erfahren“ führt zur Detailseite mit Widerspruch. Solange das Banner steht,
// treten der Hinweis auf Mitteilungen und die Frage zur Nutzungsanalyse zurück (ein Hinweis zur Zeit).
// Regel für die Seite: lib/datennutzung.ts bannerAufSeite.

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { buttonClass } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { BANNER_TEXT, DATENNUTZUNG_PFAD, MELDUNG, bannerAufSeite } from "@/lib/datennutzung";
import { datennutzungAngezeigtAction, datennutzungVerstandenAction } from "@/app/buyer/einstellungen/datennutzung/actions";

export function DatennutzungBanner({ angezeigt }: { /** Erste Anzeige für diese Textversion ist schon festgehalten */ angezeigt: boolean }) {
  const pfad = usePathname() ?? "/buyer";
  const toast = useToast();
  const [weg, setWeg] = useState(false);
  const [pending, start] = useTransition();
  const gemeldet = useRef(angezeigt);
  const aus = !bannerAufSeite(pfad);

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

  // Kompakt: ein Absatz und zwei Knöpfe, am Handy als Leiste über die volle Breite, die Knöpfe stehen im Textfluss hinter dem letzten Satz (etwa 125 px hoch); „Neu:“ fett als Einstieg statt eigener Überschrift
  return (
    <section
      aria-label="Hinweis zur Datennutzung"
      className="-mx-4 mb-4 border-y border-[color:var(--border)] bg-white px-4 py-2 text-[13px] leading-[1.35] sm:mx-0 sm:rounded-[var(--radius-lg)] sm:border sm:py-2.5 sm:shadow-[var(--shadow-sm)]"
      data-datennutzung-banner
    >
      <p className="inline text-[color:var(--foreground)]" data-datennutzung-text>
        <strong className="font-semibold">{NEU}</strong>
        {REST}
      </p>
      <div className="ml-2 inline-flex items-center gap-1 align-middle">
        <button type="button" onClick={verstanden} disabled={pending} className={buttonClass("primary", "sm")} data-datennutzung-verstanden>
          {BANNER_TEXT.verstanden}
        </button>
        <Link href={DATENNUTZUNG_PFAD} className={buttonClass("ghost", "sm", "text-[color:var(--brand)]")} data-datennutzung-mehr>
          {BANNER_TEXT.mehr}
        </Link>
      </div>
    </section>
  );
}

// „Neu:“ hervorheben, der Rest ist der freigegebene Wortlaut (lib/datennutzung.ts BANNER_TEXT)
const NEU = BANNER_TEXT.text.startsWith("Neu:") ? "Neu:" : "";
const REST = BANNER_TEXT.text.slice(NEU.length);
