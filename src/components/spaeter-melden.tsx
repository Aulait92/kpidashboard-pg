"use client";

// Blatt „Später melden“ (Ole, 18.11.2026): EIN Weg statt „Alle pausieren“ (Paket P6) und „Bedenkzeit eintragen“ (P5).
// Wer: der Vermittler am Kontakt, unterwegs am Handy, nach einem Telefonat („Ich überlege noch“, „Melden Sie sich in zwei
// Wochen“) oder nach dem Vorab-Check-Push. Aufgabe: die automatischen Nachrichten bis zu einem Tag anhalten, danach geht
// es von selbst weiter. Standard 2 Wochen, eine Hauptaktion; „ohne Datum“ (bisher „Alle pausieren“) steht leise darunter.
// Mit Angebot startet am Tag das Nachfassen zum Angebot neu (Bedenkzeit), sonst laufen die Nachrichten weiter.
// Optional die E-Mail „Wie besprochen“ mit dem Tag (nur mit Versand über die App), damit der Kontakt Bescheid weiß.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { spaeterMeldenAction } from "@/app/buyer/sequence-actions";

export type SpaeterOption = { wahl: string; label: string; tag: string };
export type SpaeterProps = {
  optionen: SpaeterOption[];
  min: string;
  max: string;
  /** Angebot liegt beim Kontakt: am Tag startet das Nachfassen zum Angebot neu */
  angebot: boolean;
  /** Haken „Per E-Mail Bescheid geben“ (null: kein Versand über die App möglich) */
  mail: { vorausgewaehlt: boolean } | null;
};

const tagAusYmd = (ymd: string) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: "UTC", weekday: "short", day: "numeric", month: "numeric" }).format(new Date(`${ymd}T12:00:00Z`));

export function SpaeterMelden({ leadId, offen, onOffen, spaeter }: { leadId: string; offen: boolean; onOffen: (o: boolean) => void; spaeter: SpaeterProps }) {
  const [wahl, setWahl] = useState("2w");
  const [datum, setDatum] = useState("");
  const [mail, setMail] = useState(!!spaeter.mail?.vorausgewaehlt);
  const [busy, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const gewaehlt = spaeter.optionen.find((o) => o.wahl === wahl);
  const tag = wahl === "datum" ? (datum ? tagAusYmd(datum) : null) : (gewaehlt?.tag ?? null);

  const senden = (ohneDatum: boolean) =>
    start(async () => {
      const res = await spaeterMeldenAction(leadId, ohneDatum ? { ohneDatum: true } : wahl === "datum" ? { datum } : { wahl }, { mail: !ohneDatum && !!spaeter.mail && mail });
      if (!res.ok) return void toast.show({ message: res.error, tone: "error" });
      onOffen(false);
      toast.show({ message: res.text, tone: res.mail === "nicht_gesendet" ? "error" : "success" });
      router.refresh();
    });

  return (
    <Sheet
      open={offen}
      onClose={() => onOffen(false)}
      title="Später melden"
      message={spaeter.angebot ? "Bis dahin geht nichts raus. Am Tag fasst die App zum Angebot nach." : "Bis dahin geht nichts automatisch raus, danach geht es von selbst weiter."}
    >
      <div className="space-y-4 px-5 py-4" data-spaeter-melden-blatt>
        <div className="grid grid-cols-2 gap-2">
          {[...spaeter.optionen, { wahl: "datum", label: "Anderes Datum", tag: datum ? tagAusYmd(datum) : "wählen" }].map((o) => (
            <button
              key={o.wahl}
              type="button"
              aria-pressed={wahl === o.wahl}
              onClick={() => setWahl(o.wahl)}
              data-spaeter-wahl={o.wahl}
              className={cn(
                "min-h-14 rounded-[var(--radius-sm)] border px-2 py-2.5 text-center transition",
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
            min={spaeter.min}
            max={spaeter.max}
            value={datum}
            onChange={(e) => setDatum(e.target.value)}
            aria-label="Datum"
            className="w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3 py-2.5 text-base focus:border-[color:var(--brand)] focus:outline-none focus:ring-2 focus:ring-[color:var(--brand)]/15"
          />
        ) : null}
        {spaeter.mail ? (
          <label className="flex min-h-10 cursor-pointer items-center gap-3 text-sm" data-spaeter-mail>
            <input type="checkbox" checked={mail} onChange={(e) => setMail(e.target.checked)} className="h-5 w-5 shrink-0 accent-[color:var(--brand)]" />
            <span>Per E-Mail Bescheid geben{tag ? `, dass Sie sich am ${tag} melden` : ""}</span>
          </label>
        ) : null}
        <Button variant="primary" size="md" className="h-11 w-full" disabled={busy || !tag} onClick={() => senden(false)} data-spaeter-speichern>
          {tag ? `Bis ${tag} pausieren` : "Datum wählen"}
        </Button>
        <button type="button" disabled={busy} onClick={() => senden(true)} className="block min-h-10 w-full text-center text-sm text-[color:var(--muted)] hover:underline disabled:opacity-60" data-spaeter-ohne-datum>
          Ohne Datum pausieren, bis Sie fortsetzen
        </button>
      </div>
    </Sheet>
  );
}
