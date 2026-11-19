import { redirect } from "next/navigation";
import { PageHeader } from "@/components/buyer-shell";
import { getBuyerContext } from "@/lib/buyer-context";
import { prisma } from "@/lib/prisma";
import { canEditProvision, customerProductKeys, loadCustomerProvision } from "@/lib/provision-server";
import { ProvisionForm } from "./provision-form";
import { EigeneProdukte } from "./eigene-produkte";
import { realStornoQuote, sparteInfo } from "@/lib/provision";
import { loadCustomerContracts } from "@/lib/vertraege";

export const dynamic = "force-dynamic";
export const metadata = { title: "Meine Provisionen | performancegrowth" };

// „Meine Provisionen“: eigene Sätze je Produkt. Daraus schätzt die App bei
// jedem Abschluss die Provision (Zahlen, Pipeline, Team). Inhaber ändern,
// Berater sehen schreibgeschützt.
export default async function ProvisionenPage() {
  const ctx = await getBuyerContext();
  if (!ctx) redirect("/login");
  const [provision, booked, ob, used, contracts] = await Promise.all([
    loadCustomerProvision(ctx.customerId),
    customerProductKeys(ctx.customerId),
    prisma.onboarding.findUnique({ where: { customerId: ctx.customerId }, select: { offerId: true } }).catch(() => null),
    // Sparten, die schon in Verträgen vorkommen (Cross-Selling), stehen oben mit
    prisma.leadContract.findMany({ where: { customerId: ctx.customerId }, distinct: ["sparte"], select: { sparte: true } }).catch(() => []),
    loadCustomerContracts(ctx.customerId).catch(() => []),
  ]);
  // Tatsächliche Stornoquote aus gekündigten Verträgen (erst ab 20 Verträgen)
  const real = realStornoQuote(contracts.map((c) => ({ signedAt: c.signedAt, cancelledAt: c.status === "storniert" ? c.cancelledAt : null })), new Date());
  const known = [...new Set([...booked, ...used.map((u) => sparteInfo(u.sparte).rateKey)])];
  // Vertreter oder Makler steht im angenommenen Angebot – dann nicht mehr fragen (Ole, 13.11.2026)
  const typKnown = !!ob?.offerId;
  const canEdit = canEditProvision(ctx);
  const readOnlyReason = canEdit
    ? undefined
    : ctx.preview
      ? "Vorschau: Die Sätze sind nur lesbar."
      : "Nur der Inhaber kann die Provisionen ändern. Sie sehen hier, womit die App rechnet.";

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader back="/buyer/einstellungen"
        title="Meine Provisionen"
        subtitle="Damit schätzt die App bei jedem Abschluss Ihre Provision."
      />
      <ProvisionForm
        typ={provision.typ}
        typKnown={typKnown}
        custom={provision.custom}
        known={known}
        canEdit={canEdit}
        readOnlyReason={readOnlyReason}
        storno={provision.stornoCustom ? provision.storno : null}
        real={{ quote: real.quote, contracts: real.contracts, cancelled: real.cancelled }}
      />
      <EigeneProdukte products={provision.products} canEdit={canEdit} />
    </main>
  );
}
