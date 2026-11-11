// Kundenbereich → Zahlen: „Deine Garantie“ (Du-Form). Zeigt Fortschritt und
// Voraussetzungen der Lead-Garantie und der Break-even- (Vertreter) bzw.
// Vertrags-Garantie (Makler). Nur bei Garantie-Angebot.

import Link from "next/link";
import { CheckCircle2, Circle, ShieldCheck } from "lucide-react";
import { garantieStatus } from "@/lib/garantien-server";
import { fortschritt, GARANTIE_LABEL, GARANTIE_UMFANG, monatName, type GarantieErgebnis } from "@/lib/garantien";
import type { GarantieFallRow } from "@/lib/garantien-server";

function satz(e: GarantieErgebnis, fall: GarantieFallRow | undefined): string {
  const k = e.kennzahlen;
  const monat = k.monat ? monatName(k.monat) : "";
  if (e.status === "nicht_anwendbar") return e.art === "vertrag" ? "Für Vertreter gilt die Break-even-Garantie." : "Für Makler gilt die Vertrags-Garantie.";
  if (e.status === "nicht_gestartet") return "Startet, sobald deine Anzeigen das erste Mal ausgeliefert werden.";
  if (e.art === "lead") {
    if (e.status === "laeuft") return `Mindestens ${k.minLeads} Leads in deinen ersten ${k.tage} aktiven Tagen – sonst sind Betreuung und Software im Folgemonat kostenlos.`;
    if (e.status === "erfuellt") return `Geschafft: ${k.leads} Leads in ${k.tage} Tagen.`;
  } else if (e.art === "vertrag") {
    if (e.status === "laeuft") return `Mindestens ${k.minVertraege} Verträge nach ${k.tage} aktiven Tagen – sonst sind Betreuung und Software kostenlos, bis du sie hast (längstens 6 Monate).`;
    if (e.status === "erfuellt") return `Geschafft: ${k.vertraege} Verträge seit Kampagnenstart.`;
    if (e.status === "abgelaufen") return "Der Garantiezeitraum von 6 Monaten ist vorbei.";
  } else {
    if (e.status === "laeuft") return `Ab Tag ${k.tage} prüfen wir jeden Monat, ob deine Provision deine Kosten deckt. Wenn nicht, betreuen wir dich ohne Betreuungsgebühr weiter (längstens 6 Monate).`;
    if (e.status === "erfuellt") return "Deine Provision deckt deine Kosten seit Kampagnenstart.";
    if (e.status === "abgelaufen") return "Der Garantiezeitraum von 6 Monaten ist vorbei.";
  }
  const alles = GARANTIE_UMFANG[e.art] === "all";
  if (fall?.status === "gewaehrt") return `${alles ? "Betreuung und Software" : "Betreuung"} im ${monat}: kostenlos, gutgeschrieben auf deiner Rechnung.`;
  if (fall?.status === "abgelehnt") return fall.grund ? `Nicht gewährt: ${fall.grund}` : "Nicht gewährt.";
  if (e.status === "anspruch") return `${alles ? "Betreuung und Software" : "Betreuung"} im ${monat} ${alles ? "sind" : "ist"} für dich kostenlos. Wir schreiben es dir gut.`;
  return "Leider fehlen Voraussetzungen für die Garantie:";
}

export async function GarantieKundeCard({ customerId }: { customerId: string }) {
  const g = await garantieStatus(customerId).catch(() => null);
  if (!g) return null;
  return (
    <section className="mt-6 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-4 text-sm shadow-[var(--shadow-sm)]" data-card="ihre-garantie">
      <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
        <ShieldCheck className="h-5 w-5 text-[color:var(--brand)]" />
        Deine Garantie
      </h2>
      <div className="grid gap-4 md:grid-cols-2">
        {g.ergebnisse.map((e) => {
          const fall = g.faelle.find((f) => f.art === e.art && f.monat === e.kennzahlen.monat);
          return (
            <div key={e.art} className="min-w-0">
              <div className="font-medium">{GARANTIE_LABEL[e.art]}</div>
              <div className="mt-0.5 text-[color:var(--muted)]">{fortschritt(e)}</div>
              <p className="mt-1.5">{satz(e, fall)}</p>
              {e.status !== "nicht_gestartet" && e.status !== "nicht_anwendbar" && e.status !== "erfuellt" ? (
                <ul className="mt-2 space-y-1">
                  {e.bedingungen
                    .filter((b) => b.key !== "rechnung" || !b.ok)
                    .map((b) => (
                      <li key={b.key} className="flex items-start gap-1.5">
                        {b.ok ? (
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-label="erfüllt" />
                        ) : (
                          <Circle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-label="offen" />
                        )}
                        <span>
                          {b.text}
                          {b.key === "provisionssaetze" && !b.ok ? (
                            <>
                              {" "}
                              <Link href="/buyer/provisionen" className="font-semibold text-[color:var(--brand)] underline">
                                Jetzt eintragen
                              </Link>
                            </>
                          ) : null}
                        </span>
                      </li>
                    ))}
                </ul>
              ) : null}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-[color:var(--muted)]">
        Pausen wie Urlaub oder Krankheit verlängern den Zeitraum. Details in den{" "}
        <Link href="/rechtliches/agb" className="underline">
          AGB unter „Garantien“
        </Link>
        .
      </p>
    </section>
  );
}
