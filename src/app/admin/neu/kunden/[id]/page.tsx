import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { ArrowRight, ChevronRight } from "lucide-react";
import { Badge, Card, CardHeader } from "@/components/ui";
import { RATING_TONE } from "@/components/admin-neu/kunden/bericht-bewertung";
import { monthLabel, STATUS_LABEL } from "@/lib/monatsbericht/shared";
import { KundenakteSeite } from "@/components/admin-neu/kunden/akte";
import { Kennzahlen, LeadsJeTag } from "@/components/admin-neu/kunden/kennzahlen";
import { Aufklapp } from "@/components/admin-neu/kunden/aufklapp";
import { OnboardingCard } from "@/components/vertrieb/onboarding-card";
import { SetupCard } from "@/components/admin/setup-card";
import { NewUiCard } from "@/components/admin/new-ui-card";
import { VermittlerCard } from "@/components/admin/vermittler-card";
import { VermittlerAnredeCard } from "@/components/admin/vermittler-anrede-card";
import { vermittlerAnredeLabel } from "@/lib/vermittler-ansprache";
import { StornoQuoteKunde } from "@/components/admin/storno-quote";
import { TestdatenCard } from "@/components/admin/testdaten-card";
import { loadOnboarding, onboardingChecklist } from "@/lib/onboarding";
import { prisma } from "@/lib/prisma";
import { ACTIVITY_LABEL } from "@/lib/vertrieb/crm";
import { fmtDate } from "@/lib/vertrieb/dates";
import type { ImpressumInfo } from "@/lib/impressum";

export const metadata = { title: "Kunde | performancegrowth Admin" };

const TYP_LABEL: Record<string, string> = { vertreter: "Vertreter", mehrfachvertreter: "Mehrfachvertreter", makler: "Makler" };
const eur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

