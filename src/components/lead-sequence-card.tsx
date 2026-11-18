// Lead-Detail: Verlauf des automatischen Nachfassens (nur sichtbar, wenn es
// für diesen Lead eine Abfolge gibt) und „Automatisches Nachfassen stoppen“.
// Angebot (Paket P5): statt „stoppen“ der Knopf „Pausieren“ mit dem Blatt „Nachfassen pausieren“ (Bedenkzeit, Stoppen
// unten im Blatt); läuft die Bedenkzeit, heißt die Karte „Bedenkzeit bis …“.

import { CalendarClock, Repeat } from "lucide-react";
import { Card } from "@/components/ui";
import { addDaysYmd, berlinYmd } from "@/lib/absence";
import { BEDENKZEIT_KARTE_HINWEIS, BEDENKZEIT_MAX_TAGE, BEDENKZEIT_OPTIONEN, bedenkzeitDatum, tagKurz } from "@/lib/bedenkzeit";
import { istAngebotsAbfolge, istBedenkzeitAbfolge, loadLeadSequences } from "@/lib/lead-sequences";
import { LeadSequencePause } from "./lead-sequence-pause";
import { LeadSequenceStop } from "./lead-sequence-stop";

const fmt = (iso: string) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export async function LeadSequenceCard({ leadId, readOnly }: { leadId: string; readOnly?: boolean }) {
  const list = await loadLeadSequences(leadId);
  if (list.length === 0) return null;
  const active = list.find((s) => s.active);
  // Wiedervorlage des Assistenten (Lead bat um später, Ole 15.11.2026): eigene, deutliche Überschrift
  const recall = active?.kind === "recall" ? active : null;
  const bedenkzeit = active && istBedenkzeitAbfolge(active.kind) && active.step === 0 ? active : null;
  const angebot = !!active && istAngebotsAbfolge(active.kind);
  const Icon = recall || bedenkzeit ? CalendarClock : Repeat;
  const now = new Date();
  const heute = berlinYmd(now);
  const optionen = BEDENKZEIT_OPTIONEN.map((o) => ({ wahl: o.wahl, label: o.label, tag: tagKurz(bedenkzeitDatum(o.wahl, now)) }));
  return (
    <Card id="nachfassen" className="mb-6 scroll-mt-20" data-lead-sequences>
      <div className="flex flex-wrap items-center gap-3 border-b border-[color:var(--border)] px-5 py-3.5">
        <Icon className="h-5 w-5 shrink-0 text-[color:var(--brand)]" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold" data-bot-recall={recall ? "" : undefined} data-bedenkzeit={bedenkzeit ? "" : undefined}>
            {recall
              ? `Wiedervorlage vom Assistenten${recall.next ? `: ${fmt(recall.next.at)} Uhr` : ""}`
              : bedenkzeit
                ? `Bedenkzeit${bedenkzeit.next ? ` bis ${tagKurz(new Date(bedenkzeit.next.at))}` : ""}`
                : "Automatisches Nachfassen"}
          </div>
          <div className="text-xs text-[color:var(--muted)]">
            {recall
              ? "Der Lead hat darum gebeten. Der Assistent meldet sich dann per WhatsApp, Sie müssen nichts tun."
              : bedenkzeit
                ? BEDENKZEIT_KARTE_HINWEIS
                : active
                ? `Läuft: ${active.label}${active.next ? ` · nächster Schritt ${fmt(active.next.at)} (${active.next.text})` : ""}`
                : "Keine Abfolge aktiv"}
          </div>
        </div>
        {active && !readOnly ? (
          angebot ? (
            <LeadSequencePause leadId={leadId} optionen={optionen} min={addDaysYmd(heute, 1)} max={addDaysYmd(heute, BEDENKZEIT_MAX_TAGE)} aendern={!!bedenkzeit} />
          ) : (
            <LeadSequenceStop leadId={leadId} />
          )
        ) : null}
      </div>
      <ul className="space-y-2 px-5 py-3.5 text-sm">
        {list.flatMap((s) => [
          ...(s.stopReason === "Abgeschlossen"
            ? [
                <li key={`${s.id}-done`} className="flex gap-2">
                  <span className="w-24 shrink-0" />
                  <span className="text-[color:var(--muted)]">Abfolge „{s.label}“ abgeschlossen</span>
                </li>,
              ]
            : []),
          ...s.entries
            .slice()
            .reverse()
            .map((e, i) => (
              <li key={`${s.id}-${i}`} className="flex gap-2">
                <span className="w-24 shrink-0 text-xs text-[color:var(--muted)]">{fmt(e.at)}</span>
                <span>{e.text}</span>
              </li>
            )),
          <li key={`${s.id}-start`} className="flex gap-2">
            <span className="w-24 shrink-0 text-xs text-[color:var(--muted)]">{fmt(s.startedAt)}</span>
            <span className="text-[color:var(--muted)]">Abfolge „{s.label}“ gestartet</span>
          </li>,
        ])}
      </ul>
    </Card>
  );
}
