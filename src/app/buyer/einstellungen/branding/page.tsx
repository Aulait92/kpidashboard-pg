import { redirect } from "next/navigation";
import { PageHeader } from "@/components/buyer-shell";
import { Card, CardHeader } from "@/components/ui";
import { getBuyerContext } from "@/lib/buyer-context";
import { canEditProvision } from "@/lib/provision-server";
import { loadLogoStand } from "@/lib/branding-logo-server";
import { LogoForm } from "./logo-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Logo für Präsentationen | performancegrowth" };

// Logo für die Beratungspräsentation (Ole, 15.11.2026): von der eigenen Webseite oder hochgeladen, mit Bestätigung.
export default async function BrandingPage() {
  const ctx = await getBuyerContext();
  if (!ctx) redirect("/login");
  const s = await loadLogoStand(ctx.customerId);
  const canEdit = canEditProvision(ctx);
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-6">
      <PageHeader title="Logo für Präsentationen" subtitle="Ihr Logo erscheint auf der Präsentation, die Sie im Termin zeigen." />
      <Card>
        <CardHeader title="Logo" />
        <LogoForm website={s.website ?? ""} dataUri={s.dataUri} bestaetigt={s.bestaetigt} canEdit={canEdit} />
        {!canEdit ? (
          <p className="px-5 pb-4 text-xs text-[color:var(--muted)]">{ctx.preview ? "Vorschau: nur lesen." : "Nur der Inhaber kann das ändern."}</p>
        ) : null}
      </Card>
    </main>
  );
}
