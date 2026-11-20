import { notFound, redirect } from "next/navigation";
import { FileText } from "lucide-react";
import { PageHeader } from "@/components/buyer-shell";
import { ZurueckLink } from "@/components/zurueck-link";
import { ButtonLink, Card, EmptyState } from "@/components/ui";
import { Vergleichsblatt } from "@/components/policen-vergleichsblatt";
import { getBuyerContext } from "@/lib/buyer-context";
import { prisma } from "@/lib/prisma";
import { appointmentScope } from "@/lib/team";
import { ladeVergleich } from "@/lib/policen/auslesen/server";
import { zweiFaktorAktiv } from "@/lib/totp-account";

export const dynamic = "force-dynamic";
export const metadata = { title: "Verträge | performancegrowth" };

// Vertragsseite (Policen auslesen, Ole 18.11.2026; Paket 2 „Champions League“ 19.11.2026: Titel ohne Untertitel, das
// Wort „Vergleichsblatt“ nicht mehr in der Oberfläche): Verträge aus den Unterlagen vom Kunden, Teil der
// Terminvorbereitung. Nur der zuständige Vermittler bzw. Inhaber (appointmentScope); in der Admin-Vorschau keine
// Inhalte (Rechtsprüfung: kein Zugriff von performancegrowth auf Policen).
export default async function VergleichsblattPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getBuyerContext();
  if (!ctx) redirect("/login");
  const { id } = await params;
  const t = await prisma.appointment.findFirst({
    where: { id, ...appointmentScope(ctx) },
    select: { id: true, leadId: true, lead: { select: { name: true } } },
  });
  if (!t?.leadId) notFound();
  const zurueck = `/buyer/termine/${t.id}/vorbereitung`;
  const kopf = (
    <>
      <ZurueckLink href={zurueck} back>
        Terminvorbereitung
      </ZurueckLink>
      <PageHeader title={`Verträge: ${t.lead?.name ?? "Kunde"}`} />
    </>
  );
  if (ctx.preview) {
    return (
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
        {kopf}
        <Card>
          <EmptyState icon={FileText} title="In der Vorschau nicht sichtbar" text="Unterlagen vom Kunden sieht nur der zuständige Vermittler." />
        </Card>
      </main>
    );
  }
  const [v, zweiFaktor] = await Promise.all([ladeVergleich(t.leadId, ctx.customerId), zweiFaktorAktiv(ctx.userId)]);
  const hier = `/buyer/termine/${t.id}/vorbereitung/vertraege`;
  return (
    // Handy: Platz für die feste Hauptaktion über der Navigation
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-36 pt-6 sm:px-6 md:pb-10 lg:px-8">
      {kopf}
      {v.vertraege.length || v.offen.length ? (
        <Vergleichsblatt terminId={t.id} leadId={t.leadId} v={v} readOnly={false} ohne2fa={!zweiFaktor} zurueck={hier} terminHref={zurueck} />
      ) : (
        <Card>
          <EmptyState
            icon={FileText}
            title="Noch keine Unterlagen"
            text="Schickt der Kunde Policen per WhatsApp, erscheinen sie hier. Sonst im Termin danach fragen."
            action={
              <ButtonLink href={zurueck} variant="primary" size="md">
                Zur Terminvorbereitung
              </ButtonLink>
            }
          />
        </Card>
      )}
    </main>
  );
}
