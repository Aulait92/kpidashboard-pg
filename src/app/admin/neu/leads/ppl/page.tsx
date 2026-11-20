import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ChevronLeft, ChevronRight, FileText, Inbox, MessageSquare, PackageOpen, Plus } from "lucide-react";
import { Badge, ButtonLink, Card, CardHeader, EmptyState } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { Seite } from "@/components/admin-neu/ui/seite";
import { Ansichten, Meldung } from "@/components/admin-neu/leads/ansichten";
import { ladeProduktNamen, type ProduktName } from "@/components/admin-neu/leads/produkt-namen";
import { Aufmerksamkeit } from "@/components/admin-neu/ui/aufmerksamkeit";
import { Kennzahlen } from "@/components/admin-neu/ui/kennzahlen";
import { punkteDerRolle } from "@/lib/admin-neu/rollen-server";
import { requireAuth } from "@/lib/vertrieb/auth";
import { PplOverview, PplReportView } from "@/components/admin/ppl-auswertung";
import { prisma } from "@/lib/prisma";
import { quotaFor } from "@/lib/ppl/engine";
import { parkDeadline } from "@/lib/ppl/parken";
import { loadCustomerOverview, loadPplReport, type Granularity } from "@/lib/ppl/auswertung";
import { nowMs } from "@/lib/now";
import { assignParkedAction, decideStornoAction, discardParkedAction } from "@/app/admin/ppl/actions";
import { SlackTest } from "@/app/admin/ppl/slack-test";
import { HvkAbrechnungen, HvkReklamationenReview } from "@/app/admin/ppl/hvk-abrechnungen";
import { PplVersandPostfach } from "@/app/admin/ppl/ppl-versand";
import { HvkReabgleich } from "@/app/admin/ppl/hvk-client";
import { slackWebhookUrl } from "@/lib/ppl/slack";
import { KEINE_ANGABE } from "@/lib/platzhalter";

export const metadata = { title: "Pay-per-Lead | performancegrowth Admin" };

// Liefern → Pay-per-Lead (UX-Umbau 20.11.2026, Ziel SUS 90+). Zwei Ansichten statt vier:
//   Bezüge (Start): zu Erledigendes (Storno prüfen, Geparkt, Reklamationen ohne Lead), Kennzahlen, Bezüge je Produkt
//   Auswertung: Übersicht je Kunde, Auswertung mit Zeitraum/Produkt, darunter „Mehr“ mit Eingang, Abrechnungen
//   Heinrich von Kleist und dem Slack-Test. Eingang (?ansicht=eingang) und Abrechnungen (?ansicht=hvk) sind
//   Unteransichten der Auswertung (Push-Ziele bleiben gültig).
// Gelieferte Leads (Suche, Storno von Hand) → Leads › „Pay-per-Lead“; Tagesbudgets der Pools → Werbekonten.
// Airtable ist aus der Oberfläche genommen (Kennzeichen, „Aus Airtable übernehmen“, „Lead aus Airtable nachholen“):
// der Abgleich im Hintergrund (lib/sync.ts) läuft weiter, bis AIRTABLE_SYNC_OFF gesetzt ist. Alte Adressen
// (?ansicht=geliefert|storno|geparkt|uebersicht|import) werden verstanden.

const PFAD = "/admin/neu/leads/ppl";
const SCHRITT = 25;
const eur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
const dt = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d);
const POOL_STATUS: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  delivered: { label: "ausgeliefert", tone: "success" },
  parked: { label: "geparkt", tone: "warning" },
  duplicate: { label: "Dublette", tone: "neutral" },
  invalid: { label: "ungültig", tone: "danger" },
  expired: { label: "verworfen (> 48 h geparkt)", tone: "neutral" },
};

type Suche = { ansicht?: string; zeitraum?: string; produkt?: string; q?: string; bezug?: string; gespeichert?: string; postfach?: string; versand?: string; anzahl?: string };

