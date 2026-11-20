import Link from "next/link";
import { ChevronRight, FileText } from "lucide-react";
import { Badge, ButtonLink, Card, EmptyState } from "@/components/ui";
import { Kennzahlen, type Kennzahl } from "@/components/admin-neu/ui/kennzahlen";
import { Chips } from "@/components/admin-neu/vertrieb/chips";
import { VerkaufenMehr } from "@/components/admin-neu/vertrieb/verkaufen-mehr";
import { offeneRechtsFaelle } from "@/lib/vertrieb/datenschutz-recht-server";
import { Seite } from "@/components/admin-neu/ui/seite";
import { KONTAKTE, kontaktPfad } from "@/components/admin-neu/vertrieb/listen";
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
type Zeile = Awaited<ReturnType<typeof ladeAngebote>>["rows"][number];

/** Eine Chip-Reihe (Umbau 19.11.2026): Offen als Standard, Entwürfe und Abgelaufene stehen unter „Alle“. */
const CHIPS: { key: string; label: string; match: (r: Zeile) => boolean }[] = [
  { key: "offen", label: "Offen", match: (r) => r.z === "offen" || r.z === "geoeffnet" },
  { key: "zahlung", label: "Zahlung offen", match: (r) => r.zahlungOffen },
  { key: "angenommen", label: "Angenommen", match: (r) => r.z === "angenommen" },
  { key: "alle", label: "Alle", match: () => true },
];
const chipHref = (key: string) => (key === "offen" ? BASIS : `${BASIS}?f=${key}`);

// Verkaufen → Angebote: je Angebot die aktuelle Version mit Stand (Daten aus lib/vertrieb/angebote-uebersicht.ts, wie
// /admin/vertrieb/angebote). Zeile öffnet die Kontaktakte bei der Angebotskarte.
// Umbau 19.11.2026 (SUS-Ziel 90): drei Kennzahlen statt vier, eine Chip-Reihe mit „Offen“ als Standard statt sechs Chips
// in drei Zeilen; ältere Filter (?f=abgelaufen, ?f=entwurf) bleiben als Link nutzbar und erscheinen dann als eigener Chip.
export default async function AngebotePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAuth();
  const sp = await searchParams;
  const [{ rows, kennzahlen, ablehnGruende }, offenRecht] = await Promise.all([ladeAngebote(undefined), offeneRechtsFaelle()]);
  const alt = ANGEBOT_FILTER.find((f) => f.key === sp.f && !CHIPS.some((c) => c.key === f.key));
  const chip = CHIPS.find((c) => c.key === sp.f) ?? CHIPS[0];
  const match = alt ? alt.match : chip.match;
  const shown = rows.filter(match);
  const { sent, angenommen, offen, geoeffnet } = kennzahlen;
  const kz: Kennzahl[] = [
    { label: "Offen (monatlich)", wert: eur(offen.reduce((s, r) => s + Number(r.monthlyFee), 0)), hinweis: `${offen.length} offene Angebote`, href: BASIS },
    {
      label: "Angenommen",
      wert: String(angenommen.length),
      hinweis: sent.length ? `${Math.round((angenommen.length / sent.length) * 100)} % von ${sent.length} verschickten` : undefined,
      href: chipHref("angenommen"),
    },
    ...(sent.length ? [{ label: "Geöffnet", wert: `${Math.round((geoeffnet.length / sent.length) * 100)} %`, hinweis: `${geoeffnet.length} von ${sent.length}` }] : []),
  ];
  const ziel = (o: Zeile) => (o.salesContactId ? `${kontaktPfad(o.salesContactId)}#angebot` : offerAdminHref(o));
  const stand = (o: Zeile) => (
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
  const mehr = (o: Zeile) => (
    <AngebotMehr variant="icon" offer={{ id: o.id, number: o.number, kannAblehnen: o.kannAblehnen, kannWiederOeffnen: o.kannWiederOeffnen, kontakt: !!o.salesContactId }} />
  );

  return (
    <Seite titel="Verkaufen" reiter="verkaufen" aktionen={<VerkaufenMehr datenschutzOffen={offenRecht} />}>
      <Kennzahlen werte={kz} />

      <Chips
        label="Filter"
        aktiv={alt ? alt.key : chip.key}
        funktion="page-filter--filter-alle-verschickten-offen-angenommen page-filter-zahlung--filter-zahlung-offen"
        chips={[
          ...CHIPS.map((c) => ({ key: c.key, label: c.label, href: chipHref(c.key), anzahl: rows.filter(c.match).length })),
          ...(alt ? [{ key: alt.key, label: `${alt.label} ✕`, href: BASIS }] : []),
        ]}
      />

      {chip.key === "alle" && !alt && ablehnGruende.length ? (
        <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm" data-ablehngruende>
          <span className="font-medium">Abgelehnt:</span>
          {ablehnGruende.map((g) => (
            <span key={g.grund}>
              {g.label} <span className="tabular-nums text-[color:var(--muted)]">× {g.anzahl}</span>
            </span>
          ))}
        </div>
      ) : null}

      <Card>
        <div data-funktion="page--angebotsliste-mit-versand-oeffnung-gueltigkeit deal-offers-card-pay--zahlungsstatus-des-angebots-offen-bestaetigt">
          {shown.length === 0 ? (
            <EmptyState
              icon={FileText}
              title={chip.key === "offen" && !alt ? "Kein Angebot offen." : "Keine Angebote in dieser Ansicht."}
              text="Angebote entstehen in der Kontaktakte, direkt im Gespräch."
              action={
                <ButtonLink href={`${KONTAKTE}?stage=INTERESSE`} size="md">
                  Kontakte mit Interesse
                </ButtonLink>
              }
            />
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
