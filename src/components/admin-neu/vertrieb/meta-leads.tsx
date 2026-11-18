import Link from "next/link";
import { ChevronRight, Inbox, Phone } from "lucide-react";
import { Badge, ButtonLink, Card, EmptyState } from "@/components/ui";
import { KONTAKTE, kontaktPfad } from "@/components/admin-neu/vertrieb/listen";
import { shortName } from "@/lib/vertrieb/crm";
import { fmtDate } from "@/lib/vertrieb/dates";
import { META_CHIPS, STAND, ZEITRAEUME } from "@/lib/vertrieb/meta-leads-stand";
import type { MetaLeadZeile, ladeMetaLeads } from "@/lib/vertrieb/meta-leads";
import { cn } from "@/lib/utils";

// Verkaufen → Kontakte → Meta-Leads (Ole, 18.11.2026): eine Zeile je Vermittler aus einem Meta-Formular mit Eingang,
// Stand und nächstem Schritt, oben der Trichter für den Zeitraum. Klick öffnet den Kontakt (dort „Anrufen“).
// Handy: Karten mit Anruf-Knopf, Rechner: Tabelle. Daten: lib/vertrieb/meta-leads.ts.

export const META_ANSICHT = "meta";
const chip = (aktiv: boolean) =>
  cn(
    "inline-flex min-h-10 items-center gap-1 rounded-full border px-3 text-sm font-medium sm:min-h-8",
    aktiv
      ? "border-[color:var(--brand)] bg-[color:var(--brand)] text-white"
      : "border-[color:var(--border)] bg-white text-[color:var(--muted)] hover:text-[color:var(--foreground)]",
  );

const eingangFmt = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d);

export function metaPfad(p: { zeitraum?: string | null; stand?: string | null }) {
  const q = new URLSearchParams({ ansicht: META_ANSICHT });
  if (p.zeitraum && p.zeitraum !== "30") q.set("zeitraum", p.zeitraum);
  if (p.stand) q.set("stand", p.stand);
  return `${KONTAKTE}?${q.toString()}`;
}

