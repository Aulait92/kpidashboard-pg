// Lead-Detail: Verlauf des automatischen Nachfassens (nur sichtbar, wenn es
// für diesen Lead eine Abfolge gibt) und „Automatisches Nachfassen stoppen“.

import { Repeat } from "lucide-react";
import { Card } from "@/components/ui";
import { loadLeadSequences } from "@/lib/lead-sequences";
import { LeadSequenceStop } from "./lead-sequence-stop";

const fmt = (iso: string) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export async function LeadSequenceCard({ leadId, readOnly }: { leadId: string; readOnly?: boolean }) {
  const list = await loadLeadSequences(leadId);
  if (list.length === 0) return null;
  const active = list.find((s) => s.active);
  return (
    <Card className="mb-6">
      <div className="flex flex-wrap items-center gap-3 border-b border-[color:var(--border)] px-5 py-3.5">
        <Repeat className="h-5 w-5 shrink-0 text-[color:var(--brand)]" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold">Automatisches Nachfassen</div>
          <div className="text-xs text-[color:var(--muted)]">
            {active
              ? `Läuft: ${active.label}${active.next ? ` · nächster Schritt ${fmt(active.next.at)} (${active.next.text})` : ""}`
              : "Keine Abfolge aktiv"}
          </div>
        </div>
        {active && !readOnly ? <LeadSequenceStop leadId={leadId} /> : null}
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
