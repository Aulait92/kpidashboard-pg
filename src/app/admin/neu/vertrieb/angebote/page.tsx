import Link from "next/link";
import { ChevronRight, FileText } from "lucide-react";
import { Badge, Card, EmptyState } from "@/components/ui";
import { Seite } from "@/components/admin-neu/ui/seite";
import { kontaktPfad } from "@/components/admin-neu/vertrieb/listen";
import { fmtTag, tagIso } from "@/lib/angebot-zahlungserinnerung";
import { offerAdminHref } from "@/lib/offer-links";
import { BonusHinweis } from "@/components/vertrieb/bonus-hinweis";
import { ANGEBOT_FILTER, ANGEBOT_ZUSTAND, ladeAngebote } from "@/lib/vertrieb/angebote-uebersicht";
import { requireAuth } from "@/lib/vertrieb/auth";
import { cn } from "@/lib/utils";
import { AngebotMehr } from "@/components/vertrieb/angebot-ablehnen";
import { NOCH_KEINE_DATEN } from "@/lib/platzhalter";

export const metadata = { title: "Angebote | performancegrowth Admin" };

const eur = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
const datum = (d: Date | null) =>
  d ? new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "2-digit" }).format(d) : NOCH_KEINE_DATEN;

const BASIS = "/admin/neu/vertrieb/angebote";

