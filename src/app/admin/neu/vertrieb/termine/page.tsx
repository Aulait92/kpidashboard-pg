import Link from "next/link";
import { connection } from "next/server";
import { CalendarDays, CheckCircle2, ChevronDown, ExternalLink, Settings, Video } from "lucide-react";
import { Badge, ButtonLink, Card, EmptyState, buttonClass } from "@/components/ui";
import { CopyField } from "@/components/termin/copy-field";
import { AdminRescheduleButton } from "@/components/termin/admin-termin";
import { Aufmerksamkeit } from "@/components/admin-neu/ui/aufmerksamkeit";
import { Seite } from "@/components/admin-neu/ui/seite";
import { V, kontaktPfad } from "@/components/admin-neu/vertrieb/listen";
import { TerminBuchen } from "@/components/admin-neu/vertrieb/termin-buchen";
import { adminRescheduleTerminAction, disconnectSalesCalendarAction } from "@/app/admin/vertrieb/buchungsseite/actions";
import { PROVIDER_LABELS } from "@/lib/calendar";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/vertrieb/auth";
import { DEFAULT_BOOKING_TYPE, VERTRIEB_CUSTOMER_ID, bookingPath, publicSalesBookingUrl, salesAppUrl } from "@/lib/vertrieb/buchung";
import { fmtDateTime } from "@/lib/vertrieb/dates";
import { waConfirmLabel } from "@/lib/vertrieb/kontaktakte";
import { ANGEBOT_TAG, ANSICHTEN, FILTER, STUFE_TON, ansichtVon, istAbgeschlossen, stufeLabel, type Ansicht, type TerminZeile } from "@/lib/vertrieb/termine-uebersicht";
import { ladeTerminUebersicht } from "@/lib/vertrieb/termine-uebersicht-server";
import { cn } from "@/lib/utils";

export const metadata = { title: "Termine | performancegrowth Admin" };

const TZ = "Europe/Berlin";
const BASIS = `${V}/termine`;
const tagKey = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(d);
const uhr = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(d);
const tagKurz = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: TZ, weekday: "short", day: "2-digit", month: "2-digit" }).format(d).replace(/\.,/, "");
/** „heute“, „morgen“, „gestern“, sonst „Do 20.11.“ */
function tag(d: Date, now: Date) {
  const diff = Math.round((Date.parse(tagKey(d)) - Date.parse(tagKey(now))) / 86_400_000);
  return diff === 0 ? "heute" : diff === 1 ? "morgen" : diff === -1 ? "gestern" : tagKurz(d);
}
const href = (ansicht: Ansicht, f?: string) => {
  const q = new URLSearchParams();
  if (ansicht !== "30") q.set("ansicht", ansicht);
  if (f) q.set("f", f);
  const s = q.toString();
  return s ? `${BASIS}?${s}` : BASIS;
};
const CHIP = "inline-flex min-h-10 shrink-0 items-center gap-1 rounded-full border px-3 text-sm font-medium sm:min-h-8";
const chipAn = (an: boolean) =>
  an ? "border-[color:var(--brand)] bg-[color:var(--brand)] text-white" : "border-[color:var(--border)] bg-white text-[color:var(--muted)] hover:text-[color:var(--foreground)]";
const SPALTEN = "md:grid-cols-[8.5rem_minmax(0,1.3fr)_minmax(0,1.5fr)_10.5rem_11rem]";

