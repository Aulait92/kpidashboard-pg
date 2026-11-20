import Link from "next/link";
import { Download } from "lucide-react";
import { ART_LABEL, BUCHUNG_ARTEN, berlinMonth, BUCHUNG_STATUS, loadBuchungen, STATUS_LABEL, type BuchungFilter } from "@/lib/admin-buchungen";
import { markBuchungenGesehen } from "@/lib/admin-buchungen-neu";
import { FilterChips } from "@/components/ui/filter-chips";
import { Card } from "@/components/ui";
import { BuchungenListe } from "@/components/admin/buchungen-liste";

// Alle Buchungen und Änderungen aller Kunden (lib/admin-buchungen.ts), gemeinsam für /admin/zahlen/buchungen und
// /admin/neu/zahlen/umsatz. Filter über die URL: ?monat=JJJJ-MM | alle, ?von=&bis=, ?art=, ?status= (offen = Anfrage
// oder offene Aufgabe), ?kunde=, ?q=. Ohne Zeitraum: dieser Monat.
const eur = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: Number.isInteger(n) ? 0 : 2 }).format(n);
const monthLabel = (m: string) => new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}-15T12:00:00Z`));
const dayLabel = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);

export async function BuchungenAnsicht({
  sp,
  userId,
  basis,
  kopf = true,
  funktionen = {},
}: {
  sp: Record<string, string | undefined>;
  userId: string;
  /** Adresse der Seite (Link „offene Anfragen“) */
  basis: string;
  /** Eigener Titel „Buchungen“ (alter Admin); im neuen Admin trägt die Seite den Titel */
  kopf?: boolean;
  /** data-funktion je Teil (Abnahme neuer Admin) */
  funktionen?: { liste?: string; filter?: string; export?: string };
}) {
  const f: BuchungFilter = { monat: sp.monat, von: sp.von, bis: sp.bis, art: sp.art, status: sp.status, kunde: sp.kunde, q: sp.q };
  const now = new Date();
  const { rows, sums, range, customers } = await loadBuchungen(f, now);
  // Hinweis „neue Buchungen“ auf Heute zurücksetzen (je Admin-Login)
  await markBuchungenGesehen(userId, now);

  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]);
  const openQs = new URLSearchParams(qs);
  openQs.set("status", "offen");
  const thisMonth = berlinMonth(now);
  const months = Array.from({ length: 12 }, (_, i) => {
    const [y, m] = thisMonth.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 - i, 15));
    return d.toISOString().slice(0, 7);
  });
  const periodText =
    f.monat === "alle"
      ? "gesamter Zeitraum"
      : !f.monat && !f.von && !f.bis
        ? `${monthLabel(thisMonth)} (Standard)`
        : f.monat
          ? monthLabel(f.monat)
          : `${range.from ? dayLabel(range.from) : "Anfang"} bis ${range.to ? dayLabel(new Date(range.to.getTime() - 1)) : "heute"}`;

  const exportLink = (
    <a
      href={`/admin/zahlen/buchungen/export?${qs.toString()}`}
      className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-sm font-medium sm:h-9"
      data-funktion={funktionen.export}
    >
      <Download className="h-4 w-4" /> CSV exportieren
    </a>
  );

  return (
    <div className="space-y-5">
      {kopf ? (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Buchungen</h1>
            <p className="text-sm text-[color:var(--muted)]">Alle Buchungen und Änderungen aller Kunden, Beträge netto · {periodText}</p>
          </div>
          {exportLink}
        </div>
      ) : null}

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Card className="px-3 py-3 sm:px-5 sm:py-4">
          <div className={`text-lg font-semibold tabular-nums sm:text-2xl ${sums.monthly > 0 ? "text-emerald-700" : sums.monthly < 0 ? "text-rose-700" : ""}`}>
            {sums.monthly >= 0 ? "+" : "−"}
            {eur(Math.abs(sums.monthly))}
          </div>
          <div className="text-xs text-[color:var(--muted)] sm:text-sm">monatlich</div>
        </Card>
        <Card className="px-3 py-3 sm:px-5 sm:py-4">
          <div className="text-lg font-semibold tabular-nums sm:text-2xl">{sums.oneOff < 0 ? `−${eur(-sums.oneOff)}` : eur(sums.oneOff)}</div>
          <div className="text-xs text-[color:var(--muted)] sm:text-sm">einmalig</div>
        </Card>
        <Link href={`${basis}?${openQs.toString()}`} className="block">
          <Card className="h-full px-3 py-3 transition sm:px-5 sm:py-4 hover:border-[color:var(--border-strong)]">
            <div className={`text-lg font-semibold tabular-nums sm:text-2xl ${sums.open ? "text-amber-700" : ""}`}>{sums.open}</div>
            <div className="text-xs text-[color:var(--muted)] sm:text-sm">Anfragen offen</div>
          </Card>
        </Link>
      </div>

      <div data-funktion={funktionen.filter}>
        <FilterChips
          searchPlaceholder="Kunde, Vorgang"
          fields={[
            { kind: "select", key: "kunde", label: "Kunde", options: customers.map((c) => ({ value: c.id, label: c.name })) },
            { kind: "select", key: "art", label: "Art", options: BUCHUNG_ARTEN.map((a) => ({ value: a, label: ART_LABEL[a] })) },
            {
              kind: "select",
              key: "status",
              label: "Status",
              options: [{ value: "offen", label: "Offen (Anfrage oder Aufgabe)" }, ...BUCHUNG_STATUS.map((s) => ({ value: s, label: STATUS_LABEL[s] }))],
            },
            {
              kind: "period",
              label: "Zeitraum",
              monthKey: "monat",
              fromKey: "von",
              toKey: "bis",
              months: [{ value: "alle", label: "Gesamter Zeitraum" }, ...months.map((m) => ({ value: m, label: monthLabel(m) }))],
            },
          ]}
        />
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--border)] px-5 py-3 text-sm">
          <span className="font-semibold">
            {sums.count} {sums.count === 1 ? "Eintrag" : "Einträge"}
            {kopf ? null : <span className="font-normal text-[color:var(--muted)]"> · {periodText}</span>}
          </span>
          {kopf ? <span className="hidden text-xs text-[color:var(--muted)] sm:inline">Summen ohne Anfragen, Abgelehntes und Zurückgenommenes</span> : exportLink}
        </div>
        <div data-funktion={funktionen.liste}>
          <BuchungenListe rows={rows} />
        </div>
      </Card>
    </div>
  );
}
