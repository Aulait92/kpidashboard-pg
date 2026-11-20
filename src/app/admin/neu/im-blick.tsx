import Link from "next/link";
import { CalendarDays, ChevronDown, ChevronRight, ClipboardList, Plus } from "lucide-react";
import { HEUTE_ICONS } from "@/components/admin/heute-icons";
import { ladeVertriebBlick } from "@/components/admin/vertrieb-blick";
import { ButtonLink, Card, CardHeader, EmptyState } from "@/components/ui";
import type { AutoRow } from "@/lib/admin-heute";
import { NEU } from "@/lib/admin-neu/navigation";
import { neuerPfad } from "@/lib/admin-neu/umzug";
import { SOURCE_LABEL, STAGES, shortName } from "@/lib/vertrieb/crm";
import { fmtDateTime } from "@/lib/vertrieb/dates";
import { cn } from "@/lib/utils";

// Mein Tag, rechte Spalte (am Handy unter den Rollen-Karten), Umbau 20.11.2026 (Ziel SUS 90+):
// EINE Karte „Im Blick“ statt vier Blöcken (Vertrieb auf einen Blick, Neue Buchungen, Hochrechnung, Läuft von allein).
// Sichtbar bleibt, was man am Tag braucht: die nächsten Termine und die Hochrechnung als eine Zeile. Alles Seltene
// (Vertriebszahlen, Kontakte je Stufe, neue Anfragen, neue Buchungen, Läuft von allein) liegt zugeklappt unter „Mehr“;
// die Zusammenfassung nennt die Zahlen, damit man nur bei Bedarf aufklappt.
// Daten: ladeVertriebBlick (components/admin/vertrieb-blick.tsx) und ladeHeuteSeite (lib/admin-heute-laden.ts).

const eur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
/** Alte Admin-Adressen auf die Seite im neuen Admin (umzug.ts), sonst wie sie sind. */
const neu = (href: string) => neuerPfad(href) ?? href;
const zeile = "flex min-h-11 items-center gap-3 px-5 py-2.5 transition hover:bg-[color:var(--surface-sunken)]";

type ForecastRow = { label: string; mtd: number; projected: number };

