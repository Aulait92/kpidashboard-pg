import Link from "next/link";
import { connection } from "next/server";
import { CalendarDays, CalendarX2, Video } from "lucide-react";
import { Badge, ButtonLink, Card, EmptyState, buttonClass } from "@/components/ui";
import { AdminRescheduleButton } from "@/components/termin/admin-termin";
import { Aufmerksamkeit } from "@/components/admin-neu/ui/aufmerksamkeit";
import { Kennzahlen, type Kennzahl } from "@/components/admin-neu/ui/kennzahlen";
import { Seite } from "@/components/admin-neu/ui/seite";
import { Chips } from "@/components/admin-neu/vertrieb/chips";
import { V, kontaktPfad } from "@/components/admin-neu/vertrieb/listen";
import { TerminBuchen } from "@/components/admin-neu/vertrieb/termin-buchen";
import { VerkaufenMehr } from "@/components/admin-neu/vertrieb/verkaufen-mehr";
import { adminRescheduleTerminAction } from "@/app/admin/vertrieb/buchungsseite/actions";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/vertrieb/auth";
import { VERTRIEB_CUSTOMER_ID } from "@/lib/vertrieb/buchung";
import { offeneRechtsFaelle } from "@/lib/vertrieb/datenschutz-recht-server";
import { fmtDateTime } from "@/lib/vertrieb/dates";
import { waConfirmLabel } from "@/lib/vertrieb/kontaktakte";
import { ANGEBOT_TAG, FILTER, STUFE_TON, istAbgeschlossen, stufeLabel, type TerminKennzahlen, type TerminZeile } from "@/lib/vertrieb/termine-uebersicht";
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

/** Drei Ansichten als eine Chip-Reihe (Umbau 19.11.2026): Kommende (Standard), Vergangene, Ohne Ergebnis. */
type Sicht = "kommend" | "vergangen" | "ohne";
const SICHTEN: { key: Sicht; label: string }[] = [
  { key: "kommend", label: "Kommende" },
  { key: "vergangen", label: "Vergangene" },
  { key: "ohne", label: "Ohne Ergebnis" },
];
const sichtVon = (s: string | undefined): Sicht => (s === "vergangen" || s === "ohne" ? s : "kommend");
const href = (sicht: Sicht, f?: string) => {
  const q = new URLSearchParams();
  if (sicht !== "kommend") q.set("ansicht", sicht);
  if (f) q.set("f", f);
  const s = q.toString();
  return s ? `${BASIS}?${s}` : BASIS;
};
const SPALTEN = "md:grid-cols-[8.5rem_minmax(0,1.3fr)_minmax(0,1.5fr)_10.5rem_11rem]";

/** Zwei Kennzahlen (Umbau 19.11.2026): Woche und Abschlüsse; „erschienen“ und „mit Angebot“ standen oft ohne Daten da. */
function kennzahlen(k: TerminKennzahlen): Kennzahl[] {
  return [
    { label: "Termine diese Woche", wert: String(k.woche.anzahl), hinweis: k.woche.kommend ? `${k.woche.kommend} noch offen` : "keiner mehr offen", href: href("kommend") },
    { label: "Abschlüsse (30 Tage)", wert: String(k.gewonnen.anzahl), hinweis: `von ${k.gewonnen.kontakte} Kontakten`, ton: k.gewonnen.anzahl ? "gut" : undefined, href: href("vergangen", "gewonnen") },
  ];
}

