import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Badge, Card, CardHeader } from "@/components/ui";
import { KundenakteSeite } from "@/components/admin-neu/kunden/akte";
import { Aufklapp } from "@/components/admin-neu/kunden/aufklapp";
import { VertragAendern } from "@/components/admin-neu/kunden/vertrag-aendern";
import { GarantienCard } from "@/components/admin/garantien-card";
import { TestkundeLoeschen } from "@/components/admin/testkunde-loeschen";
import { AdminPauseCard } from "@/components/vertrieb/onboarding-card";
import { AddOnsCard } from "@/app/admin/kunden/[id]/abrechnung/addons-card";
import { BudgetHistoryCard } from "@/app/admin/kunden/[id]/abrechnung/budget-card";
import { EraseCustomerCard } from "@/app/admin/kunden/[id]/abrechnung/erase-card";
import { LebenszyklusCard } from "@/app/admin/kunden/[id]/abrechnung/lebenszyklus-card";
import { ProductBookingsCard } from "@/app/admin/kunden/[id]/abrechnung/produkt-card";
import { RetainerCard } from "@/app/admin/kunden/[id]/abrechnung/retainer-card";
import { ZahlweiseCard } from "@/app/admin/kunden/[id]/abrechnung/zahlweise-card";
import { billingEnabled, listCustomerInvoices, type CustomerInvoice } from "@/lib/billing";
import { packageLabel } from "@/lib/customer-package";
import { garantieStatus } from "@/lib/garantien-server";
import { mahnwesenAktiv } from "@/lib/mahnwesen";
import { reportError } from "@/lib/monitoring";
import { normalizeRhythmus, RHYTHMUS_LABEL } from "@/lib/offer-pricing";
import { currentPause, todayBerlin } from "@/lib/pause";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Abrechnung | performancegrowth Admin" };

const fmt = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
const eur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });
const RECHNUNG: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  paid: { label: "Bezahlt", tone: "success" },
  open: { label: "Offen", tone: "warning" },
  uncollectible: { label: "Nicht einziehbar", tone: "danger" },
  void: { label: "Storniert", tone: "neutral" },
  draft: { label: "Entwurf", tone: "neutral" },
};

type Suche = { pause?: string; zusatz?: string; retainer?: string; budget?: string; produkt?: string; zahlweise?: string; fehler?: string };