// Verkaufen → Termine (Ole, 18.11.2026): Übersicht über alle Vertriebstermine (eigene Buchungsseite, Calendly, von Hand),
// damit niemand vergessen wird. Oben „Braucht Aufmerksamkeit“ (Ergebnis fehlt, kein nächster Schritt, nicht erschienen,
// Angebot ohne Reaktion, Abschlussbonus läuft ab), darunter je Termin eine Zeile: wann, wer, Art, was passiert ist,
// Stand, nächster Schritt. Zeile antippen öffnet die Kontaktakte. Daten: lib/vertrieb/termine-uebersicht(-server).ts.
// Buchungslinks und Kalender (selten gebraucht) eingeklappt darunter; Einstellungen unter Einstellungen → Buchungsseiten.
// „Termin buchen“: Kontakt wählen, dann das bestehende Fenster in der Kontaktakte (auch über „+ Neu → Termin“).
export default async function TerminePage({ searchParams }: { searchParams: Promise<{ buchen?: string; ansicht?: string; f?: string }> }) {
  await connection();
  await requireAuth();
  const sp = await searchParams;
  const ansicht = ansichtVon(sp.ansicht);
  const filter = FILTER.find((f) => f.key === sp.f)?.key;
  const now = new Date();
  const [{ zeilen, anzahl, aufmerksamkeit }, conn, types] = await Promise.all([
    ladeTerminUebersicht({ ansicht, filter }, now),
    prisma.calendarConnection.findUnique({ where: { customerId: VERTRIEB_CUSTOMER_ID }, select: { status: true, provider: true, accountEmail: true } }),
    prisma.salesBookingType.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" }, select: { id: true, slug: true, title: true, durationMin: true, bookingWindowDays: true } }),
  ]);
  const connected = conn?.status === "connected";
  const connect = (provider: "google" | "microsoft") => `/api/${provider}/connect?customerId=${VERTRIEB_CUSTOMER_ID}&zurueck=buchungsseite`;
  // Einstellungen → Buchungsseiten (dieselbe alte Seite wie dieser Reiter, deshalb fester Pfad statt Umzug)
  const einstellungen = "/admin/neu/einstellungen/buchungsseiten";

  return (
    <Seite titel="Verkaufen" reiter="verkaufen" aktionen={<TerminBuchen offen={!!sp.buchen} key={sp.buchen ?? "zu"} />}>
      <div data-termine-aufmerksamkeit>
        <Aufmerksamkeit punkte={aufmerksamkeit} max={4} restAufklappen leer="Alles im Griff: Jedes Gespräch hat ein Ergebnis und einen nächsten Schritt." />
      </div>

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between" data-termine-filter>
        <div className="inline-flex self-start rounded-full border border-[color:var(--border)] bg-white p-0.5" role="group" aria-label="Zeitraum">
          {ANSICHTEN.map((a) => (
            <Link
              key={a.key}
              href={href(a.key, filter)}
              aria-current={a.key === ansicht ? "page" : undefined}
              className={cn(
                "inline-flex min-h-9 items-center rounded-full px-3 text-sm font-medium sm:min-h-8",
                a.key === ansicht ? "bg-[color:var(--foreground)] text-white" : "text-[color:var(--muted)] hover:text-[color:var(--foreground)]",
              )}
            >
              {a.label}
            </Link>
          ))}
        </div>
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
          {FILTER.map((f) => (
            <Link key={f.key} href={href(ansicht, f.key === filter ? undefined : f.key)} aria-current={f.key === filter ? "page" : undefined} className={cn(CHIP, chipAn(f.key === filter))}>
              {f.label} <span className="tabular-nums opacity-80">{anzahl[f.key] ?? 0}</span>
            </Link>
          ))}
        </div>
      </div>

      <Card>
        <div data-funktion="page-termine--termine-calendly-bzw-buchungsseite-mit-meeting" data-termine-liste>
          {zeilen.length ? (
            <>
              <div className={cn("hidden gap-x-4 bg-[color:var(--surface-sunken)] px-5 py-2 text-xs font-medium text-[color:var(--muted)] md:grid", SPALTEN)}>
                <span>Wann und Art</span>
                <span>Kontakt</span>
                <span>Was passiert ist</span>
                <span>Stand</span>
                <span>Nächster Schritt</span>
              </div>
              <ul className="divide-y divide-[color:var(--border)]">
                {zeilen.map((z) => (
                  <Zeile key={z.termin.id} z={z} now={now} />
                ))}
              </ul>
            </>
          ) : (
            <EmptyState
              icon={CalendarDays}
              title={filter ? "Keine Termine mit diesem Filter." : ansicht === "kommend" ? "Keine Termine geplant." : "Keine Termine in diesem Zeitraum."}
              action={
                filter ? (
                  <ButtonLink href={href(ansicht)} size="md">
                    Filter entfernen
                  </ButtonLink>
                ) : ansicht === "kommend" ? (
                  <TerminBuchen />
                ) : (
                  <ButtonLink href={href("alle")} size="md">
                    Alle Termine ansehen
                  </ButtonLink>
                )
              }
            />
          )}
        </div>
      </Card>

      <details className="group mt-5 overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white shadow-[var(--shadow-sm)]" data-termine-buchungslinks>
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-5 text-sm font-semibold [&::-webkit-details-marker]:hidden">
          <span className="flex-1">Buchungslinks und Kalender</span>
          {connected ? null : <Badge tone="warning">Kalender nicht verbunden</Badge>}
          <ChevronDown className="h-4 w-4 text-[color:var(--muted)] transition group-open:rotate-180" />
        </summary>
        <ul className="divide-y divide-[color:var(--border)] border-t border-[color:var(--border)]" data-funktion="page--buchungslink-kopieren">
          {types.map((t) => (
            <li key={t.id} className="space-y-2 px-5 py-4">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium">{t.title.replace(/\s+mit\s+.+$/, "")}</span>
                <span className="text-xs text-[color:var(--muted)]">
                  {t.durationMin} Min. · {t.bookingWindowDays} Tage im Voraus
                </span>
              </div>
              <CopyField value={t.slug === DEFAULT_BOOKING_TYPE ? publicSalesBookingUrl() : salesAppUrl(bookingPath(t.slug))} label="Link kopieren" />
              {t.slug !== DEFAULT_BOOKING_TYPE ? <p className="text-xs text-[color:var(--muted)]">Persönlicher Link je Kontakt: Kontaktakte → Termin buchen.</p> : null}
            </li>
          ))}
          {!types.length ? <li className="px-5 py-4 text-sm text-[color:var(--muted)]">Keine Buchungsseite aktiv.</li> : null}
        </ul>
        <div className="border-t border-[color:var(--border)] px-5 py-4 text-sm" data-funktion="actions-disconnectsalescalendaraction--vertriebskalender-verbinden-bzw-trennen">
          {connected ? (
            <div className="flex flex-wrap items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span className="min-w-0 flex-1">
                Kalender: {PROVIDER_LABELS[conn!.provider] ?? conn!.provider} verbunden{conn!.accountEmail ? ` (${conn!.accountEmail})` : ""}
              </span>
              <form action={disconnectSalesCalendarAction}>
                <button type="submit" className="min-h-10 text-sm text-[color:var(--muted)] underline">
                  Trennen
                </button>
              </form>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-[color:var(--muted)]">Ohne Kalender keine freien Zeiten.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <a href={connect("google")} className={buttonClass("secondary", "md")}>
                  Google-Kalender verbinden
                </a>
                <a href={connect("microsoft")} className={buttonClass("secondary", "md")}>
                  Outlook verbinden
                </a>
              </div>
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-x-4">
            {connected ? (
              <a href="/termin" target="_blank" rel="noopener" className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-[color:var(--brand)] hover:underline">
                <ExternalLink className="h-4 w-4" /> Buchungsseite ansehen
              </a>
            ) : null}
            <Link href={einstellungen} className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-[color:var(--brand)] hover:underline">
              <Settings className="h-4 w-4" /> Einstellungen
            </Link>
          </div>
        </div>
      </details>
    </Seite>
  );
}

/** Ein Termin: am Handy als Karte, ab md als Tabellenzeile. Antippen öffnet die Kontaktakte, Knöpfe liegen darüber. */
function Zeile({ z, now }: { z: TerminZeile; now: Date }) {
  const m = z.termin;
  const e = z.ergebnis;
  const s = z.schritt;
  const offen = !istAbgeschlossen(z.kontakt);
  const angebot = ANGEBOT_TAG[z.angebot.stand];
  const angebotZeigen = !(z.angebot.stand === "angenommen" && (z.kontakt.stage === "GEWONNEN" || z.kontakt.customerId));
  const eigenerTermin = s.art === "schritt" && s.at.getTime() === m.startAt.getTime();
  const knopf = "relative z-10";
  return (
    <li className={cn("relative grid gap-x-4 gap-y-1.5 px-4 py-3 transition hover:bg-[color:var(--surface-sunken)] md:items-start md:px-5", SPALTEN)} data-termin-zeile={m.id}>
      <div className="flex items-baseline justify-between gap-2 md:block">
        <span className="text-sm font-semibold tabular-nums">
          {tag(m.startAt, now)} <span className="font-normal text-[color:var(--muted)]">{uhr(m.startAt)}</span>
        </span>
        <span className="text-xs text-[color:var(--muted)] md:mt-0.5 md:block">{z.artLabel}</span>
      </div>
      <div className="min-w-0">
        <Link href={kontaktPfad(z.kontakt.id)} className="block truncate font-medium after:absolute after:inset-0 after:content-[''] hover:underline">
          {z.person}
        </Link>
        {z.agentur ? <span className="block truncate text-xs text-[color:var(--muted)]">{z.agentur}</span> : null}
      </div>
      <div className="min-w-0 text-sm" data-was-passiert={e.art}>
        {e.art === "eingetragen" ? (
          <>
            <span className={cn("font-medium", e.id === "gewonnen" && "text-emerald-700", (e.id === "verloren" || e.id === "nicht_erschienen") && "text-rose-700")}>{e.label}</span>
            {e.notiz ? <span className="line-clamp-2 text-[color:var(--muted)]">{e.notiz}</span> : null}
          </>
        ) : e.art === "erledigt" ? (
          <span className="line-clamp-2 text-[color:var(--muted)]">{e.notiz ?? "Erledigt, ohne Ergebnis"}</span>
        ) : e.art === "abgesagt" ? (
          <>
            <span className="font-medium text-amber-700">Abgesagt</span>
            {e.notiz ? <span className="line-clamp-2 text-[color:var(--muted)]">{e.notiz}</span> : null}
          </>
        ) : e.art === "fehlt" ? (
          offen && z.ergebnisHref ? (
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-medium text-rose-700">Kein Ergebnis</span>
              <Link href={z.ergebnisHref} className={cn(buttonClass("secondary", "sm"), knopf)} data-ergebnis-eintragen>
                Ergebnis eintragen
              </Link>
            </span>
          ) : (
            <span className="text-[color:var(--muted)]">Kein Ergebnis eingetragen</span>
          )
        ) : (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={e.art === "laeuft" ? "font-medium text-[color:var(--brand)]" : "text-[color:var(--muted)]"}>{e.art === "laeuft" ? "Läuft gerade" : "Geplant"}</span>
            {m.joinUrl ? (
              <a href={m.joinUrl} target="_blank" rel="noreferrer" className={cn(buttonClass("secondary", "sm"), knopf)}>
                <Video className="h-3.5 w-3.5" /> Meeting
              </a>
            ) : m.location ? (
              <span className="text-xs text-[color:var(--muted)]">{m.location}</span>
            ) : null}
            {m.bookingTypeId && m.manageToken ? (
              <span className={knopf}>
                <AdminRescheduleButton action={adminRescheduleTerminAction} meetingId={m.id} title={`${m.title}, ${fmtDateTime(m.startAt)}`} startAt={m.startAt.toISOString()} />
              </span>
            ) : null}
            {m.waConfirmStatus ? <span className="block w-full text-xs text-[color:var(--muted)]">WhatsApp-Bestätigung {waConfirmLabel(m.waConfirmStatus)}</span> : null}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-start gap-1" data-stand>
        {/* Stufe „Termin“ sagt hier nichts Neues (jeder Kontakt mit Termin steht dort), nur andere Stufen zeigen */}
        {z.kontakt.stage !== "TERMIN" || z.kontakt.customerId ? (
          <Badge tone={z.kontakt.customerId ? "success" : (STUFE_TON[z.kontakt.stage] ?? "neutral")}>{stufeLabel(z.kontakt)}</Badge>
        ) : null}
        {angebotZeigen ? <Badge tone={angebot.tone}>{angebot.label}</Badge> : null}
      </div>
      <div className="text-sm" data-naechster-schritt={s.art}>
        <span className="text-[color:var(--muted)] md:hidden">Nächster Schritt: </span>
        {s.art === "schritt" ? (
          eigenerTermin ? (
            <span className="text-[color:var(--muted)]">dieser Termin</span>
          ) : (
            <span className={cn(s.ueberfaellig && "font-medium text-rose-700")}>
              {s.text} · {s.ueberfaellig ? `überfällig seit ${tagKurz(s.at)}` : tag(s.at, now)}
            </span>
          )
        ) : s.art === "keiner" ? (
          <span className="font-medium text-rose-700">keiner</span>
        ) : (
          <span className="text-[color:var(--muted)]">nicht nötig</span>
        )}
      </div>
    </li>
  );
}