export async function ImBlick({ forecast, neueBuchungen, auto }: { forecast: ForecastRow[] | null | undefined; neueBuchungen: number; auto: AutoRow[] }) {
  const v = await ladeVertriebBlick();
  const termine = v.meetings.slice(0, 3);
  const umsatz = forecast?.find((r) => r.label === "Umsatz");
  const gewinn = forecast?.find((r) => /gewinn/i.test(r.label));
  const haupt = gewinn ?? umsatz;
  const zahlen = [
    { label: "Heute fällig", wert: v.due, href: `${NEU}/vertrieb/aufgaben`, ton: v.due ? "text-amber-700" : "" },
    { label: "Überfällig", wert: v.overdue, href: `${NEU}/vertrieb/aufgaben`, ton: v.overdue ? "text-rose-600" : "" },
    { label: "Antworten", wert: v.answers, href: neu("/admin/neu/vertrieb/kontakte?mail=replied"), ton: v.answers ? "text-emerald-700" : "" },
    { label: "Mail, nie angerufen", wert: v.mailNoCall, href: neu("/admin/neu/vertrieb/kontakte?mail=sent&stage=NEU"), ton: "" },
  ];
  const mehrText = [neueBuchungen > 0 ? (neueBuchungen === 1 ? "1 neue Buchung" : `${neueBuchungen} neue Buchungen`) : null, auto.length ? `${auto.length} automatisch` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <Card>
      <div data-funktion="vertrieb-blick--vertrieb-auf-einen-blick-naechste-termine">
        <CardHeader
          title="Nächste Termine"
          icon={CalendarDays}
          actions={
            <Link href={`${NEU}/vertrieb/termine`} className="-my-2 inline-flex min-h-10 items-center gap-0.5 text-sm font-medium text-[color:var(--brand)] hover:underline">
              Alle
              <ChevronRight className="h-4 w-4" />
            </Link>
          }
        />
        {termine.length ? (
          <ul className="divide-y divide-[color:var(--border)]">
            {termine.map((m) => (
              <li key={m.id}>
                <Link href={`${NEU}/vertrieb/kontakte/${m.contact.id}`} className={zeile}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {fmtDateTime(m.startAt)} · {shortName(m.contact.name)}
                    </span>
                    <span className="block truncate text-xs text-[color:var(--muted)]">{[m.title, m.contact.city].filter(Boolean).join(" · ")}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--border-strong)]" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={CalendarDays}
            title="Keine Termine geplant"
            action={
              <ButtonLink href={`${NEU}/vertrieb/termine?buchen=1`} icon={Plus}>
                Termin buchen
              </ButtonLink>
            }
          />
        )}
      </div>

      {umsatz && haupt ? (
        <Link
          href={`${NEU}/zahlen`}
          className={cn(zeile, "border-t border-[color:var(--border)]")}
          data-funktion="forecast-computemonthlyforecast--umsatz-bzw-gewinn-bis-heute-mit-monats"
        >
          <span className="min-w-0 flex-1 text-sm">
            <span className="font-medium">
              {haupt.label} bis heute {eur(haupt.mtd)}
            </span>
            <span className="text-[color:var(--muted)]"> · Monat ≈ {eur(haupt.projected)}</span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--border-strong)]" />
        </Link>
      ) : null}

      <details className="group border-t border-[color:var(--border)]" data-im-blick-mehr="">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-5 text-sm font-medium [&::-webkit-details-marker]:hidden">
          <span className="flex-1">Vertrieb und Automatik</span>
          {mehrText ? <span className="truncate text-xs font-normal text-[color:var(--muted)]">{mehrText}</span> : null}
          <ChevronDown className="h-4 w-4 shrink-0 text-[color:var(--muted)] transition group-open:rotate-180" />
        </summary>

        {neueBuchungen > 0 ? (
          <Link
            href={neu("/admin/neu/zahlen/umsatz")}
            className={cn(zeile, "border-t border-[color:var(--border)]")}
            data-funktion="admin-buchungen-neu-countneuebuchungen--hinweis-neue-buchungen-seit-letztem-besuch"
            data-neue-buchungen={neueBuchungen}
          >
            <ClipboardList className="h-4 w-4 shrink-0 text-[color:var(--brand)]" />
            <span className="min-w-0 flex-1 text-sm font-medium">{neueBuchungen === 1 ? "1 neue Buchung" : `${neueBuchungen} neue Buchungen`} seit Ihrem letzten Besuch</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--border-strong)]" />
          </Link>
        ) : null}

        <div className="border-t border-[color:var(--border)] px-5 py-3" data-funktion="vertrieb-blick--vertrieb-auf-einen-blick-heute-faellig">
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-[color:var(--muted)]">Vertrieb</h3>
          <div className="-mx-2 grid grid-cols-2 gap-1">
            {zahlen.map((z) => (
              <Link key={z.label} href={z.href} className="rounded-lg px-2 py-1.5 hover:bg-[color:var(--surface-sunken)]">
                <span className="block text-xs text-[color:var(--muted)]">{z.label}</span>
                <span className={cn("block text-lg font-semibold tabular-nums", z.ton)}>{z.wert.toLocaleString("de-DE")}</span>
              </Link>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5" data-funktion="vertrieb-blick--vertrieb-auf-einen-blick-kontakte-je-stufe">
            {STAGES.filter((s) => v.count(s.id) > 0).map((s) => (
              <Link key={s.id} href={neu(`/admin/neu/vertrieb/kontakte?stage=${s.id}`)} className={`badge ${s.color} min-h-8`}>
                {s.label} {v.count(s.id).toLocaleString("de-DE")}
              </Link>
            ))}
          </div>
        </div>

        {v.leads.length ? (
          <div className="border-t border-[color:var(--border)] py-2" data-funktion="vertrieb-blick--vertrieb-auf-einen-blick-neue-anfragen-der">
            <h3 className="px-5 pb-1 pt-1 text-xs font-semibold uppercase tracking-wider text-[color:var(--muted)]">Neue Anfragen (7 Tage)</h3>
            <ul>
              {v.leads.map((l) => (
                <li key={l.id}>
                  <Link href={l.contact ? `${NEU}/vertrieb/kontakte/${l.contact.id}` : `${NEU}/vertrieb/kontakte`} className="block px-5 py-1.5 text-sm hover:bg-[color:var(--surface-sunken)]">
                    <span className="font-medium">{l.contact ? shortName(l.contact.name) : (l.name ?? l.email)}</span>
                    <span className="block text-xs text-[color:var(--muted)]">
                      {fmtDateTime(l.createdAt)} · {SOURCE_LABEL[l.source] ?? l.source}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="border-t border-[color:var(--border)] py-2" data-funktion="admin-heute-autorow--laeuft-von-allein-was-die-app-in-7-tagen">
          <h3 className="px-5 pb-1 pt-1 text-xs font-semibold uppercase tracking-wider text-[color:var(--muted)]">Läuft von allein (7 Tage)</h3>
          {auto.length ? (
            <ul>
              {auto.map((r) => {
                const Icon = HEUTE_ICONS[r.icon];
                return (
                  <li key={r.key} className="flex gap-3 px-5 py-2">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--muted)]" />
                    <span className="min-w-0">
                      <span className="block text-sm">{r.title}</span>
                      <span className="block text-xs text-[color:var(--muted)]">{r.detail}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-5 pb-2 text-sm text-[color:var(--muted)]">Noch nichts automatisch gelaufen.</p>
          )}
        </div>
      </details>
    </Card>
  );
}
