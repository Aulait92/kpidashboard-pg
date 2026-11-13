import { redirect } from "next/navigation";
import { PageHeader } from "@/components/buyer-shell";
import { getBuyerContext } from "@/lib/buyer-context";
import { prisma } from "@/lib/prisma";
import { canEditProvision, customerProductKeys, loadCustomerProvision } from "@/lib/provision-server";
import { ProvisionForm } from "./provision-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Meine Provisionen | performancegrowth" };

// „Meine Provisionen“: eigene Sätze je Produkt. Daraus schätzt die App bei
// jedem Abschluss die Provision (Zahlen, Pipeline, Team). Inhaber ändern,
// Berater sehen schreibgeschützt.
export default async function ProvisionenPage() {
  const ctx = await getBuyerContext();
  if (!ctx) redirect("/login");
  const [provision, known, ob] = await Promise.all([
    loadCustomerProvision(ctx.customerId),
    customerProductKeys(ctx.customerId),
    prisma.onboarding.findUnique({ where: { customerId: ctx.customerId }, select: { offerId: true } }).catch(() => null),
  ]);
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
      <PageHeader
        title="Meine Provisionen"
        subtitle="Damit schätzt die App bei jedem Abschluss Ihre Provision. Vorausgefüllt mit üblichen Werten, passen Sie sie bei Bedarf an Ihren Vertrag an."
      />
      <ProvisionForm typ={provision.typ} typKnown={typKnown} custom={provision.custom} known={known} canEdit={canEdit} readOnlyReason={readOnlyReason} />
    </main>
  );
}
