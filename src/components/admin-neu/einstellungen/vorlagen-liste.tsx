"use client";

// Einstellungen → Mail- und WhatsApp-Vorlagen: eine Zeile je Nachricht (Titel, wann sie rausgeht), Antippen klappt die
// Vorschau auf. Die Mails werden erst beim Aufklappen gezeichnet (iframes), damit die Seite schnell bleibt.

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui";
import { NachrichtVorschauTeile } from "@/components/vertrieb/nachricht-vorschau";
import type { KatalogEintrag, VorlagenStatus, WhatsAppVorlage } from "@/lib/vertrieb/nachricht-vorschau";
import { cn } from "@/lib/utils";

function Zeile({ titel, text, rechts, children }: { titel: string; text?: string | null; rechts?: React.ReactNode; children: React.ReactNode }) {
  const [offen, setOffen] = useState(false);
  return (
    <li data-vorlage-zeile>
      <button
        type="button"
        onClick={() => setOffen((o) => !o)}
        aria-expanded={offen}
        className="flex min-h-12 w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-[color:var(--surface-sunken)] sm:px-5"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{titel}</span>
          {text ? <span className="block text-xs text-[color:var(--muted)]">{text}</span> : null}
        </span>
        {rechts}
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-[color:var(--muted)] transition", offen && "rotate-180")} />
      </button>
      {offen ? <div className="px-4 pb-4 sm:px-5">{children}</div> : null}
    </li>
  );
}

export function KatalogListe({ eintraege, du }: { eintraege: KatalogEintrag[]; du: boolean }) {
  return (
    <ul className="divide-y divide-[color:var(--border)]">
      {eintraege.map((e) => (
        <Zeile
          key={e.key}
          titel={e.titel}
          text={e.wann}
          rechts={
            e.abTest || (du && !e.du) ? (
              <span className="flex shrink-0 flex-wrap justify-end gap-1">
                {e.abTest ? <Badge tone="info">A/B-Test</Badge> : null}
                {du && !e.du ? <Badge tone="neutral">nur Sie</Badge> : null}
              </span>
            ) : null
          }
        >
          <NachrichtVorschauTeile teile={e.teile} />
        </Zeile>
      ))}
    </ul>
  );
}

const STATUS: Record<VorlagenStatus, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  aktiv: { label: "Aktiv", tone: "success" },
  wartet: { label: "Wartet auf Meta", tone: "warning" },
  abgelehnt: { label: "Abgelehnt", tone: "danger" },
  werbung: { label: "Als Werbung eingestuft", tone: "danger" },
  fehlt: { label: "Nicht eingereicht", tone: "neutral" },
  ersetzt: { label: "Ersetzt durch neue Fassung", tone: "neutral" },
};

const RANG: VorlagenStatus[] = ["aktiv", "wartet", "werbung", "abgelehnt", "ersetzt", "fehlt"];

/** Eine Zeile je Nachricht (z. B. Terminbestätigung), aufgeklappt alle Fassungen mit Freigabestand; aktive zuerst. */
export function WhatsAppListe({ vorlagen }: { vorlagen: WhatsAppVorlage[] }) {
  const gruppen = [...new Set(vorlagen.map((v) => v.gruppe))].map((g) => ({
    titel: g,
    fassungen: vorlagen.filter((v) => v.gruppe === g).sort((a, b) => RANG.indexOf(a.status) - RANG.indexOf(b.status)),
  }));
  return (
    <ul className="divide-y divide-[color:var(--border)]">
      {gruppen.map((g) => {
        const aktiv = g.fassungen.filter((v) => v.status === "aktiv").length;
        const best = g.fassungen[0].status;
        return (
          <Zeile
            key={g.titel}
            titel={g.titel}
            text={`${g.fassungen.length} ${g.fassungen.length === 1 ? "Fassung" : "Fassungen"}${aktiv ? `, ${aktiv} aktiv` : ""}`}
            rechts={<Badge tone={STATUS[best].tone}>{STATUS[best].label}</Badge>}
          >
            <div className="space-y-4">
              {g.fassungen.map((v) => (
                <div key={v.name} className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[color:var(--muted)]">
                    <span className="break-all">{v.name}</span>
                    {v.du ? <span>· Du</span> : null}
                    <Badge tone={STATUS[v.status].tone}>{STATUS[v.status].label}</Badge>
                  </div>
                  <NachrichtVorschauTeile teile={[{ kanal: "whatsapp", an: "491700000000", vorlage: v.name, text: v.text }]} />
                </div>
              ))}
            </div>
          </Zeile>
        );
      })}
    </ul>
  );
}