// Kundenakte › Übersicht: kompakt. Oben Kennzahlen, dann Einrichtung (offen nur, solange sie läuft), Verlauf mit
// Sprung in die ganze Kontaktakte, Grunddaten und die seltenen Einstellungen zugeklappt. Früher bettete die Übersicht
// die ganze Kontaktseite ein (am Handy rund 2.700 px); die liegt jetzt unter „Ganze Kontaktakte“ (./kontakt).
// Lead-Qualität → Leads, Nächster Schritt je Berater → Team, Garantien → Abrechnung. Monatsberichte (Umbau 20.11.2026:
// kein eigener Reiter mehr) als Karte mit dem letzten Bericht und „Alle Berichte“ (./berichte).
export default async function KundeUebersicht({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ einrichtung?: string }> }) {
  await connection();
  const { id } = await params;
  const { einrichtung: notice } = await searchParams;
  const c = await prisma.customer.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      region: true,
      retainerMonthly: true,
      retainerStart: true,
      metaAdAccountId: true,
      vermittlerTyp: true,
      vermittlerDu: true,
      newUi: true,
      stornoQuote: true,
      salesContact: {
        select: {
          id: true,
          phone: true,
          email: true,
          offers: { select: { id: true, paymentStatus: true, paidAt: true, isTest: true } },
          activities: { orderBy: { occurredAt: "desc" }, take: 4, select: { id: true, type: true, note: true, outcome: true, occurredAt: true } },
          tasks: { where: { doneAt: null }, orderBy: { dueAt: "asc" }, take: 2, select: { id: true, title: true, dueAt: true } },
          _count: { select: { activities: true, tasks: { where: { doneAt: null } } } },
        },
      },
    },
  });
  if (!c) notFound();
  const [onboarding, bericht] = await Promise.all([
    loadOnboarding({ customerId: id }),
    prisma.monthlyReport.findFirst({ where: { customerId: id }, orderBy: { month: "desc" }, select: { id: true, month: true, rating: true, status: true, sentAt: true } }),
  ]);
  const live = !onboarding || !!onboarding.liveAt;
  const contact = c.salesContact;
  const obOffer = onboarding?.offerId ? (contact?.offers.find((o) => o.id === onboarding.offerId) ?? null) : null;

  const einstellungen = [
    TYP_LABEL[c.vermittlerTyp] ?? c.vermittlerTyp,
    `Anrede ${vermittlerAnredeLabel({ kunde: c.vermittlerDu })}`,
    `neue Oberfläche ${c.newUi ? "an" : "aus"}`,
    `Stornoquote ${c.stornoQuote != null ? `${(Math.round(Number(c.stornoQuote) * 1000) / 10).toLocaleString("de-DE")} %` : "Standard"}`,
    "Testdaten",
  ].join(" · ");

  const einrichtung = (
    <div className="flex flex-col gap-4">
      <div
        className={live ? undefined : "order-2"}
        data-funktion="setup-card--einrichtungsschritte-ansehen-einwilligung onboarding-actions-opensetupaction--selbst-einrichtung-freischalten onboarding-actions-sendsetupreminderaction--erinnerung-zur-einrichtung-senden onboarding-actions-admincheckmetaaction--meta-zugriff-pruefen onboarding-actions-restartsetupaction--einrichtung-neu-starten onboarding-actions-toggleonboardingstepaction--onboarding-schritte-abhaken"
      >
        {/* Während der Einrichtung: Onboarding-Checkliste mit „Live schalten“ offen (eine Hauptaktion), die Sicht des
            Kunden (Selbst-Einrichtung, Erinnerung, Einwilligung, Meta-Zugriff) zugeklappt. Beide Listen offen waren am
            Handy rund 3.700 px mit zwei blauen Knöpfen (SUS-Prüfung 20.11.2026). */}
        {onboarding && !live ? (
          <Aufklapp titel="Selbst-Einrichtung des Kunden" zusammenfassung="Erinnerung senden, Einwilligung, Meta-Zugriff prüfen" offen={!!notice}>
            <SetupCard customerId={id} notice={notice} />
          </Aufklapp>
        ) : (
          <SetupCard customerId={id} notice={notice} />
        )}
      </div>
      {onboarding ? (
        <div
          data-funktion="onboarding-actions-goliveaction--live-schalten-bzw-zuruecknehmen onboarding-actions-resendwelcomeaction--willkommens-mail-erneut-senden onboarding-card-impressum--pflichtangaben-aus-dem-impressum-erstinformation"
        >
          <OnboardingCard
            onboarding={onboarding}
            items={onboardingChecklist(onboarding, obOffer)}
            customerName={onboarding.customer.name}
            loginEmail={onboarding.customer.users[0]?.email ?? null}
            feedback={await prisma.customerFeedback.findMany({ where: { customerId: id }, orderBy: { sentAt: "asc" } })}
            websiteInfo={(onboarding.websiteInfo ?? null) as ImpressumInfo | null}
          />
        </div>
      ) : null}
    </div>
  );

  return (
    <KundenakteSeite id={id}>
      <div className="space-y-5">
        <Kennzahlen customerId={id} />

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="flex min-w-0 flex-col gap-5">
            {/* Einrichtung: offen, solange sie läuft (oder eine Rückmeldung da ist), danach zugeklappt */}
            {live && !notice ? (
              <Aufklapp titel="Einrichtung" zusammenfassung={onboarding?.liveAt ? `live seit ${fmtDate(onboarding.liveAt)}` : "Selbst-Einrichtung noch nicht freigeschaltet"}>
                {einrichtung}
              </Aufklapp>
            ) : (
              einrichtung
            )}
            {/* Am Handy reichen die Kennzahlen oben */}
            <div className="hidden sm:block">
              <LeadsJeTag customerId={id} />
            </div>
          </div>

          <div className="min-w-0 space-y-5">
            <Card>
              <CardHeader
                title="Monatsbericht"
                actions={
                  <Link href={`/admin/neu/kunden/${id}/berichte`} className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-[color:var(--brand)] hover:underline">
                    Alle Berichte <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                }
              />
              {bericht ? (
                <Link
                  href={`/admin/neu/kunden/${id}/berichte?bericht=${bericht.id}#bericht`}
                  className="flex min-h-12 items-center gap-3 px-5 py-3 text-sm transition hover:bg-[color:var(--surface-sunken)]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{monthLabel(bericht.month)}</span>
                    <span className="block text-xs text-[color:var(--muted)]">
                      {STATUS_LABEL[bericht.status] ?? bericht.status}
                      {bericht.sentAt ? ` am ${fmtDate(bericht.sentAt)}` : ""}
                    </span>
                  </span>
                  <Badge tone={RATING_TONE[bericht.rating] ?? "neutral"}>{bericht.rating}</Badge>
                  <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--border-strong)]" />
                </Link>
              ) : (
                <p className="px-5 py-4 text-sm text-[color:var(--muted)]">Noch kein Bericht. Er entsteht automatisch ab dem 2. des Folgemonats.</p>
              )}
            </Card>

            {/* Ohne Vertriebskontakt keine leere Verlaufskarte (SUS-Prüfung 20.11.2026) */}
            {contact ? (
            <Card>
              <div data-funktion="page-contactpage-embedded--eingebettete-kontaktakte-verlauf-aufgaben">
                <CardHeader
                  title="Verlauf"
                  count={contact?._count.activities}
                  actions={
                    contact ? (
                      <Link href={`/admin/neu/kunden/${id}/kontakt`} className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-[color:var(--brand)] hover:underline">
                        Ganze Kontaktakte <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    ) : null
                  }
                />
                {contact ? (
                  <ul className="divide-y divide-[color:var(--border)] text-sm">
                    {contact.tasks.map((t) => (
                      <li key={t.id} className="flex items-baseline gap-3 px-5 py-2.5">
                        <span className="min-w-0 flex-1 truncate font-medium">{t.title}</span>
                        <span className="shrink-0 text-xs text-[color:var(--muted)]">Aufgabe · {fmtDate(t.dueAt)}</span>
                      </li>
                    ))}
                    {contact.activities.map((a) => (
                      <li key={a.id} className="px-5 py-2.5">
                        <div className="flex items-baseline gap-3">
                          <span className="min-w-0 flex-1 truncate font-medium">{ACTIVITY_LABEL[a.type]}{a.outcome ? ` · ${a.outcome}` : ""}</span>
                          <span className="shrink-0 text-xs text-[color:var(--muted)]">{fmtDate(a.occurredAt)}</span>
                        </div>
                        {a.note ? <p className="mt-0.5 line-clamp-2 text-xs text-[color:var(--muted)]">{a.note}</p> : null}
                      </li>
                    ))}
                    {!contact.tasks.length && !contact.activities.length ? (
                      <li className="px-5 py-4 text-[color:var(--muted)]">
                        Noch kein Eintrag.{" "}
                        <Link href={`/admin/neu/kunden/${id}/kontakt`} className="font-medium text-[color:var(--brand)] hover:underline">
                          Notiz oder Aufgabe anlegen
                        </Link>
                      </li>
                    ) : null}
                  </ul>
                ) : null}
              </div>
            </Card>
            ) : null}

            <Card>
              <div data-funktion="page-grunddaten--grunddaten-region-betreuungsgebuehr-meta">
                <CardHeader title="Grunddaten" />
                <dl className="grid grid-cols-[minmax(0,130px)_minmax(0,1fr)] gap-x-3 gap-y-1.5 px-5 py-4 text-sm">
                  <dt className="text-[color:var(--muted)]">Name</dt>
                  <dd className="break-words">{c.name}</dd>
                  {contact?.phone ? (
                    <>
                      <dt className="text-[color:var(--muted)]">Telefon</dt>
                      <dd>
                        <a href={`tel:${contact.phone}`} className="text-[color:var(--brand)] hover:underline">
                          {contact.phone}
                        </a>
                      </dd>
                    </>
                  ) : null}
                  {contact?.email ? (
                    <>
                      <dt className="text-[color:var(--muted)]">E-Mail</dt>
                      <dd className="break-all">
                        <a href={`mailto:${contact.email}`} className="text-[color:var(--brand)] hover:underline">
                          {contact.email}
                        </a>
                      </dd>
                    </>
                  ) : null}
                  {c.region ? (
                    <>
                      <dt className="text-[color:var(--muted)]">Region</dt>
                      <dd>{c.region}</dd>
                    </>
                  ) : null}
                  <dt className="text-[color:var(--muted)]">Betreuungsgebühr</dt>
                  <dd>
                    {c.retainerMonthly ? `${eur(Number(c.retainerMonthly))} / Monat${c.retainerStart ? ` seit ${fmtDate(c.retainerStart)}` : ""}` : "keine"}
                  </dd>
                  <dt className="text-[color:var(--muted)]">Meta-Werbekonto</dt>
                  <dd className="break-all">{c.metaAdAccountId ? `act_${c.metaAdAccountId}` : "nicht hinterlegt"}</dd>
                </dl>
              </div>
            </Card>

            <Aufklapp titel="Einstellungen dieses Kunden" zusammenfassung={einstellungen}>
              <div className="space-y-3">
                <div data-funktion="module-actions-togglenewuiaction--neue-oberflaeche-fuer-kunden-an-aus">
                  <NewUiCard customerId={id} />
                </div>
                <div data-funktion="module-actions-setvermittlertypaction--vermittlertyp-setzen">
                  <VermittlerCard customerId={id} />
                </div>
                <div data-funktion="module-actions-setvermittlerduaction--anrede-gegenueber-dem-kunden-sie-oder-du">
                  <VermittlerAnredeCard customerId={id} />
                </div>
                <div data-funktion="storno-quote-stornoquotekunde--stornoquote-der-vertraege-des-kunden">
                  <StornoQuoteKunde customerId={id} />
                </div>
                <div data-funktion="actions-marktestcustomeraction--als-testkunde-markieren actions-seeddemoaction--testdaten-anlegen-bzw-entfernen">
                  <TestdatenCard customerId={id} />
                </div>
              </div>
            </Aufklapp>
          </div>
        </div>
      </div>
    </KundenakteSeite>
  );
}