export function MetaLeads({ daten }: { daten: Awaited<ReturnType<typeof ladeMetaLeads>> }) {
  const { zeitraum, chip: aktiv, trichter, zaehler, gesamt, zeilen } = daten;
  return (
    <>
      {/* Trichter für den Zeitraum, darunter Zeitraum und Stand-Filter */}
      <Card className="mb-4">
        <div className="space-y-3 px-4 py-3.5 sm:px-5" data-funktion="meta-leads--trichter-und-zeitraum">
          <p className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-sm" aria-label="Trichter">
            {trichter.map((t, i) => (
              <span key={t.key} className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
                {i > 0 ? <span className="text-[color:var(--border-strong)]" aria-hidden>→</span> : null}
                <b className="text-base font-semibold tabular-nums">{t.anzahl}</b>
                <span className="text-[color:var(--muted)]">{t.label}</span>
              </span>
            ))}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {ZEITRAEUME.map((z) => (
              <Link key={z.key} href={metaPfad({ zeitraum: z.key, stand: aktiv })} aria-current={z.key === zeitraum ? "page" : undefined} className={chip(z.key === zeitraum)}>
                {z.label}
              </Link>
            ))}
            <span className="mx-1 hidden w-px self-stretch bg-[color:var(--border)] sm:block" aria-hidden />
            {META_CHIPS.map((c) => (
              <Link
                key={c.key}
                href={metaPfad({ zeitraum, stand: c.key === aktiv ? null : c.key })}
                aria-current={c.key === aktiv ? "page" : undefined}
                className={chip(c.key === aktiv)}
              >
                {c.label} <span className="tabular-nums opacity-80">{zaehler[c.key] ?? 0}</span>
              </Link>
            ))}
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-3 border-b border-[color:var(--border)] px-5 py-3.5">
          <h2 className="text-[15px] font-semibold tracking-tight">
            Meta-Leads <span className="ml-1 font-normal text-[color:var(--muted)]">{aktiv ? `${zeilen.length} von ${gesamt}` : gesamt}</span>
          </h2>
        </div>
        {zeilen.length ? (
          <>
            {/* Handy: Karten mit Anruf-Knopf */}
            <ul className="divide-y divide-[color:var(--border)] md:hidden" data-funktion="meta-leads--liste-mit-stand-und-naechstem-schritt">
              {zeilen.map((z) => (
                <li key={z.contactId} className="flex items-center gap-1 pr-2">
                  <Link href={kontaktPfad(z.contactId)} className="flex min-w-0 flex-1 items-center gap-2 py-3 pl-4">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{shortName(z.name)}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[color:var(--muted)]">
                        <StandBadge z={z} />
                        <span>{[eingangFmt(z.eingang), z.ort].filter(Boolean).join(" · ")}</span>
                      </span>
                      <Naechster z={z} className="mt-1 block truncate text-xs" />
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--border-strong)]" />
                  </Link>
                  {z.phone ? (
                    <a
                      href={`tel:${z.phone.replace(/\s/g, "")}`}
                      aria-label={`${shortName(z.name)} anrufen`}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[color:var(--brand)] hover:bg-[color:var(--surface-sunken)]"
                    >
                      <Phone className="h-4 w-4" />
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>

            {/* Rechner: Tabelle */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="bg-[color:var(--surface-sunken)] text-left text-xs text-[color:var(--muted)]">
                  <tr>
                    <th className="py-2 pl-5 pr-3 font-medium">Eingang</th>
                    <th className="px-3 py-2 font-medium">Agentur</th>
                    <th className="px-3 py-2 font-medium">Stand</th>
                    <th className="px-3 py-2 pr-5 font-medium">Nächster Schritt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--border)]">
                  {zeilen.map((z) => (
                    <tr key={z.contactId} className="hover:bg-[color:var(--surface-sunken)]">
                      <td className="whitespace-nowrap py-2.5 pl-5 pr-3 align-top">
                        <div className="tabular-nums">{eingangFmt(z.eingang)}</div>
                        {z.formular || z.anzeige ? (
                          <div className="max-w-[220px] truncate text-xs text-[color:var(--muted)]" title={[z.formular, z.anzeige].filter(Boolean).join(" · ")}>
                            {[z.formular, z.anzeige].filter(Boolean).join(" · ")}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <Link href={kontaktPfad(z.contactId)} className="font-medium hover:underline">
                          {shortName(z.name)}
                        </Link>
                        <div className="text-xs text-[color:var(--muted)]">{[z.person, z.ort].filter(Boolean).join(" · ")}</div>
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <StandBadge z={z} />
                      </td>
                      <td className="px-3 py-2.5 pr-5 align-top text-xs">
                        <Naechster z={z} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <EmptyState
            icon={Inbox}
            title={aktiv ? "Kein Meta-Lead mit diesem Stand." : "Noch keine Meta-Leads in diesem Zeitraum."}
            action={
              aktiv ? (
                <ButtonLink href={metaPfad({ zeitraum })} size="md">
                  Alle Meta-Leads zeigen
                </ButtonLink>
              ) : zeitraum !== "alle" ? (
                <ButtonLink href={metaPfad({ zeitraum: "alle" })} size="md">
                  Alle Zeiträume zeigen
                </ButtonLink>
              ) : (
                <ButtonLink href="/admin/neu/leads#zuordnen" size="md">
                  Formular zuordnen
                </ButtonLink>
              )
            }
          />
        )}
      </Card>
    </>
  );
}

function StandBadge({ z }: { z: MetaLeadZeile }) {
  const s = STAND[z.stand.key];
  return (
    <Badge tone={s.tone}>
      {s.label}
      {z.stand.detail ? <span className="font-normal opacity-80">· {z.stand.detail}</span> : null}
    </Badge>
  );
}

function Naechster({ z, className }: { z: MetaLeadZeile; className?: string }) {
  const n = z.naechster;
  return (
    <span className={cn(className, n.rot ? "font-medium text-rose-700" : "text-[color:var(--muted)]")}>
      {n.dueAt ? `${fmtDate(n.dueAt)} · ${n.title}` : n.title}
    </span>
  );
}