// Vertrieb → Angebote: je Angebot die aktuelle Version mit Stand, Filter als Chips (wie /admin/vertrieb/angebote,
// Daten aus lib/vertrieb/angebote-uebersicht.ts). Zeile öffnet die Kontaktakte bei der Angebotskarte.
export default async function AngebotePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAuth();
  const sp = await searchParams;
  const { filter, shown, count, kennzahlen, ablehnGruende } = await ladeAngebote(sp.f);
  const { sent, angenommen, offen, geoeffnet } = kennzahlen;
  const ziel = (o: (typeof shown)[number]) => (o.salesContactId ? `${kontaktPfad(o.salesContactId)}#angebot` : offerAdminHref(o));
  const stand = (o: (typeof shown)[number]) => (
    <>
      <Badge tone={ANGEBOT_ZUSTAND[o.z].tone}>{o.z === "angenommen" ? `Angenommen ${datum(o.acceptedAt)}` : ANGEBOT_ZUSTAND[o.z].label}</Badge>
      {o.grund ? (
        <div className="mt-1 text-xs text-[color:var(--muted)]" data-ablehngrund>
          {o.grund}
        </div>
      ) : null}
      {o.zahlungOffen ? (
        <div className="mt-1 text-xs text-amber-700" data-zahlung-offen>
          Zahlung offen
          {o.paymentReminderAt ? `, erinnern am ${fmtTag(tagIso(o.paymentReminderAt)!)}` : o.naechste ? `, Erinnerung ${fmtTag(o.naechste)}` : ""}
        </div>
      ) : null}
    </>
  );
  // „Mehr“ je Zeile: Als abgelehnt markieren bzw. Wieder öffnen (Ole, 18.11.2026)
  const mehr = (o: (typeof shown)[number]) => (
    <AngebotMehr variant="icon" offer={{ id: o.id, number: o.number, kannAblehnen: o.kannAblehnen, kannWiederOeffnen: o.kannWiederOeffnen, kontakt: !!o.salesContactId }} />
  );

  return (
    <Seite titel="Verkaufen" reiter="verkaufen">
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { l: "Verschickt", v: String(sent.length) },
          { l: "Geöffnet", v: sent.length ? `${Math.round((geoeffnet.length / sent.length) * 100)} %` : NOCH_KEINE_DATEN, s: `${geoeffnet.length} von ${sent.length}` },
          { l: "Angenommen", v: String(angenommen.length), s: sent.length ? `${Math.round((angenommen.length / sent.length) * 100)} % Annahmequote` : undefined },
          { l: "Offen (monatlich)", v: eur(offen.reduce((s, r) => s + Number(r.monthlyFee), 0)), s: `${offen.length} offene Angebote` },
        ].map((k) => (
          <Card key={k.l} className="p-4">
            <div className="text-xs text-[color:var(--muted)]">{k.l}</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{k.v}</div>
            {k.s ? <div className="text-xs text-[color:var(--muted)]">{k.s}</div> : null}
          </Card>
        ))}
      </div>

      {ablehnGruende.length ? (
        <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm" data-ablehngruende>
          <span className="font-medium">Abgelehnt:</span>
          {ablehnGruende.map((g) => (
            <span key={g.grund}>
              {g.label} <span className="tabular-nums text-[color:var(--muted)]">× {g.anzahl}</span>
            </span>
          ))}
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-1.5" data-angebote-filter data-funktion="page-filter--filter-alle-verschickten-offen-angenommen page-filter-zahlung--filter-zahlung-offen">
        {ANGEBOT_FILTER.map((f) => (
          <Link
            key={f.key}
            href={f.key === "alle" ? BASIS : `${BASIS}?f=${f.key}`}
            aria-current={f.key === filter.key ? "page" : undefined}
            className={cn(
              "inline-flex min-h-10 items-center gap-1 rounded-full border px-3 text-sm font-medium sm:min-h-8",
              f.key === filter.key
                ? "border-[color:var(--brand)] bg-[color:var(--brand)] text-white"
                : "border-[color:var(--border)] bg-white text-[color:var(--muted)] hover:text-[color:var(--foreground)]",
            )}
          >
            {f.label} <span className="tabular-nums opacity-80">{count(f)}</span>
          </Link>
        ))}
      </div>

      <Card>
        <div data-funktion="page--angebotsliste-mit-versand-oeffnung-gueltigkeit deal-offers-card-pay--zahlungsstatus-des-angebots-offen-bestaetigt">
          {shown.length === 0 ? (
            <EmptyState icon={FileText} title="Keine Angebote in dieser Ansicht." text="Angebote entstehen in der Kontaktakte, direkt im Gespräch." />
          ) : (
            <>
              {/* Handy: Liste */}
              <ul className="divide-y divide-[color:var(--border)] md:hidden">
                {shown.map((o) => (
                  <li key={o.id} className="flex items-center pr-2">
                    <Link href={ziel(o)} className="flex min-w-0 flex-1 items-center gap-2 py-3 pl-4">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{o.company || o.contactName}</span>
                        <span className="block text-xs text-[color:var(--muted)]">
                          {o.number}
                          {o.version > 1 ? ` V${o.version}` : ""} · {eur(Number(o.monthlyFee))}/Monat · gültig bis {datum(o.validUntil)}
                        </span>
                        {o.bonus && o.bonus.stand === "laeuft" ? <BonusHinweis b={o.bonus} /> : null}
                        <span className="mt-1 block">{stand(o)}</span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--border-strong)]" />
                    </Link>
                    <span className="w-10 shrink-0">{mehr(o)}</span>
                  </li>
                ))}
              </ul>
              {/* Rechner: Tabelle */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm" data-angebote>
                  <thead className="bg-[color:var(--surface-sunken)] text-left text-xs text-[color:var(--muted)]">
                    <tr>
                      <th className="px-4 py-2 font-medium">Angebot</th>
                      <th className="px-4 py-2 font-medium">Kunde</th>
                      <th className="px-4 py-2 text-right font-medium">Monatlich</th>
                      <th className="px-4 py-2 text-right font-medium">Setup</th>
                      <th className="px-4 py-2 font-medium">Verschickt</th>
                      <th className="px-4 py-2 font-medium">Geöffnet</th>
                      <th className="px-4 py-2 font-medium">Gültig bis</th>
                      <th className="px-4 py-2 font-medium">Stand</th>
                      <th className="w-10 px-2 py-2">
                        <span className="sr-only">Mehr</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[color:var(--border)]">
                    {shown.map((o) => (
                      <tr key={o.id} className="hover:bg-[color:var(--surface-sunken)]">
                        <td className="px-4 py-2.5">
                          <Link href={ziel(o)} className="font-medium text-[color:var(--brand)] hover:underline">
                            {o.number}
                          </Link>
                          {o.version > 1 ? <span className="ml-1 text-xs text-[color:var(--muted)]">V{o.version}</span> : null}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="font-medium">{o.company || o.contactName}</div>
                          {o.company ? <div className="text-xs text-[color:var(--muted)]">{o.contactName}</div> : null}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{eur(Number(o.monthlyFee))}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{eur(Number(o.setupFee))}</td>
                        <td className="px-4 py-2.5 tabular-nums">{datum(o.sentAt)}</td>
                        <td className="px-4 py-2.5 tabular-nums">{datum(o.viewedAt)}</td>
                        <td className={cn("px-4 py-2.5 tabular-nums", o.z === "abgelaufen" && "text-amber-700")}>
                          {datum(o.validUntil)}
                          {o.bonus ? <BonusHinweis b={o.bonus} /> : null}
                        </td>
                        <td className="px-4 py-2.5">{stand(o)}</td>
                        <td className="px-2 py-2.5 text-right">{mehr(o)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </Card>
    </Seite>
  );
}