// Verkaufen → Termine (Ole, 18.11.2026): alle Vertriebstermine (eigene Buchungsseite, von Hand), damit niemand vergessen
// wird. Oben „Braucht Aufmerksamkeit“ (Ergebnis fehlt, kein nächster Schritt, Angebot ohne Reaktion …), darunter je Termin
// eine Zeile: wann, wer, was passiert ist, Stand, nächster Schritt. Zeile öffnet die Kontaktakte.
// Umbau 19.11.2026 (SUS-Ziel 90): zwei Kennzahlen statt vier, eine Chip-Reihe (Kommende als Standard, Vergangene, Ohne
// Ergebnis) statt Zeitraum-Umschalter plus vier Filter. Buchungslinks und Kalender stehen nur noch unter Einstellungen →
// Buchungsseiten; hier nur ein Hinweis, wenn der Kalender fehlt. Ältere Filter (?f=gewonnen …) bleiben als Link nutzbar
// (Kennzahl „Abschlüsse“) und zeigen sich dann als entfernbarer Chip.
export default async function TerminePage({ searchParams }: { searchParams: Promise<{ buchen?: string; ansicht?: string; f?: string }> }) {
  await connection();
  await requireAuth();
  const sp = await searchParams;
  const sicht = sichtVon(sp.ansicht);
  const filter = FILTER.find((f) => f.key === sp.f);
  const now = new Date();
  const [{ zeilen: roh, aufmerksamkeit, kennzahlen: kz }, conn, offenRecht] = await Promise.all([
    ladeTerminUebersicht({ ansicht: sicht === "kommend" ? "kommend" : "alle", filter: filter?.key }, now),
    prisma.calendarConnection.findUnique({ where: { customerId: VERTRIEB_CUSTOMER_ID }, select: { status: true } }),
    offeneRechtsFaelle(),
  ]);
  const zeilen =
    sicht === "vergangen"
      ? roh.filter((z) => !z.kommend)
      : sicht === "ohne"
        ? roh.filter((z) => z.ergebnis.art === "fehlt" && !istAbgeschlossen(z.kontakt))
        : roh;
  const ohneAnzahl = aufmerksamkeit ? aufmerksamkeit.filter((p) => p.key.startsWith("t-ergebnis:")).length : undefined;
  const einstellungen = "/admin/neu/einstellungen/buchungsseiten";

  return (
    <Seite
      titel="Verkaufen"
      reiter="verkaufen"
      aktionen={
        <>
          <VerkaufenMehr datenschutzOffen={offenRecht} />
          <TerminBuchen offen={!!sp.buchen} key={sp.buchen ?? "zu"} />
        </>
      }
    >
      {conn?.status !== "connected" ? (
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--radius-lg)] border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900" data-kalender-hinweis>
          <CalendarX2 className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1">Kalender nicht verbunden, keine freien Zeiten buchbar.</span>
          <Link href={einstellungen} className="inline-flex min-h-10 items-center font-semibold underline sm:min-h-0">
            Verbinden
          </Link>
        </div>
      ) : null}
      <div data-termine-kennzahlen>
        <Kennzahlen werte={kennzahlen(kz)} />
      </div>
      <div data-termine-aufmerksamkeit>
        <Aufmerksamkeit punkte={aufmerksamkeit} max={3} restAufklappen leer="Alles im Griff: Jedes Gespräch hat ein Ergebnis und einen nächsten Schritt." />
      </div>

      <div data-termine-filter>
        <Chips
          label="Ansicht"
          aktiv={filter ? "f" : sicht}
          chips={[
            ...SICHTEN.map((s) => ({ key: s.key, label: s.label, href: href(s.key), anzahl: s.key === "ohne" ? ohneAnzahl : undefined })),
            ...(filter ? [{ key: "f", label: `${filter.label} ✕`, href: href(sicht) }] : []),
          ]}
        />
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
              title={filter ? "Keine Termine mit diesem Filter." : sicht === "ohne" ? "Zu jedem Termin ist ein Ergebnis eingetragen." : sicht === "vergangen" ? "Noch keine vergangenen Termine." : "Keine Termine geplant."}
              action={
                filter ? (
                  <ButtonLink href={href(sicht)} size="md">
                    Filter entfernen
                  </ButtonLink>
                ) : sicht === "ohne" ? (
                  <ButtonLink href={href("kommend")} size="md">
                    Kommende Termine ansehen
                  </ButtonLink>
                ) : (
                  <TerminBuchen />
                )
              }
            />
          )}
        </div>
      </Card>
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
