import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ChevronRight, CloudDownload, PackageOpen, Plus } from "lucide-react";
import { Badge, ButtonLink, Card, CardHeader, EmptyState } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { Seite } from "@/components/admin-neu/ui/seite";
import { Ansichten, Kennzahlen, Meldung } from "@/components/admin-neu/leads/ansichten";
import { PplOverview, PplReportView } from "@/components/admin/ppl-auswertung";
import { prisma } from "@/lib/prisma";
import { quotaFor } from "@/lib/ppl/engine";
import { fmtWeek, weekRange } from "@/lib/ppl/periods";
import { loadCustomerOverview, loadPplReport, type Granularity } from "@/lib/ppl/auswertung";
import { airtableSyncOff } from "@/lib/airtable-switch";
import { nowMs } from "@/lib/now";
import { assignParkedAction, decideStornoAction, discardParkedAction } from "@/app/admin/ppl/actions";
import { ImportButton } from "@/app/admin/ppl/import/import-button";
import { SlackTest } from "@/app/admin/ppl/slack-test";
import { HvkAbrechnungen, HvkReklamationenReview } from "@/app/admin/ppl/hvk-abrechnungen";
import { PplVersandPostfach } from "@/app/admin/ppl/ppl-versand";
import { HvkReabgleich } from "@/app/admin/ppl/hvk-client";
import { AirtableNachholen } from "@/app/admin/ppl/nachholen";
import { slackWebhookUrl } from "@/lib/ppl/slack";

export const metadata = { title: "Pay-per-Lead | performancegrowth Admin" };

// Leads & Kampagnen → Pay-per-Lead. Früher 8 Ansichten unter /admin/ppl, jetzt 3:
//   Bezüge (Start): Kennzahlen, zu Erledigendes (Storno prüfen, Geparkt) und die Bezüge je Produkt
//   Auswertung: Übersicht je Kunde und Auswertung mit Zeitraum/Produkt untereinander
//   Eingang: alle Pool-Leads mit Ergebnis
//   HvK-Abrechnungen: Gutschriften je Woche (gleicher Baustein wie /admin/ppl?ansicht=hvk); offene
//   HvK-Reklamationen stehen auf dem Start bei „Storno prüfen“; darin oben die Zeile „Versand an Pivacom“
//   (Microsoft-365-Versand-Postfach, ppl-versand.tsx)
// Gelieferte Leads (Suche, Storno von Hand) → Alle Leads › „Pay-per-Lead geliefert“; Media Buyer → Werbekonten.
// Alte Adressen (?ansicht=storno|geparkt|uebersicht|geliefert, Push-Ziele) werden verstanden.
// „Aus Airtable übernehmen“ ist selten: Ansicht ?ansicht=import ohne eigenen Schalter.
// „Lead aus Airtable nachholen“ (alter Admin: unter Geparkt) steht oben im Eingang: Dort landet der Lead mit Ergebnis,
// und der Eingang ist immer erreichbar (die Karte Geparkt nur, wenn etwas geparkt ist).

const PFAD = "/admin/neu/leads/ppl";
const eur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
const dt = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d);
const DELIVERY: Record<string, string> = { app: "Kundenbereich", app_pdf: "Kundenbereich + PDF per Mail", email: "E-Mail", webhook: "Webhook" };
const POOL_STATUS: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  delivered: { label: "ausgeliefert", tone: "success" },
  parked: { label: "geparkt", tone: "warning" },
  duplicate: { label: "Dublette", tone: "neutral" },
  invalid: { label: "ungültig", tone: "danger" },
};

type Suche = { ansicht?: string; zeitraum?: string; produkt?: string; q?: string; bezug?: string; gespeichert?: string; postfach?: string; versand?: string };

