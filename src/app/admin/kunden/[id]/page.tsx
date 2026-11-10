import { connection } from "next/server";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ContactPage from "@/app/admin/vertrieb/kontakte/[id]/page";
import { loadOnboarding, onboardingChecklist } from "@/lib/onboarding";
import { OnboardingCard } from "@/components/vertrieb/onboarding-card";
import type { ImpressumInfo } from "@/lib/impressum";

// Übersicht der Kundenakte: mit Vertriebskontakt die volle Kontaktseite
// (Verlauf, Aufgaben, Onboarding, Angebote), sonst die Grunddaten.
export default async function KundenakteUebersicht({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const customer = await prisma.customer.findUnique({
    where: { id },
    select: { id: true, name: true, region: true, retainerMonthly: true, retainerStart: true, metaAdAccountId: true, salesContact: { select: { id: true } } },
  });
  if (!customer) notFound();
  if (customer.salesContact) {
    return <ContactPage params={Promise.resolve({ id: customer.salesContact.id })} searchParams={Promise.resolve({ embedded: "1" })} />;
  }
  const onboarding = await loadOnboarding({ customerId: id });
  const fmt = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
  return (
    <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
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
  );
}
