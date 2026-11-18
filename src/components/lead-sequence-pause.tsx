"use client";

// Blatt „Nachfassen pausieren“ (Paket P5, Ole 17.11.2026). Wer: der Vermittler am Kontakt, oft nach dem Vorab-Check-Push
// („Schon abgeschlossen oder lieber anhalten?“) oder nach einem Telefonat („Ich überlege noch“). Aufgabe: das Nachfassen
// zum Angebot bis zu einem Tag anhalten, danach startet es von selbst neu. Ersetzt am Angebot den Knopf „Automatisches
// Nachfassen stoppen“ (Stoppen steht im Blatt unten), damit die Karte eine Aktion behält. Standard: 2 Wochen.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PauseCircle } from "lucide-react";
import { Button } from "@/components/ui";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { bedenkzeitAction, stopLeadSequenceAction } from "@/app/buyer/sequence-actions";

export type PauseOption = { wahl: string; label: string; tag: string };

const tagAusYmd = (ymd: string) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: "UTC", weekday: "short", day: "numeric", month: "numeric" }).format(new Date(`${ymd}T12:00:00Z`));

export function LeadSequencePause({
  leadId,
  optionen,
  min,
  max,
  aendern,
  offen,
  onOffen,
}: {
  leadId: string;
  optionen: PauseOption[];
  min: string;
  max: string;
  aendern?: boolean;
  /** Von außen geöffnet (Menü „Mehr“ unter „Nächste Nachrichten“, Paket P6): dann ohne eigenen Knopf */
  offen?: boolean;
  onOffen?: (o: boolean) => void;
}) {
  const [eigen, setEigen] = useState(false);
  const gesteuert = offen !== undefined;
  const open = gesteuert ? offen : eigen;
  const setOpen = (o: boolean) => (gesteuert ? onOffen?.(o) : setEigen(o));
  const [wahl, setWahl] = useState("2w");
  const [datum, setDatum] = useState("");
  const [busy, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const gewaehlt = optionen.find((o) => o.wahl === wahl);
  const tag = wahl === "datum" ? (datum ? tagAusYmd(datum) : null) : (gewaehlt?.tag ?? null);

  const fertig = (message: string) => {
    setOpen(false);
    toast.show({ message, tone: "success" });
    router.refresh();
  };
  const pausieren = () =>
    start(async () => {
      const res = await bedenkzeitAction(leadId, wahl === "datum" ? { datum } : { wahl });
      if (!res.ok) return void toast.show({ message: res.error, tone: "error" });
      fertig(res.text);
    });
  const stoppen = () =>
    start(async () => {
      const res = await stopLeadSequenceAction(leadId);
      if (!res.ok) return void toast.show({ message: res.error ?? "Das hat nicht geklappt.", tone: "error" });
      fertig("Automatisches Nachfassen gestoppt");
    });

  return (
    <>
      {gesteuert ? null : (
        <Button variant="secondary" icon={PauseCircle} onClick={() => setOpen(true)} data-nachfassen-pausieren>
          {aendern ? "Ändern" : "Pausieren"}
        </Button>
      )}
      <Sheet open={open} onClose={() => setOpen(false)} title="Nachfassen pausieren" message="Bis dahin fasst die App nicht nach, danach startet sie neu.">
        <div className="space-y-4 px-5 py-4" data-bedenkzeit-blatt>
          <div>
            <div className="mb-1.5 text-xs font-medium text-[color:var(--muted)]">Meldet sich am</div>
            <div className="grid grid-cols-2 gap-2">
              {[...optionen, { wahl: "datum", label: "Anderes Datum", tag: datum ? tagAusYmd(datum) : "wählen" }].map((o) => (
                <button
                  key={o.wahl}
                  type="button"
                  aria-pressed={wahl === o.wahl}
                  onClick={() => setWahl(o.wahl)}
                  className={cn(
                    "rounded-[var(--radius-sm)] border px-2 py-2.5 text-center transition",
                    wahl === o.wahl ? "border-[color:var(--brand)] bg-[color:var(--brand)] text-white" : "border-[color:var(--border)] bg-white hover:border-[color:var(--brand)]",
                  )}
                >
                  <span className="block text-sm font-semibold">{o.label}</span>
                  <span className="mt-0.5 block text-xs tabular-nums opacity-80">{o.tag}</span>
                </button>
              ))}
            </div>
            {wahl === "datum" ? (
              <input
                type="date"
                min={min}
                max={max}
                value={datum}
                onChange={(e) => setDatum(e.target.value)}
                aria-label="Datum"
                className="mt-2 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3 py-2.5 text-base focus:border-[color:var(--brand)] focus:outline-none focus:ring-2 focus:ring-[color:var(--brand)]/15"
              />
            ) : null}
          </div>
          <Button variant="primary" size="md" className="h-11 w-full" disabled={busy || !tag} onClick={pausieren}>
            {tag ? `Bis ${tag} pausieren` : "Datum wählen"}
          </Button>
          <button type="button" disabled={busy} onClick={stoppen} className="block w-full py-1 text-center text-sm text-rose-700 hover:underline disabled:opacity-60">
            Nachfassen ganz stoppen
          </button>
        </div>
      </Sheet>
    </>
  );
}