export default async function Page({ searchParams }: { searchParams: Promise<Suche> }) {
  const sp = await searchParams;
  // Alte Ansichten: Gelieferte Leads liegen jetzt in Alle Leads
  if (sp.ansicht === "geliefert") {
    const qs = new URLSearchParams({ art: "ppl", ...(sp.q ? { q: sp.q } : {}), ...(sp.bezug ? { bezug: sp.bezug } : {}) });
    redirect(`/admin/neu/leads/alle?${qs.toString()}`);
  }
  const ansicht = sp.ansicht === "uebersicht" ? "auswertung" : ["auswertung", "eingang", "hvk", "import"].includes(sp.ansicht ?? "") ? sp.ansicht! : "";
  const syncAus = airtableSyncOff();

  return (
    <Seite
      titel="Leads & Kampagnen"
      reiter="leads"
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
          aktiv={ansicht === "import" ? "" : ansicht}
          items={[
            { key: "", label: "Bezüge", href: PFAD },
            { key: "auswertung", label: "Auswertung", href: `${PFAD}?ansicht=auswertung` },
            { key: "eingang", label: "Eingang", href: `${PFAD}?ansicht=eingang`, funktion: "page-eingang--eingang-aller-ppl-leads-ausgeliefert-geparkt" },
            { key: "hvk", label: "HvK-Abrechnungen", href: `${PFAD}?ansicht=hvk`, funktion: "hvk-abrechnungen-hvkabrechnungen--hvk-abrechnungen-gutschrift-pdf-je-woche" },
          ]}
        />
        {sp.gespeichert ? <Meldung ok="Bezug gespeichert." /> : null}
        {ansicht === "auswertung" ? (
          <div className="space-y-4">
            <div data-funktion="ppl-auswertung--uebersicht-je-kunde-woche-monat-liegt-zurueck">
              <PplOverview rows={await loadCustomerOverview()} />
            </div>
            <div data-funktion="ppl-auswertung--auswertung-mit-zeitraum-und-produktfilter">
              <PplReportView report={await loadPplReport((["tag", "woche", "monat"].includes(sp.zeitraum ?? "") ? sp.zeitraum : "tag") as Granularity, sp.produkt ?? null)} />
            </div>
          </div>
        ) : ansicht === "eingang" ? (
          <Eingang />
        ) : ansicht === "hvk" ? (
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
        ) : ansicht === "import" ? (
          <Import />
        ) : (
          <Start syncAus={syncAus} />
        )}
      </div>
    </Seite>
  );
}

type Subs = Awaited<ReturnType<typeof prisma.leadSubscription.findMany<{ include: { customer: { select: { name: true } } } }>>>;

