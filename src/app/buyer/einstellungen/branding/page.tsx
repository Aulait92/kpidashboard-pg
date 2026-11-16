import { redirect } from "next/navigation";
import { PageHeader } from "@/components/buyer-shell";
import { Card, CardHeader } from "@/components/ui";
import { getBuyerContext } from "@/lib/buyer-context";
import { canEditProvision } from "@/lib/provision-server";
import { loadLogoStand, loadMarkthinweis } from "@/lib/branding-logo-server";
import { LogoForm } from "./logo-form";
import { MarkthinweisForm } from "./markthinweis-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Präsentation | performancegrowth" };

// Logo für die Beratungspräsentation (Ole, 15.11.2026): von der eigenen Webseite oder hochgeladen, mit Bestätigung.
// Makler zusätzlich: Hinweis auf die Marktauswahl (§ 60 Abs. 1, 2 VVG, Rechtsvorprüfung 16.11.2026).
export default async function BrandingPage() {
  const ctx = await getBuyerContext();
  if (!ctx) redirect("/login");
  const [s, mh] = await Promise.all([loadLogoStand(ctx.customerId), loadMarkthinweis(ctx.customerId)]);
  const canEdit = canEditProvision(ctx);
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-6">
      {/* Ole, 16.11.2026: kein Zurück. Aus der App: Browser-Zurück (Vorbereitung, Präsentation), sonst Einstellungen */}
      <PageHeader back="/buyer/einstellungen" title="Präsentation" subtitle="So erscheinen Sie auf der Präsentation, die Sie im Termin zeigen." />
      <Card>
        <CardHeader title="Logo" />
        <LogoForm website={s.website ?? ""} dataUri={s.dataUri} bestaetigt={s.bestaetigt} canEdit={canEdit} />
        {!canEdit ? (
          <p className="px-5 pb-4 text-xs text-[color:var(--muted)]">{ctx.preview ? "Vorschau: nur lesen." : "Nur der Inhaber kann das ändern."}</p>
        ) : null}
      </Card>
      {mh.makler ? (
        <Card className="mt-4">
          <CardHeader title="Hinweis zur Marktauswahl" />
          <MarkthinweisForm text={mh.text} standard={mh.standard} canEdit={canEdit && !ctx.preview} />
        </Card>
      ) : null}
    </main>
  );
}