// Kundenakte › Abrechnung (Umbau 20.11.2026, früher „Abrechnung & Pause“ mit 8 offenen Karten und rund 12 Knöpfen):
// oben die Karte „Vertrag“ mit dem Stand in vier Zeilen und EINER Hauptaktion „Ändern“ (Fenster mit Betreuungsgebühr,
// Zahlweise, Überweisung und Mahnungen). Alles Weitere als zugeklappte Zeilen mit Zusammenfassung; offen ist nur, was
// gerade eine Entscheidung braucht (Anfrage des Kunden, laufende Kündigung) oder eben gespeichert wurde.
// Bausteine und Actions von /admin/kunden/[id]/abrechnung (Rückweg nach dem Speichern über components/admin-neu/ui/rueckweg.ts),
// Push-Ziele (Kündigung, Reaktivierung, Module, Verkäufer) landen über umzug.ts hier.
export default async function KundeAbrechnung({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Suche> }) {
  await connection();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const fehler = !!sp.fehler;
  const c = await prisma.customer.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      plan: true,
      isTest: true,
      archived: true,
      stripeCustomerId: true,
      paymentOverdueSince: true,
      paymentWarnedAt: true,
      retainerMonthly: true,
      billingInterval: true,
      seatsBilled: true,
      seatMonthly: true,
      bestandMonthly: true,
      empfehlungMonthly: true,
      existingCustomersEnabled: true,
      empfehlungEnabled: true,
      cancelEffectiveAt: true,
      dormantSince: true,
      onboarding: { select: { id: true } },
      whatsAppAccount: { select: { phoneNumber: true } },
      salesContact: { select: { id: true, monthlyValue: true } },
      _count: { select: { lifecycleEvents: true } },
    },
  });
  if (!c) notFound();

  let rechnungen: CustomerInvoice[] = [];
  if (c.stripeCustomerId && billingEnabled()) {
    rechnungen = await listCustomerInvoices(c.stripeCustomerId).catch((err) => {
      reportError(err, "admin-invoices", { customer: id });
      return [];
    });
  }
  const [pause, leadCount, bestandCount, lastExport, budgetOffen, produkteOffen, garantie] = await Promise.all([
    currentPause(id),
    prisma.lead.count({ where: { customerId: id, erasedAt: null } }),
    prisma.existingCustomer.count({ where: { customerId: id } }),
    prisma.auditLog.findFirst({ where: { customerId: id, action: "customer.export" }, orderBy: { at: "desc" }, select: { at: true } }),
    prisma.budgetChange.count({ where: { customerId: id, status: "pending" } }),
    prisma.productBooking.count({ where: { customerId: id, status: { in: ["setup", "requested"] } } }),
    garantieStatus(id).catch(() => null),
  ]);

  // Monatsbetrag wie in „Verkäufer, Module und Zahlweise“: Betreuungsgebühr + berechnete Verkäufer + Module
  const basis = c.retainerMonthly != null ? Number(c.retainerMonthly) : null;
  const gesamt =
    basis != null
      ? basis + c.seatsBilled * Number(c.seatMonthly ?? 0) + Number(c.bestandMonthly ?? 0) + Number(c.empfehlungMonthly ?? 0)
      : (c.salesContact?.monthlyValue ?? null);
  const status = c.dormantSince
    ? `Ruht seit ${fmt(c.dormantSince)}`
    : c.cancelEffectiveAt
      ? `Gekündigt zum ${fmt(c.cancelEffectiveAt)}`
      : pause
        ? pause.status === "active"
          ? `Pausiert${pause.endsAt ? ` bis ${fmt(pause.endsAt)}` : ""}`
          : `Pause geplant ab ${fmt(pause.startsAt)}`
        : "Läuft";
  const anfragen = budgetOffen + produkteOffen;
  const zusatz = [
    c.existingCustomersEnabled ? "Bestandskunden an" : null,
    c.empfehlungEnabled ? "Empfehlungen an" : null,
    c.seatsBilled ? `${c.seatsBilled} weitere Verkäufer` : null,
  ].filter(Boolean);
  const letzte = rechnungen[0];

  return (
    <KundenakteSeite id={id}>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="min-w-0 space-y-3">
          {c.paymentOverdueSince ? (
            <div className="rounded-[var(--radius-lg)] border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-900" data-funktion="page--hinweis-zahlung-offen-seit">
              <b>Zahlung offen seit {fmt(c.paymentOverdueSince)}.</b> {c.paymentWarnedAt ? `Warnung verschickt am ${fmt(c.paymentWarnedAt)}. ` : ""}
              {mahnwesenAktiv() ? "Erinnerung und Mahnungen laufen automatisch." : "Nach 30 Tagen werden die Anzeigen automatisch pausiert."}
            </div>
          ) : null}

          <Card>
            <CardHeader
              title="Vertrag"
              actions={
                <span data-funktion="retainer-actions-saveretaineraction--betreuungsgebuehr-eintragen-aendern-entfernen retainer-card--kuendigungsabsichten-und-angebotene addon-actions-billingintervalaction--zahlweise-monatlich-jaehrlich-umstellen zahlweise-card--zahlweise-und-mahnungen-offene-posten-des-kunden zahlweise-actions--ueberweisung-erlauben-zahlungsziel zahlweise-actions--mahnungen-je-kunde-stoppen">
                  <VertragAendern offen={!!sp.retainer || !!sp.zahlweise}>
                    <RetainerCard customerId={id} message={sp.retainer ?? null} failed={fehler && !!sp.retainer} />
                    <AddOnsCard customerId={id} message={null} failed={false} teile={["zahlweise"]} titel="Zahlweise" />
                    <ZahlweiseCard customerId={id} message={sp.zahlweise ?? null} failed={fehler && !!sp.zahlweise} />
                  </VertragAendern>
                </span>
              }
            />
            <dl className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] gap-x-3 gap-y-2 px-5 pb-4 pt-3 text-sm">
              <dt className="text-[color:var(--muted)]">Paket</dt>
              <dd>{packageLabel(c)}</dd>
              <dt className="text-[color:var(--muted)]">Monatlich</dt>
              <dd className="tabular-nums">{gesamt ? `${eur(gesamt)} netto` : "keine Betreuungsgebühr"}</dd>
              <dt className="text-[color:var(--muted)]">Zahlweise</dt>
              <dd>
                {RHYTHMUS_LABEL[normalizeRhythmus(c.billingInterval)]} · {c.stripeCustomerId ? "über Stripe" : "von Hand"}
              </dd>
              <dt className="text-[color:var(--muted)]">Stand</dt>
              <dd className={c.dormantSince || c.cancelEffectiveAt || pause ? "font-medium text-amber-800" : ""}>{status}</dd>
            </dl>
          </Card>

          <div data-funktion="budget-actions-decidebudgetaction--budgetaenderung-des-kunden-uebernehmen budget-actions-decidebudgetaction--budgetaenderung-ablehnen produkt-actions-decideproductaction--produktbuchung-des-kunden-annehmen-oder-ablehnen">
            <Aufklapp
              titel="Werbebudget & Produkte"
              zusammenfassung={anfragen ? `${anfragen} ${anfragen === 1 ? "Anfrage wartet" : "Anfragen warten"} auf Sie` : "keine offene Anfrage"}
              offen={!!anfragen || !!sp.budget || !!sp.produkt}
            >
              <div className="space-y-3">
                <BudgetHistoryCard customerId={id} message={sp.budget ?? null} failed={fehler && !!sp.budget} />
                <ProductBookingsCard customerId={id} message={sp.produkt ?? null} failed={fehler && !!sp.produkt} />
              </div>
            </Aufklapp>
          </div>

          <div data-funktion="addon-actions-saveseatsaction--aktive-verkaeufer-speichern-und-mit-stripe addon-actions-bestandmoduleaction--bestandskunden-modul-freischalten-kostenlos addon-actions-savequotaaction--kontingent-bestandskunden-speichern-zusatzpakete addon-actions-empfehlungmoduleaction--modul-empfehlungen-bewertungen-freischalten-oder">
            <Aufklapp titel="Module & Verkäufer" zusammenfassung={zusatz.length ? zusatz.join(" · ") : "keine Zusatzmodule"} offen={!!sp.zusatz}>
              <AddOnsCard customerId={id} message={sp.zusatz ?? null} failed={fehler && !!sp.zusatz} teile={["verkaeufer", "bestand", "empfehlung"]} titel="Verkäufer und Module" />
            </Aufklapp>
          </div>

          <div data-funktion="onboarding-actions-adminplanpauseaction--pause-urlaub-eintragen-ab-neustart-grund onboarding-actions-adminendpauseaction--pause-beenden">
            <Aufklapp titel="Pause" zusammenfassung={pause ? status : "keine Pause geplant"} offen={!!sp.pause}>
              <AdminPauseCard customerId={id} contactId={c.salesContact?.id ?? ""} pause={pause} error={sp.pause ?? null} today={todayBerlin()} />
            </Aufklapp>
          </div>

          {c._count.lifecycleEvents || c.cancelEffectiveAt ? (
            <div data-funktion="lebenszyklus-card--kuendigung-rueckkehr-ruht-seit-reaktiviert ruhend--push-an-admins-mit-sprungziel-kundenakte">
              <Aufklapp titel="Kündigung & Rückkehr" zusammenfassung={status === "Läuft" ? `${c._count.lifecycleEvents} Ereignisse` : status} offen={!!c.cancelEffectiveAt || !!c.dormantSince}>
                <LebenszyklusCard customerId={id} />
              </Aufklapp>
            </div>
          ) : null}
        </div>

        <div className="min-w-0 space-y-3">
          <div data-funktion="page-invoices--rechnungen-mit-status-und-pdf page--in-stripe-oeffnen">
            <Aufklapp
              titel="Rechnungen"
              zusammenfassung={letzte ? `${rechnungen.length} · zuletzt ${fmt(letzte.created)}, ${(RECHNUNG[letzte.status ?? ""] ?? { label: letzte.status ?? "" }).label}` : c.stripeCustomerId ? "noch keine" : "Abrechnung von Hand"}
            >
              <Card>
                {rechnungen.length ? (
                  <ul className="divide-y divide-[color:var(--border)]">
                    {rechnungen.map((inv) => {
                      const st = RECHNUNG[inv.status ?? ""] ?? { label: inv.status ?? "", tone: "neutral" as const };
                      return (
                        <li key={inv.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
                          <span className="font-medium">{inv.number ?? "Rechnung"}</span>
                          <span className="text-[color:var(--muted)]">{fmt(inv.created)}</span>
                          <span className="tabular-nums">{eur(inv.total)}</span>
                          <Badge tone={st.tone}>{st.label}</Badge>
                          {inv.pdfUrl ? (
                            <a href={inv.pdfUrl} target="_blank" rel="noreferrer" className="ml-auto inline-flex min-h-10 items-center text-xs font-medium text-[color:var(--brand)] hover:underline">
                              PDF
                            </a>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="p-4 text-sm text-[color:var(--muted)]">{c.stripeCustomerId ? "Noch keine Rechnungen." : "Keine Online-Zahlung hinterlegt."}</p>
                )}
                {c.stripeCustomerId ? (
                  <a
                    href={`https://dashboard.stripe.com/customers/${c.stripeCustomerId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex min-h-11 items-center justify-center border-t border-[color:var(--border)] text-sm font-medium text-[color:var(--brand)] hover:bg-[color:var(--surface-sunken)]"
                  >
                    In Stripe öffnen ↗
                  </a>
                ) : null}
              </Card>
            </Aufklapp>
          </div>

          {garantie ? (
            <div data-funktion="garantien-card--garantien-stand-und-faelle">
              <Aufklapp titel="Garantien" zusammenfassung={`${garantie.ergebnisse.length} ${garantie.ergebnisse.length === 1 ? "Garantie" : "Garantien"}`}>
                <GarantienCard customerId={id} />
              </Aufklapp>
            </div>
          ) : null}

          <div data-funktion="erase-actions-erasecustomerdataaction--kundendaten-endgueltig-loeschen-mit-grund test-actions-deletetestcustomeraction--testkunde-komplett-loeschen">
            <Aufklapp titel="Daten löschen" zusammenfassung={c.isTest ? "Testkunde komplett löschen oder Daten von Hand löschen" : "endgültig, mit Grund"}>
              <div className="space-y-3">
                {c.isTest ? (
                  <div className="rounded-[var(--radius-md)] bg-white px-4 py-3">
                    <TestkundeLoeschen customerId={c.id} name={c.name} whatsapp={c.whatsAppAccount?.phoneNumber ?? null} zurueck="/admin/neu/kunden" />
                  </div>
                ) : null}
                <EraseCustomerCard
                  customerId={id}
                  customerName={c.name}
                  leadCount={leadCount}
                  bestandCount={bestandCount}
                  archived={c.archived}
                  lastExport={lastExport ? fmt(lastExport.at) : null}
                />
              </div>
            </Aufklapp>
          </div>
        </div>
      </div>
    </KundenakteSeite>
  );
}