async function Start({ syncAus }: { syncAus: boolean }) {
  const seit = new Date(nowMs() - 7 * 86_400_000);
  const [subs, parked, review, eingang7, geliefert7, hvkOffen] = await Promise.all([
    prisma.leadSubscription.findMany({ include: { customer: { select: { name: true } } }, orderBy: [{ productKey: "asc" }, { active: "desc" }, { createdAt: "asc" }] }),
    prisma.poolLead.findMany({ where: { status: "parked" }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.lead.findMany({
      where: { stornoState: "review" },
      orderBy: { stornoRequestedAt: "asc" },
      select: { id: true, name: true, source: true, deliveredAt: true, stornoReason: true, stornoNote: true, customer: { select: { name: true } }, revenues: { select: { amount: true }, take: 1 } },
    }),
    prisma.poolLead.count({ where: { createdAt: { gte: seit } } }),
    prisma.poolLead.count({ where: { createdAt: { gte: seit }, status: "delivered" } }),
    // Reklamationen aus der HvK-Abrechnung ohne eindeutigen Lead (wie /admin/ppl → Storno prüfen)
    prisma.hvkReklamation.count({ where: { status: "offen" } }),
  ]);
  return (
    <div className="space-y-4">
      <Kennzahlen
        items={[
          { label: "Eingang 7 Tage", wert: eingang7, href: `${PFAD}?ansicht=eingang` },
          { label: "Ausgeliefert 7 Tage", wert: geliefert7 },
          { label: "Geparkt", wert: parked.length, warn: parked.length > 0, href: "#geparkt" },
          { label: "Storno in Prüfung", wert: review.length + hvkOffen, warn: review.length + hvkOffen > 0, href: "#storno" },
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
          {parked.length ? <Geparkt parked={parked} subs={subs} /> : null}
        </div>
      ) : null}
      <Bezuege subs={subs} syncAus={syncAus} />
    </div>
  );
}

async function Bezuege({ subs, syncAus }: { subs: Subs; syncAus: boolean }) {
  const { start } = weekRange();
  const rows = await Promise.all(subs.map(async (s) => ({ s, q: s.active ? await quotaFor(s) : null })));
  const products = [...new Set(subs.map((s) => s.productKey))];
  const fuss = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[color:var(--border)] px-4 py-2.5 text-xs text-[color:var(--muted)] sm:px-5">
      <span data-funktion="page-airtable-sync-off--anzeige-airtable-abgleich-an-aus">
        {syncAus ? <Badge tone="warning">Airtable-Abgleich aus</Badge> : <Badge>Airtable-Abgleich an</Badge>}
      </span>
      <span data-funktion="slack-test-slacktest--slack-testen-testnachricht-an-den-ppl-kanal">
        <SlackTest configured={!!slackWebhookUrl()} />
      </span>
      <Link href={`${PFAD}?ansicht=import`} className="inline-flex min-h-10 items-center gap-1 font-medium text-[color:var(--brand)] hover:underline sm:min-h-0" data-funktion="actions-runimportaction--bezuege-aus-airtable-uebernehmen">
        <CloudDownload className="h-3.5 w-3.5" /> Aus Airtable übernehmen
      </Link>
    </div>
  );
  if (!subs.length) {
    return (
      <Card>
        <EmptyState
          icon={PackageOpen}
          title="Noch keine Bezüge."
          text="Einen Bezug anlegen oder aus Airtable übernehmen."
          action={
            <ButtonLink href={`${PFAD}/bezug/neu`} variant="primary" icon={Plus}>
              Bezug anlegen
            </ButtonLink>
          }
        />
        {fuss}
      </Card>
    );
  }
  return (
    <Card>
      <div data-funktion="page-bezuege--bezuege-je-produkt-mit-kontingent-geliefert">
        <CardHeader title="Bezüge" count={subs.filter((s) => s.active).length} />
        {products.map((p) => (
          <div key={p}>
            <div className="bg-[color:var(--surface-sunken)] px-4 py-1.5 text-xs font-semibold text-[color:var(--muted)] sm:px-5">{p}</div>
            <ul className="divide-y divide-[color:var(--border)]">
              {rows
                .filter((r) => r.s.productKey === p)
                .map(({ s, q }) => {
                  const filters = [
                    s.plzRanges ? "PLZ" : null,
                    !s.acceptWeak ? `keine schwachen${s.weakThreshold ? ` (<${s.weakThreshold} €)` : ""}` : null,
                    s.onlyWeak ? "nur schwache" : null,
                    !s.acceptCivilServants ? "keine Beamten" : null,
                    s.insurerInclude.length ? `nur ${s.insurerInclude.length} Ges.` : null,
                    s.insurerExclude.length ? `ohne ${s.insurerExclude.length} Ges.` : null,
                    s.scoreFloor ? `Score ≥ ${s.scoreFloor}` : null,
                  ].filter(Boolean);
                  const menge =
                    s.period === "week"
                      ? q
                        ? `${q.quota} / Woche ${fmtWeek(start)}`
                        : `nichts bezahlt für ${fmtWeek(start)}`
                      : `${s.goal ?? s.testQuantity ?? "–"} ${s.period === "month" ? "/ Monat" : "einmalig"}`;
                  return (
                    <li key={s.id}>
                      <Link href={`${PFAD}/bezug/${s.id}`} className={`flex items-center gap-3 px-4 py-3 text-sm hover:bg-[color:var(--surface-sunken)] sm:px-5 ${s.active ? "" : "opacity-60"}`}>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{s.customer.name}</span>
                            {s.label ? <span className="text-xs text-[color:var(--muted)]">{s.label}</span> : null}
                            {s.status === "test" ? <Badge tone="warning">Test {s.testQuantity ?? ""}</Badge> : null}
                            {!s.active ? <Badge>pausiert</Badge> : null}
                          </div>
                          <div className="mt-0.5 text-xs text-[color:var(--muted)]">
                            {menge} · {eur(Number(s.price))} · {DELIVERY[s.delivery] ?? s.delivery}
                            {filters.length ? ` · ${filters.join(" · ")}` : ""}
                          </div>
                        </div>
                        <span className="shrink-0 text-sm tabular-nums">{q ? `${q.delivered} / ${q.quota}` : ""}</span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--muted)]" />
                      </Link>
                    </li>
                  );
                })}
            </ul>
          </div>
        ))}
      </div>
      {fuss}
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
                  {l.customer.name} · {l.source}
                  {l.stornoNote ? ` · „${l.stornoNote}“` : ""} · geliefert {l.deliveredAt ? dt(l.deliveredAt) : "–"} · {eur(Number(l.revenues[0]?.amount ?? 0))}
                </div>
              </div>
              <div className="flex gap-2">
                {(["approve", "reject"] as const).map((d) => (
                  <form key={d} action={decideStornoAction}>
                    <input type="hidden" name="leadId" value={l.id} />
                    <input type="hidden" name="decision" value={d} />
                    <SubmitButton
                      pendingLabel="…"
                      className={`h-10 rounded-[var(--radius-sm)] px-3 text-[13px] font-semibold sm:h-8 sm:text-xs ${d === "approve" ? "bg-[color:var(--brand)] text-white" : "border border-[color:var(--border)] bg-white"}`}
                    >
                      {d === "approve" ? "Gutschreiben" : "Ablehnen"}
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

function Geparkt({ parked, subs }: { parked: Awaited<ReturnType<typeof prisma.poolLead.findMany>>; subs: Subs }) {
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
                  {p.productKey} · {dt(p.createdAt)}
                </div>
                <div className="text-xs text-[color:var(--muted)]">
                  {[p.plz ? `PLZ ${p.plz}` : null, p.contribution ? `${p.contribution} €` : null, p.weak ? "schwach" : null, p.insurer].filter(Boolean).join(" · ")}
                  {p.reason ? <span className="text-amber-700"> · {p.reason}</span> : null}
                </div>
              </div>
              <form action={assignParkedAction} className="flex min-w-0 items-center gap-2" data-funktion="actions-assignparkedaction--geparkte-leads-einem-bezug-zuordnen">
                <input type="hidden" name="poolLeadId" value={p.id} />
                <select name="subscriptionId" required aria-label="Bezug" className="h-10 min-w-0 max-w-[11rem] rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-2 text-sm sm:h-8">
                  {options.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.customer.name}
                    </option>
                  ))}
                </select>
                {options.length ? (
                  <SubmitButton pendingLabel="…" className="h-10 rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-3 text-[13px] font-semibold text-white sm:h-8 sm:text-xs">
                    Ausliefern
                  </SubmitButton>
                ) : (
                  <span className="text-xs text-[color:var(--muted)]">kein aktiver Bezug</span>
                )}
              </form>
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

async function Eingang() {
  const rows = await prisma.poolLead.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  const leadIds = rows.map((r) => r.leadId).filter((x): x is string => !!x);
  const owners = new Map((await prisma.lead.findMany({ where: { id: { in: leadIds } }, select: { id: true, customer: { select: { name: true } } } })).map((l) => [l.id, l.customer.name]));
  return (
    <Card>
      <CardHeader title="Eingang" count={rows.length} hint="neueste 100" />
      <div data-funktion="nachholen-airtablenachholen--lead-aus-airtable-nachholen-lead-nr-laeuft-durch">
        <AirtableNachholen />
      </div>
      {rows.length ? (
        <ul className="divide-y divide-[color:var(--border)]">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm sm:px-5">
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {r.productKey} <span className="font-normal text-[color:var(--muted)]">· {dt(r.createdAt)}</span>
                </div>
                <div className="truncate text-xs text-[color:var(--muted)]">
                  {[r.plz, r.contribution ? `${r.contribution} €` : null, r.weak ? "schwach" : null, r.smsVerified ? "SMS" : null, r.leadId ? owners.get(r.leadId) : r.reason].filter(Boolean).join(" · ")}
                </div>
              </div>
              <Badge tone={POOL_STATUS[r.status]?.tone ?? "neutral"}>{POOL_STATUS[r.status]?.label ?? r.status}</Badge>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={PackageOpen} title="Noch keine Pay-per-Lead-Leads eingegangen." />
      )}
    </Card>
  );
}

/** Bezüge aus Airtable übernehmen: Vorschau (ändert nichts), dann „Jetzt übernehmen“ (wie /admin/ppl/import). */
async function Import() {
  let rows: Awaited<ReturnType<typeof import("@/lib/ppl/import-airtable").importSubscriptions>> = [];
  let error: string | null = null;
  try {
    const { importSubscriptions } = await import("@/lib/ppl/import-airtable");
    rows = await importSubscriptions({ dryRun: true });
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
  return (
    <Card>
      <CardHeader title="Aus Airtable übernehmen" hint="Vorschau, noch nichts geändert" />
      <div className="space-y-3 p-4 text-sm sm:p-5">
        <p className="text-[color:var(--muted)]">
          Aktualisiert Ziel, Preis, Filter, Storno, Test und aktiv. Zeitraum, Bezeichnung, Lieferweg und Gebiete aus der App bleiben. Am besten zum Monatsanfang.
        </p>
        {rows.length ? (
          <p>
            {(["neu", "aktualisieren", "verknüpfen", "unverändert", "übersprungen"] as const)
              .map((a) => [a, rows.filter((r) => r.action === a).length] as const)
              .filter(([, n]) => n)
              .map(([a, n]) => `${n} ${a}`)
              .join(" · ")}
          </p>
        ) : null}
        {error ? <p className="rounded-[var(--radius-md)] bg-rose-50 px-4 py-3 text-rose-800">{error}</p> : null}
      </div>
      {rows.length ? (
        <ul className="divide-y divide-[color:var(--border)] border-t border-[color:var(--border)]">
          {rows.map((r) => (
            <li key={r.airtableId} className={`px-4 py-2.5 text-sm sm:px-5 ${r.active ? "" : "opacity-60"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{r.bezug}</span>
                <Badge tone={r.action === "übersprungen" ? "danger" : r.action === "neu" ? "success" : r.action === "unverändert" ? "neutral" : "warning"}>{r.action}</Badge>
              </div>
              <div className="text-xs text-[color:var(--muted)]">
                {r.goal ?? "–"} {r.period === "month" ? "/ Monat" : r.period === "once" ? "einmalig" : "/ Woche"} · {eur(r.price)} · {r.filters || "ohne Filter"} · Storno {r.stornoDays ? `${r.stornoDays} Tage` : "–"} · {r.delivery}
              </div>
              {r.note ? <div className="text-xs text-rose-700">{r.note}</div> : null}
              {r.changes.length ? <div className="text-xs">{r.changes.join(" · ")}</div> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {!error && rows.length ? (
        <div className="border-t border-[color:var(--border)] p-4 sm:p-5">
          <ImportButton />
        </div>
      ) : null}
    </Card>
  );
}
