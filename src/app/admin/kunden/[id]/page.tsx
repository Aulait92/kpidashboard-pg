import { connection } from "next/server";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ContactPage from "@/app/admin/vertrieb/kontakte/[id]/page";
import { loadOnboarding, onboardingChecklist } from "@/lib/onboarding";
import { OnboardingCard } from "@/components/vertrieb/onboarding-card";
import { NewUiCard } from "@/components/admin/new-ui-card";
import { VermittlerCard } from "@/components/admin/vermittler-card";
import { StornoQuoteKunde } from "@/components/admin/storno-quote";
import { GarantienCard } from "@/components/admin/garantien-card";
import { SetupCard } from "@/components/admin/setup-card";
import { TestdatenCard } from "@/components/admin/testdaten-card";
import { LeadQualitaetCard } from "@/components/admin/lead-qualitaet-card";
import { NaechsterSchrittCard } from "@/components/admin/naechster-schritt-card";
import type { ImpressumInfo } from "@/lib/impressum";
import { ChevronDown } from "lucide-react";

const TYP_LABEL: Record<string, string> = { vertreter: "Vertreter", mehrfachvertreter: "Mehrfachvertreter", makler: "Makler" };

/**
 * Seltene Kundeneinstellungen (Oberfläche, Vermittlertyp, Stornoquote, Garantie, Testdaten) an derselben Stelle,
 * aber zugeklappt mit dem aktuellen Stand in einer Zeile. Vorher standen sie als fünf Karten vor Kontakt und Verlauf
 * (am Handy rund 1.100 px, bevor man den Kunden anrufen konnte).
 */
function KundenEinstellungen({ summary, children }: { summary: string; children: React.ReactNode }) {
  return (
    <details className="card group" data-kunden-einstellungen>
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 py-2.5 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">Einstellungen dieses Kunden</span>
          <span className="block truncate text-xs text-[color:var(--muted)]">{summary}</span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-[color:var(--muted)] transition group-open:rotate-180" />
      </summary>
      <div className="space-y-3 border-t border-[color:var(--border)] bg-[color:var(--surface-sunken)] p-3">{children}</div>
    </details>
  );
}

// Übersicht der Kundenakte: mit Vertriebskontakt die volle Kontaktseite
// (Verlauf, Aufgaben, Onboarding, Angebote), sonst die Grunddaten.
export default async function KundenakteUebersicht({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<{ einrichtung?: string }> }) {
  await connection();
  const { id } = await params;
  const notice = (await searchParams)?.einrichtung;
  const customer = await prisma.customer.findUnique({
    where: { id },
    select: { id: true, name: true, region: true, retainerMonthly: true, retainerStart: true, metaAdAccountId: true, vermittlerTyp: true, newUi: true, stornoQuote: true, salesContact: { select: { id: true } } },
  });
  if (!customer) notFound();
  const summary = [
    TYP_LABEL[customer.vermittlerTyp] ?? customer.vermittlerTyp,
    `neue Oberfläche ${customer.newUi ? "an" : "aus"}`,
    `Stornoquote ${customer.stornoQuote != null ? `${(Math.round(Number(customer.stornoQuote) * 1000) / 10).toLocaleString("de-DE")} %` : "Standard"}`,
    "Garantie, Testdaten",
  ].join(" · ");
  const settings = (
    <KundenEinstellungen summary={summary}>
      <NewUiCard customerId={id} />
      <VermittlerCard customerId={id} />
      <StornoQuoteKunde customerId={id} />
      <GarantienCard customerId={id} />
      <TestdatenCard customerId={id} />
    </KundenEinstellungen>
  );
  if (customer.salesContact) {
    return (
      <div className="space-y-5">
        {settings}
        <SetupCard customerId={id} notice={notice} />
        <LeadQualitaetCard customerId={id} />
        <NaechsterSchrittCard customerId={id} />
        <ContactPage params={Promise.resolve({ id: customer.salesContact.id })} searchParams={Promise.resolve({ embedded: "1" })} />
      </div>
    );
  }
  const onboarding = await loadOnboarding({ customerId: id });
  const fmt = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
  return (
    <div className="space-y-5">
        {settings}
        <SetupCard customerId={id} notice={notice} />
        <NaechsterSchrittCard customerId={id} />
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[3fr_2fr]">
      <section className="card p-4 text-sm">
        <h2 className="mb-3 font-medium">Grunddaten</h2>
        <dl className="grid grid-cols-[150px_1fr] gap-y-1.5">
          <dt className="text-slate-500">Name</dt>
          <dd>{customer.name}</dd>
          {customer.region ? (
            <>
              <dt className="text-slate-500">Region</dt>
              <dd>{customer.region}</dd>
            </>
          ) : null}
          {customer.retainerMonthly ? (
            <>
              <dt className="text-slate-500">Retainer</dt>
              <dd>
                {Number(customer.retainerMonthly).toLocaleString("de-DE", { style: "currency", currency: "EUR" })}/Monat
                {customer.retainerStart ? ` seit ${fmt(customer.retainerStart)}` : ""}
              </dd>
            </>
          ) : null}
          {customer.metaAdAccountId ? (
            <>
              <dt className="text-slate-500">Meta-Werbekonto</dt>
              <dd>act_{customer.metaAdAccountId}</dd>
            </>
          ) : null}
        </dl>
        <p className="mt-3 text-xs text-slate-500">Kein Vertriebskontakt verknüpft (Kunde aus Airtable).</p>
      </section>
      {onboarding ? (
        <OnboardingCard
          onboarding={onboarding}
          items={onboardingChecklist(onboarding, null)}
          customerName={onboarding.customer.name}
          loginEmail={onboarding.customer.users[0]?.email ?? null}
          feedback={await prisma.customerFeedback.findMany({ where: { customerId: id }, orderBy: { sentAt: "asc" } })}
          websiteInfo={(onboarding.websiteInfo ?? null) as ImpressumInfo | null}
        />
      ) : null}
    </div>
    </div>
  );
}
