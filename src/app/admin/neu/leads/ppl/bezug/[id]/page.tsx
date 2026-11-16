import { notFound } from "next/navigation";
import { Seite } from "@/components/admin-neu/ui/seite";
import { prisma } from "@/lib/prisma";
import { BezugForm } from "@/app/admin/ppl/bezug/[id]/bezug-form";
import { BezugZusatz } from "@/app/admin/ppl/bezug/[id]/bezug-zusatz";

export const metadata = { title: "Bezug | performancegrowth Admin" };

// Pay-per-Lead → Bezug anlegen/bearbeiten. Formular, Gebiete und Bestellungen wie /admin/ppl/bezug/[id];
// Filter sowie Storno und Lieferweg sind eingeklappt (selten geändert), Speichern führt zurück zu Pay-per-Lead.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const isNew = id === "neu";
  const [sub, customers, products] = await Promise.all([
    isNew
      ? null
      : prisma.leadSubscription.findUnique({
          where: { id },
          include: { orders: { orderBy: { periodStart: "desc" }, take: 8 }, areas: { orderBy: { createdAt: "asc" } }, customer: { select: { name: true } } },
        }),
    prisma.customer.findMany({ where: { archived: false, plan: { not: "internal" } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.leadSubscription.findMany({ distinct: ["productKey"], select: { productKey: true } }),
  ]);
  if (!isNew && !sub) notFound();

  return (
    <Seite
      titel={sub ? `Bezug: ${sub.customer.name}` : "Bezug anlegen"}
      untertitel={sub ? `${sub.label ?? sub.productKey} · ${Number(sub.price).toLocaleString("de-DE", { style: "currency", currency: "EUR" })} je Lead` : undefined}
      zurueck={{ href: "/admin/neu/leads/ppl", label: "Pay-per-Lead" }}
    >
      <div className="mx-auto max-w-3xl space-y-4">
        <div data-funktion="actions-savesubscriptionaction--bezug-anlegen-bearbeiten-kunde-produkt-menge bezug-form--bezug-modus-woche-monat-einmalig-live-test">
          <BezugForm
            sub={sub ? { ...sub, price: Number(sub.price), startDate: sub.startDate?.toISOString().slice(0, 10) ?? "", hasSecret: !!sub.webhookSecretEnc } : null}
            customers={customers}
            products={products.map((p) => p.productKey)}
            zurueck="/admin/neu/leads/ppl"
            einklappen
          />
        </div>
        {sub ? (
          <div data-funktion="actions-saveareaaction--gebiet-mit-vorrang-anlegen-aendern-plz-menge actions-deleteareaaction--gebiet-loeschen actions-manualorderaction--bestellung-von-hand-bezahlt-ohne-stripe" className="space-y-4">
            <BezugZusatz sub={sub} />
          </div>
        ) : null}
      </div>
    </Seite>
  );
}
