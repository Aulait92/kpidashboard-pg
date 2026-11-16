import Link from "next/link";
import { connection } from "next/server";
import { Download } from "lucide-react";
import { requireAuth } from "@/lib/vertrieb/auth";
import { ART_LABEL, BUCHUNG_ARTEN, berlinMonth, BUCHUNG_STATUS, loadBuchungen, STATUS_LABEL, type BuchungFilter } from "@/lib/admin-buchungen";
import { FilterChips } from "@/components/ui/filter-chips";
import { Card } from "@/components/ui";
import { BuchungenListe } from "@/components/admin/buchungen-liste";
import { ZahlenTabs } from "@/components/admin/zahlen-tabs";
import { markBuchungenGesehen } from "@/lib/admin-buchungen-neu";

export const metadata = { title: "Buchungen | performancegrowth Admin" };

// Alle Buchungen und Änderungen aller Kunden (lib/admin-buchungen.ts). Filter über die URL:
// ?monat=JJJJ-MM | alle, ?von=&bis=, ?art=, ?status= (offen = Anfrage oder offene Aufgabe), ?kunde=, ?q=.
// Ohne Zeitraum: dieser Monat.
const eur = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: Number.isInteger(n) ? 0 : 2 }).format(n);
const monthLabel = (m: string) => new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}-15T12:00:00Z`));
const dayLabel = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);

export default async function BuchungenPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await connection();
  const session = await requireAuth();
  const sp = await searchParams;
  const f: BuchungFilter = { monat: sp.monat, von: sp.von, bis: sp.bis, art: sp.art, status: sp.status, kunde: sp.kunde, q: sp.q };
  const now = new Date();
  const { rows, sums, range, customers } = await loadBuchungen(f, now);
  // Hinweis „neue Buchungen“ auf Heute zurücksetzen (je Admin-Login)
  await markBuchungenGesehen(session.userId, now);

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

  return (
    <main className="mx-auto w-full max-w-[1360px] flex-1 space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <ZahlenTabs />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Buchungen</h1>
          <p className="text-sm text-[color:var(--muted)]">Alle Buchungen und Änderungen aller Kunden, Beträge netto · {periodText}</p>
        </div>
        <a
          href={`/admin/zahlen/buchungen/export?${qs.toString()}`}
          className="inline-flex h-9 items-center gap-2 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-sm font-medium"
        >
          <Download className="h-4 w-4" /> CSV exportieren
        </a>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="px-5 py-4">
          <div className={`text-2xl font-semibold tabular-nums ${sums.monthly > 0 ? "text-emerald-700" : sums.monthly < 0 ? "text-rose-700" : ""}`}>
            {sums.monthly >= 0 ? "+" : "−"}
            {eur(Math.abs(sums.monthly))}
          </div>
          <div className="text-sm text-[color:var(--muted)]">monatlich wiederkehrend</div>
        </Card>
        <Card className="px-5 py-4">
          <div className="text-2xl font-semibold tabular-nums">{sums.oneOff < 0 ? `−${eur(-sums.oneOff)}` : eur(sums.oneOff)}</div>
          <div className="text-sm text-[color:var(--muted)]">einmalig</div>
        </Card>
        <Link href={`/admin/zahlen/buchungen?${openQs.toString()}`} className="block">
          <Card className="px-5 py-4 transition hover:border-[color:var(--border-strong)]">
            <div className={`text-2xl font-semibold tabular-nums ${sums.open ? "text-amber-700" : ""}`}>{sums.open}</div>
            <div className="text-sm text-[color:var(--muted)]">offene Anfragen bzw. Aufgaben</div>
          </Card>
        </Link>
      </div>

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

      <Card>
        <div className="flex items-center justify-between border-b border-[color:var(--border)] px-5 py-3 text-sm">
          <span className="font-semibold">
            {sums.count} {sums.count === 1 ? "Eintrag" : "Einträge"}
          </span>
          <span className="hidden text-xs text-[color:var(--muted)] sm:inline">Summen ohne Anfragen, Abgelehntes und Zurückgenommenes</span>
        </div>
        <BuchungenListe rows={rows} />
      </Card>
    </main>
  );
}