export default async function Page({ searchParams }: { searchParams: Promise<Suche> }) {
  const sp = await searchParams;
  // Alte Ansichten: Gelieferte Leads liegen jetzt in Leads, der Airtable-Import ist entfallen
  if (sp.ansicht === "geliefert") {
    const qs = new URLSearchParams({ art: "ppl", ...(sp.q ? { q: sp.q } : {}), ...(sp.bezug ? { bezug: sp.bezug } : {}) });
    redirect(`/admin/neu/leads/alle?${qs.toString()}`);
  }
  if (sp.ansicht === "import") redirect(PFAD);
  const ansicht = sp.ansicht === "uebersicht" ? "auswertung" : ["auswertung", "eingang", "hvk"].includes(sp.ansicht ?? "") ? sp.ansicht! : "";

  return (
    <Seite
      titel="Liefern"
      reiter="liefern"
      breit
      aktionen={
        <span data-funktion="actions-savesubscriptionaction--bezug-anlegen-bearbeiten-kunde-produkt-menge">
          <ButtonLink href={`${PFAD}/bezug/neu`} variant="primary" size="md" icon={Plus}>
            Bezug
          </ButtonLink>
        </span>
      }
    >
      <div data-funktion="orders--push-an-admins-mit-sprungziel-pay-per-lead">
        <Ansichten
          aktiv={ansicht ? "auswertung" : ""}
          items={[
            { key: "", label: "Bezüge", href: PFAD },
            { key: "auswertung", label: "Auswertung", href: `${PFAD}?ansicht=auswertung` },
          ]}
        />
        {sp.gespeichert ? <Meldung ok="Bezug gespeichert." /> : null}
        {ansicht === "auswertung" ? (
          <Auswertung sp={sp} />
        ) : ansicht === "eingang" ? (
          <Unter titel="Eingang">
            <Eingang anzahl={Math.max(SCHRITT, Number(sp.anzahl) || SCHRITT)} />
          </Unter>
        ) : ansicht === "hvk" ? (
          <Unter titel="Abrechnungen Heinrich von Kleist">
            <div data-funktion="hvk-abrechnungen-hvkabrechnungen--hvk-abrechnungen-gutschrift-pdf-je-woche">
              <HvkAbrechnungen
                postfach={sp.postfach}
                versand={
                  <div data-funktion="ppl-versand-pplversandpostfach--versand-postfach-fuer-pivacom-verbinden">
                    <PplVersandPostfach meldung={sp.versand} />
                  </div>
                }
                abgleich={
                  <div data-funktion="hvk-client-hvkreabgleich--hvk-abrechnungen-neu-abgleichen-vorschau-je">
                    <HvkReabgleich />
                  </div>
                }
              />
            </div>
          </Unter>
        ) : (
          <Start />
        )}
      </div>
    </Seite>
  );
}

/** Unteransicht der Auswertung: Rückweg in einer Zeile, dann der Inhalt. */
function Unter({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <Link href={`${PFAD}?ansicht=auswertung`} className="-ml-1 inline-flex min-h-10 items-center gap-1 text-sm text-[color:var(--muted)] hover:text-[color:var(--foreground)]">
        <ChevronLeft className="h-4 w-4" />
        Auswertung
      </Link>
      <h2 className="sr-only">{titel}</h2>
      {children}
    </div>
  );
}

type Subs = Awaited<ReturnType<typeof prisma.leadSubscription.findMany<{ include: { customer: { select: { name: true } } } }>>>;

