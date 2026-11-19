import Link from "next/link";
import { Scale } from "lucide-react";
import { Badge, Card, EmptyState } from "@/components/ui";
import type { RechtsFall } from "@/lib/vertrieb/datenschutz-recht-server";
import { fmtDate } from "@/lib/vertrieb/dates";
import { VORLAGE_LABEL, istVorlagenArt } from "@/lib/vertrieb/datenschutz-recht";

// Liste „Datenschutz und Recht“ (Ole, 19.11.2026), alter und neuer Admin: Nachweisprotokoll je Fall. Nur Kontakt-ID,
// keine Namen oder Inhalte. Zeile antippen öffnet die Kontaktakte (dort Vorlage prüfen und senden).

const STATUS: Record<RechtsFall["status"], { label: string; tone: "danger" | "warning" | "success" }> = {
  ueberfaellig: { label: "Frist überschritten", tone: "danger" },
  offen: { label: "offen", tone: "warning" },
  beantwortet: { label: "beantwortet", tone: "success" },
};

const antwortText = (f: RechtsFall) =>
  f.antwortAt ? `${fmtDate(f.antwortAt)}${f.antwortVorlage && istVorlagenArt(f.antwortVorlage) ? ` (${VORLAGE_LABEL[f.antwortVorlage]})` : f.antwortVorlage === "manuell" ? " (vermerkt)" : ""}` : "offen";

export function DatenschutzListe({ faelle, kontaktHref }: { faelle: RechtsFall[]; kontaktHref: (id: string) => string }) {
  if (!faelle.length) {
    return (
      <Card>
        <EmptyState icon={Scale} title="Keine Fälle" text="Anfragen und Abmahnungen aus Antworten auf Kalt-Mails landen automatisch hier." />
      </Card>
    );
  }
  return (
    <Card>
      <div className="hidden grid-cols-[7rem_6.5rem_6.5rem_6.5rem_minmax(0,1fr)_7rem_minmax(0,1fr)] gap-3 border-b border-[color:var(--border)] px-5 py-2 text-xs font-medium text-[color:var(--muted)] md:grid">
        <span>Art</span>
        <span>Eingang</span>
        <span>Frist</span>
        <span>Löschung</span>
        <span>Antwort</span>
        <span>Kontakt-ID</span>
        <span>Wer</span>
      </div>
      <ul className="divide-y divide-[color:var(--border)]" data-datenschutz-liste>
        {faelle.map((f) => {
          const inhalt = (
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 px-5 py-3 text-sm md:grid-cols-[7rem_6.5rem_6.5rem_6.5rem_minmax(0,1fr)_7rem_minmax(0,1fr)] md:items-center">
              <span className="col-span-2 flex flex-wrap items-center gap-1.5 md:col-span-1">
                <Badge tone={f.art === "abmahnung" ? "danger" : "brand"}>{f.artLabel}</Badge>
                <Badge tone={STATUS[f.status].tone} className="md:hidden">
                  {STATUS[f.status].label}
                </Badge>
              </span>
              <span>
                <span className="text-[color:var(--muted)] md:hidden">Eingang </span>
                {fmtDate(f.eingangAt)}
              </span>
              <span className={f.status === "ueberfaellig" ? "font-medium text-rose-700" : undefined}>
                <span className="text-[color:var(--muted)] md:hidden">Frist </span>
                {f.art === "abmahnung" ? "sofort" : fmtDate(f.fristAt)}
              </span>
              <span>
                <span className="text-[color:var(--muted)] md:hidden">Löschung </span>
                {f.loeschAt ? fmtDate(f.loeschAt) : "nein"}
              </span>
              <span>
                <span className="text-[color:var(--muted)] md:hidden">Antwort </span>
                {antwortText(f)}
              </span>
              <span className="truncate font-mono text-xs text-[color:var(--muted)]">{f.contactId ?? ""}</span>
              <span className="truncate text-xs text-[color:var(--muted)]">{f.wer}</span>
            </div>
          );
          return <li key={f.fallId}>{f.contactId ? <Link href={kontaktHref(f.contactId)} className="block hover:bg-[color:var(--surface-sunken)]">{inhalt}</Link> : inhalt}</li>;
        })}
      </ul>
    </Card>
  );
}
