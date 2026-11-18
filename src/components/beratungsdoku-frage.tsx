"use client";

// Beratungsdokumentation aktiv anbieten (Ole, 18.11.2026: „Können wir den Vermittler irgendwo noch fragen, ob er die
// Beratungsdokumentation automatisiert haben will?“). Wer: Inhaber, der die Frage nie beantwortet hat, direkt nach dem
// ersten Termin-Ergebnis (Angebot, Abschluss) in „Wie lief der Termin?“. Aufgabe: mit einem Tipp entscheiden.
// Eine Hauptaktion („Ja, vorbereiten“), „Nein“ daneben; Schließen gilt als Nein. Jede Antwort setzt
// Customer.beratungsdokuGefragtAt, danach nie wieder. Bei „Ja“ lässt sich die Dokumentation zu diesem Termin gleich
// erstellen (Toast „Jetzt erstellen“). Dieselbe Frage steht in der Einrichtung (BeratungsdokuEinrichtungFrage).
// Der Server entscheidet, ob gefragt wird (InboxResult.bdFrage); das Blatt wartet, bis kein anderes Blatt offen ist
// (z. B. „Abschluss eingetragen“).

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { BeratungsdokuSheet, type BeratungsdokuZiel } from "@/components/beratungsdoku-sheet";
import { beratungsdokuSchalterAction } from "@/app/buyer/beratungsdoku-actions";
import { BD_FRAGE_TEXT, BD_FRAGE_TITEL } from "@/lib/beratungsdoku";

const EVENT = "beratungsdoku:frage";


/** Nach einem Termin-Ergebnis mit bdFrage: einmal fragen (BeratungsdokuFrageHost in der Shell). */
export function emitBdFrage(ziel: BeratungsdokuZiel | null) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVENT, { detail: ziel }));
}

/**
 * Dieselbe Frage in der Einrichtung (sichtbar, solange sie nie beantwortet wurde). „Ja“ ist der empfohlene Standard
 * (Hauptknopf), „Nein“ daneben. Danach zeigt die Seite den Schalter eingeklappt.
 */
export function BeratungsdokuEinrichtungFrage({ darf }: { darf: boolean }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const antworten = (ja: boolean) =>
    start(async () => {
      const r = await beratungsdokuSchalterAction(ja);
      if (!r.ok) return toast.show({ message: "Das kann nur der Inhaber des Kontos ändern.", tone: "error" });
      toast.show({ message: ja ? "Eingeschaltet: Sie finden sie nach jedem Termin an der Terminkarte." : "Alles klar. Einschalten können Sie es jederzeit unter Einstellungen." });
      router.refresh();
    });
  return (
    <div className="flex flex-wrap gap-2 px-5 pb-4" data-bd-einrichtung-frage>
      <Button variant="primary" size="md" icon={ClipboardCheck} disabled={pending || !darf} onClick={() => antworten(true)} data-bd-frage-ja>
        Ja, vorbereiten
      </Button>
      <Button variant="secondary" size="md" disabled={pending || !darf} onClick={() => antworten(false)} data-bd-frage-nein>
        Nein
      </Button>
    </div>
  );
}

/** Einmal in der Shell. */
export function BeratungsdokuFrageHost() {
  const [wartet, setWartet] = useState<{ ziel: BeratungsdokuZiel | null } | null>(null);
  const [offen, setOffen] = useState<{ ziel: BeratungsdokuZiel | null } | null>(null);
  const [blatt, setBlatt] = useState<BeratungsdokuZiel | null>(null);
  const [pending, start] = useTransition();
  const beantwortet = useRef(false);
  const toast = useToast();
  const router = useRouter();

  useEffect(() => {
    const on = (e: Event) => {
      if (beantwortet.current) return;
      setWartet({ ziel: (e as CustomEvent<BeratungsdokuZiel | null>).detail ?? null });
    };
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);

  // Erst zeigen, wenn kein anderes Blatt mehr offen ist (höchstens 15 Minuten warten)
  useEffect(() => {
    if (!wartet) return;
    const bis = Date.now() + 15 * 60_000;
    const t = window.setInterval(() => {
      if (Date.now() > bis) {
        window.clearInterval(t);
        setWartet(null);
        return;
      }
      if (document.querySelector('[role="dialog"]')) return;
      window.clearInterval(t);
      setOffen(wartet);
      setWartet(null);
    }, 400);
    return () => window.clearInterval(t);
  }, [wartet]);

  const antworten = (ja: boolean, still = false) => {
    const ziel = offen?.ziel ?? null;
    beantwortet.current = true;
    setOffen(null);
    start(async () => {
      const r = await beratungsdokuSchalterAction(ja);
      if (!r.ok) {
        beantwortet.current = false;
        if (!still) toast.show({ message: "Das kann nur der Inhaber des Kontos ändern.", tone: "error" });
        return;
      }
      router.refresh();
      if (still) return;
      toast.show(
        ja
          ? {
              message: "Eingeschaltet: Sie finden sie nach jedem Termin an der Terminkarte.",
              ...(ziel ? { actionLabel: "Jetzt erstellen", onAction: () => setBlatt(ziel) } : {}),
              durationMs: 10_000,
            }
          : { message: "Alles klar. Einschalten können Sie es jederzeit unter Einstellungen." },
      );
    });
  };

  return (
    <>
      {offen ? (
        <Sheet
          open
          onClose={() => antworten(false, true)}
          title={BD_FRAGE_TITEL}
          message={BD_FRAGE_TEXT}
          footer={
            <div className="flex shrink-0 flex-col gap-1.5 border-t border-[color:var(--border)] px-5 py-3" data-bd-frage>
              <Button variant="primary" icon={ClipboardCheck} className="h-11 w-full text-[15px]" disabled={pending} onClick={() => antworten(true)} data-bd-frage-ja>
                Ja, vorbereiten
              </Button>
              <button
                type="button"
                className="inline-flex min-h-10 w-full items-center justify-center text-sm font-medium text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
                disabled={pending}
                onClick={() => antworten(false)}
                data-bd-frage-nein
              >
                Nein, danke
              </button>
            </div>
          }
        >
          {null}
        </Sheet>
      ) : null}
      <BeratungsdokuSheet
        ziel={blatt}
        onClose={() => setBlatt(null)}
        onDone={(m) => toast.show({ message: m })}
        onError={(m) => toast.show({ message: m, tone: "error" })}
      />
    </>
  );
}
