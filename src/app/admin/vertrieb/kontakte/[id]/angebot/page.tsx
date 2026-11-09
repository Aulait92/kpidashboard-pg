import Link from "next/link";
import { notFound } from "next/navigation";
import { OfferForm } from "@/components/offer-form";
import { legalUrls } from "@/lib/offers";
import { prisma } from "@/lib/prisma";
import { shortName } from "@/lib/vertrieb/crm";

export const metadata = { title: "Angebot erstellen | Vertrieb" };

export default async function ContactOfferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await prisma.salesContact.findUnique({
    where: { id },
    select: {
      id: true, name: true, email: true, street: true, zip: true, city: true,
      salutation: true, firstName: true, lastName: true, leaderNames: true, products: true,
    },
  });
  if (!c) notFound();
  const legal = legalUrls();
  const person = [c.firstName, c.lastName].filter(Boolean).join(" ") || c.leaderNames?.split(",")[0]?.trim() || "";
  const back = `/admin/vertrieb/kontakte/${c.id}`;

  return (
    <div className="mx-auto w-full max-w-6xl">
      <Link href={back} className="text-sm text-slate-500 hover:underline">← {shortName(c.name)}</Link>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Angebot erstellen</h1>
      <p className="mt-1 text-sm text-[color:var(--muted)]">
        Preise nach Preisliste, Sonderkonditionen jederzeit möglich. Nach der Online-Annahme rückt der Kontakt in der
        Kunden-Pipeline auf „Vertrag“, nach eingerichteter Zahlung auf „Onboarding“.
      </p>
      {!legal.termsUrl || !legal.dpaUrl ? (
        <p className="mt-4 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Online-Annahme noch nicht freigeschaltet: Bitte die Links zu AGB und Auftragsverarbeitungsvertrag hinterlegen.
        </p>
      ) : null}
      <div className="mt-6">
        <OfferForm
          target={{ salesContactId: c.id }}
          backHref={back}
          initial={{
            contactName: person,
            company: c.name,
            email: c.email,
            product: c.products?.split(",")[0]?.trim() ?? "",
            street: c.street ?? "",
            zip: c.zip ?? "",
            city: c.city ?? "",
          }}
        />
      </div>
    </div>
  );
}