async function Start() {
  const session = await requireAuth();
  const seit = new Date(nowMs() - 7 * 86_400_000);
  const [punkte, eingangJeStatus, subs, parked, review, hvkOffen] = await Promise.all([
    punkteDerRolle(session.userId, "liefern"),
    prisma.poolLead.groupBy({ by: ["status"], where: { createdAt: { gte: seit } }, _count: { _all: true } }),
    prisma.leadSubscription.findMany({ include: { customer: { select: { name: true } } }, orderBy: [{ productKey: "asc" }, { active: "desc" }, { createdAt: "asc" }] }),
    prisma.poolLead.findMany({ where: { status: "parked" }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.lead.findMany({
      where: { stornoState: "review" },
      orderBy: { stornoRequestedAt: "asc" },
      select: { id: true, name: true, source: true, deliveredAt: true, stornoReason: true, stornoNote: true, customer: { select: { name: true } }, revenues: { select: { amount: true }, take: 1 } },
    }),
    // Reklamationen aus der Abrechnung von Heinrich von Kleist ohne eindeutigen Lead
    prisma.hvkReklamation.count({ where: { status: "offen" } }),
  ]);
  const name = await ladeProduktNamen([...subs.map((s) => s.productKey), ...parked.map((p) => p.productKey)]);
  const eingang7 = eingangJeStatus.reduce((a, g) => a + g._count._all, 0);
  const geliefert7 = eingangJeStatus.find((g) => g.status === "delivered")?._count._all ?? 0;
  // Geparkt und Storno stehen als Karten mit Knöpfen darunter (keine doppelten Kacheln), oben nur, was diese Seite nicht zeigt
  const oben = punkte?.filter((p) => p.key !== "parked" && !p.key.startsWith("storno")) ?? [];
  return (
    <div className="space-y-4">
      {oben.length ? <Aufmerksamkeit punkte={oben} /> : null}
      <Kennzahlen
        werte={[
          {
            label: "Eingang 7 Tage",
            wert: String(eingang7),
            details: {
              text: "Pay-per-Lead-Leads der letzten 7 Tage nach Ergebnis.",
              zeilen: [...eingangJeStatus]
                .sort((a, b) => b._count._all - a._count._all)
                .map((g) => ({ label: POOL_STATUS[g.status]?.label ?? g.status, wert: String(g._count._all) })),
              link: { href: `${PFAD}?ansicht=eingang`, label: "Eingang ansehen" },
            },
          },
          { label: "Ausgeliefert 7 Tage", wert: String(geliefert7), hinweis: eingang7 ? `${Math.round((geliefert7 / eingang7) * 100)} % vom Eingang` : undefined },
        ]}
      />
      {hvkOffen ? (
        <div data-funktion="hvk-abrechnungen-hvkreklamationenreview--hvk-reklamationen-ohne-eindeutigen-lead-zuordnen">
          <HvkReklamationenReview />
        </div>
      ) : null}
      {review.length || parked.length ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {review.length ? <StornoPruefen leads={review} /> : null}
          {parked.length ? <Geparkt parked={parked} subs={subs} name={name} /> : null}
        </div>
      ) : null}
      <Bezuege subs={subs} name={name} />
    </div>
  );
}

async function Bezuege({ subs, name }: { subs: Subs; name: ProduktName }) {
  const rows = await Promise.all(subs.map(async (s) => ({ s, q: s.active ? await quotaFor(s) : null })));
  const products = [...new Set(subs.map((s) => s.productKey))];
  if (!subs.length) {
    return (
      <Card>
        <EmptyState
          icon={PackageOpen}
          title="Noch keine Bezüge."
          text="Ein Bezug ist das Lead-Abo eines Käufers: Produkt, Menge und Preis je Lead."
          action={
            <ButtonLink href={`${PFAD}/bezug/neu`} variant="primary" icon={Plus}>
              Ersten Bezug anlegen
            </ButtonLink>
          }
        />
      </Card>
    );
  }
  return (
    <Card>
      <div data-funktion="page-bezuege--bezuege-je-produkt-mit-kontingent-geliefert">
        <CardHeader title="Bezüge" count={subs.filter((s) => s.active).length} />
        {products.map((p) => (
          <div key={p}>
            <div className="bg-[color:var(--surface-sunken)] px-4 py-1.5 text-xs font-semibold text-[color:var(--muted)] sm:px-5">{name(p)}</div>
            <ul className="divide-y divide-[color:var(--border)]">
              {rows
                .filter((r) => r.s.productKey === p)
                .map(({ s, q }) => {
                  // Zeile 2 höchstens zwei Angaben: Preis und Menge. Filter und Lieferweg stehen im Bezug.
                  const menge =
                    s.period === "week"
                      ? q
                        ? `${q.quota} diese Woche`
                        : "diese Woche nichts bestellt"
                      : `${s.goal ?? s.testQuantity ?? KEINE_ANGABE} ${s.period === "month" ? "je Monat" : "einmalig"}`;
                  const status = !s.active ? <Badge>pausiert</Badge> : s.status === "test" ? <Badge tone="warning">Test</Badge> : null;
                  return (
                    <li key={s.id}>
                      <Link href={`${PFAD}/bezug/${s.id}`} className={`flex min-h-14 items-center gap-3 px-4 py-3 text-sm hover:bg-[color:var(--surface-sunken)] sm:px-5 ${s.active ? "" : "opacity-60"}`}>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{s.customer.name}</span>
                            {status}
                          </div>
                          <div className="mt-0.5 truncate text-xs text-[color:var(--muted)]">
                            {eur(Number(s.price))} je Lead · {menge}
                          </div>
                        </div>
                        {q ? (
                          <span className="shrink-0 text-right text-sm tabular-nums">
                            {q.delivered} / {q.quota}
                            <span className="block text-xs text-[color:var(--muted)]">geliefert</span>
                          </span>
                        ) : null}
                        <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--muted)]" />
                      </Link>
                    </li>
                  );
                })}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  );
}

function StornoPruefen({
  leads,
}: {
  leads: { id: string; name: string | null; source: string | null; deliveredAt: Date | null; stornoReason: string | null; stornoNote: string | null; customer: { name: string }; revenues: { amount: unknown }[] }[];
}) {
  return (
    <Card tone="attention" id="storno">
      <div data-funktion="actions-decidestornoaction--storno-pruefen-annehmen-oder-ablehnen">
        <CardHeader title="Storno prüfen" icon={AlertTriangle} count={leads.length} />
        <ul className="divide-y divide-[color:var(--border)]">
          {leads.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 text-sm sm:px-5">
              <div className="min-w-0 flex-1 basis-56">
                <div className="font-medium">
                  {l.name ?? "Lead"} · {l.stornoReason}
                </div>
                <div className="text-xs text-[color:var(--muted)]">
                  {l.customer.name} · geliefert {l.deliveredAt ? dt(l.deliveredAt) : KEINE_ANGABE} · {eur(Number(l.revenues[0]?.amount ?? 0))}
                  {l.stornoNote ? <span className="block">„{l.stornoNote}“</span> : null}
                </div>
              </div>
              <div className="flex gap-2">
                {(["approve", "half", "reject"] as const).map((d) => (
                  <form key={d} action={decideStornoAction}>
                    <input type="hidden" name="leadId" value={l.id} />
                    <input type="hidden" name="decision" value={d} />
                    <SubmitButton
                      pendingLabel="…"
                      className={`h-10 rounded-[var(--radius-sm)] px-3 text-[13px] font-semibold sm:h-8 sm:text-xs ${d === "approve" ? "bg-[color:var(--brand)] text-white" : "border border-[color:var(--border)] bg-white"}`}
                    >
                      {d === "approve" ? "Gutschreiben" : d === "half" ? "Halb gutschreiben" : "Ablehnen"}
                    </SubmitButton>
                  </form>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

function Geparkt({ parked, subs, name }: { parked: Awaited<ReturnType<typeof prisma.poolLead.findMany>>; subs: Subs; name: ProduktName }) {
  return (
    <Card tone="attention" id="geparkt">
      <CardHeader title="Geparkt" count={parked.length} hint="kein passender Bezug frei" />
      <ul className="divide-y divide-[color:var(--border)]">
        {parked.map((p) => {
          const options = subs.filter((s) => s.active && s.productKey === p.productKey);
          return (
            <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 text-sm sm:px-5">
              <div className="min-w-0 flex-1 basis-48">
                <div className="font-medium">
                  {name(p.productKey)} <span className="font-normal text-[color:var(--muted)]">· {dt(p.createdAt)}</span>
                </div>
                <div className="text-xs text-[color:var(--muted)]">
                  {[p.plz ? `PLZ ${p.plz}` : null, p.insurer].filter(Boolean).join(" · ")}
                  {p.reason ? <span className="text-amber-700"> · {p.reason}</span> : null}
                  <span className="text-[color:var(--muted)]"> · verfällt {dt(parkDeadline(p.createdAt))}</span>
                </div>
              </div>
              {options.length ? (
                <form action={assignParkedAction} className="flex min-w-0 items-center gap-2" data-funktion="actions-assignparkedaction--geparkte-leads-einem-bezug-zuordnen">
                  <input type="hidden" name="poolLeadId" value={p.id} />
                  <select name="subscriptionId" required aria-label="Bezug" className="h-10 min-w-0 max-w-[11rem] rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-2 text-sm sm:h-8">
                    {options.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.customer.name}
                      </option>
                    ))}
                  </select>
                  <SubmitButton pendingLabel="…" className="h-10 rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-3 text-[13px] font-semibold text-white sm:h-8 sm:text-xs">
                    Ausliefern
                  </SubmitButton>
                </form>
              ) : (
                <ButtonLink href={`${PFAD}/bezug/neu`} size="sm" icon={Plus}>
                  Bezug anlegen
                </ButtonLink>
              )}
              <form action={discardParkedAction} data-funktion="actions-discardparkedaction--geparkten-lead-verwerfen">
                <input type="hidden" name="poolLeadId" value={p.id} />
                <SubmitButton pendingLabel="…" className="h-10 px-1 text-xs font-medium text-[color:var(--muted)] hover:text-rose-700 sm:h-8">
                  Verwerfen
                </SubmitButton>
              </form>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

async function Auswertung({ sp }: { sp: Suche }) {
  const [overview, report] = await Promise.all([
    loadCustomerOverview(),
    loadPplReport((["tag", "woche", "monat"].includes(sp.zeitraum ?? "") ? sp.zeitraum : "tag") as Granularity, sp.produkt ?? null),
  ]);
  const zeile = "flex min-h-14 items-center gap-3 px-4 py-3 text-sm sm:px-5";
  return (
    <div className="space-y-4">
      {/* Selteneres als kurze Liste oben (Muster wie /buyer/konto), damit es am Handy nicht unter den Tabellen verschwindet */}
      <Card>
        <ul className="divide-y divide-[color:var(--border)]">
          <li>
            <Link href={`${PFAD}?ansicht=eingang`} className={`${zeile} hover:bg-[color:var(--surface-sunken)]`} data-funktion="page-eingang--eingang-aller-ppl-leads-ausgeliefert-geparkt">
              <Inbox className="h-4 w-4 shrink-0 text-[color:var(--muted)]" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">Eingang</span>
                <span className="block text-xs text-[color:var(--muted)]">Alle Pay-per-Lead-Leads mit Ergebnis</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--muted)]" />
            </Link>
          </li>
          <li>
            <Link href={`${PFAD}?ansicht=hvk`} className={`${zeile} hover:bg-[color:var(--surface-sunken)]`}>
              <FileText className="h-4 w-4 shrink-0 text-[color:var(--muted)]" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">Abrechnungen Heinrich von Kleist</span>
                <span className="block text-xs text-[color:var(--muted)]">Gutschriften und Reklamationen je Woche</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--muted)]" />
            </Link>
          </li>
          <li className={`${zeile} flex-wrap`} data-funktion="slack-test-slacktest--slack-testen-testnachricht-an-den-ppl-kanal">
            <MessageSquare className="h-4 w-4 shrink-0 text-[color:var(--muted)]" />
            <span className="min-w-0 flex-1">
              <span className="block font-medium">Slack-Kanal</span>
              <span className="block text-xs text-[color:var(--muted)]">Meldet gelieferte Leads</span>
            </span>
            <div className="basis-full pl-7 sm:basis-auto sm:pl-0">
              <SlackTest configured={!!slackWebhookUrl()} />
            </div>
          </li>
        </ul>
      </Card>
      <div data-funktion="ppl-auswertung--uebersicht-je-kunde-woche-monat-liegt-zurueck">
        <PplOverview rows={overview} />
      </div>
      <div data-funktion="ppl-auswertung--auswertung-mit-zeitraum-und-produktfilter">
        <PplReportView report={report} />
      </div>
    </div>
  );
}

async function Eingang({ anzahl }: { anzahl: number }) {
  const [rows, gesamt] = await Promise.all([prisma.poolLead.findMany({ orderBy: { createdAt: "desc" }, take: anzahl }), prisma.poolLead.count()]);
  const leadIds = rows.map((r) => r.leadId).filter((x): x is string => !!x);
  const [owners, name] = await Promise.all([
    prisma.lead.findMany({ where: { id: { in: leadIds } }, select: { id: true, customer: { select: { name: true } } } }).then((ls) => new Map(ls.map((l) => [l.id, l.customer.name]))),
    ladeProduktNamen(rows.map((r) => r.productKey)),
  ]);
  return (
    <Card>
      <CardHeader title="Eingang" count={gesamt} />
      {rows.length ? (
        <>
          <ul className="divide-y divide-[color:var(--border)]">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm sm:px-5">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {name(r.productKey)} <span className="font-normal text-[color:var(--muted)]">· {dt(r.createdAt)}</span>
                  </div>
                  <div className="truncate text-xs text-[color:var(--muted)]">{[r.plz ? `PLZ ${r.plz}` : null, r.leadId ? owners.get(r.leadId) : r.reason].filter(Boolean).join(" · ")}</div>
                </div>
                <Badge tone={POOL_STATUS[r.status]?.tone ?? "neutral"}>{POOL_STATUS[r.status]?.label ?? r.status}</Badge>
              </li>
            ))}
          </ul>
          {gesamt > rows.length ? (
            <div className="border-t border-[color:var(--border)] p-3 text-center">
              <Link href={`${PFAD}?ansicht=eingang&anzahl=${anzahl + SCHRITT}`} scroll={false} className="inline-flex min-h-10 items-center text-sm font-medium text-[color:var(--brand)] hover:underline">
                Mehr laden
              </Link>
            </div>
          ) : null}
        </>
      ) : (
        <EmptyState
          icon={PackageOpen}
          title="Noch keine Pay-per-Lead-Leads eingegangen."
          text="Neue Leads erscheinen hier, sobald ein Formular einem Pool zugeordnet ist."
          action={
            <ButtonLink href="/admin/neu/leads" variant="secondary">
              Formulare ansehen
            </ButtonLink>
          }
        />
      )}
    </Card>
  );
}
