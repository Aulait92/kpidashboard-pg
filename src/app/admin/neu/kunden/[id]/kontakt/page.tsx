import { connection } from "next/server";
import { notFound } from "next/navigation";
import ContactPage from "@/app/admin/vertrieb/kontakte/[id]/kontakt-ansicht";
import { KundenakteSeite } from "@/components/admin-neu/kunden/akte";
import { prisma } from "@/lib/prisma";
import { UserRound } from "lucide-react";
import { ButtonLink, Card, EmptyState } from "@/components/ui";

export const metadata = { title: "Kontaktakte | performancegrowth Admin" };

// Kundenakte › Übersicht › „Ganze Kontaktakte“: die Kontaktseite des Vertriebs (Verlauf, Aufgaben, Angebote,
// Onboarding, Kontaktdaten) im Rahmen der Kundenakte, wie früher eingebettet in /admin/kunden/[id].
export default async function KundeKontaktakte({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const c = await prisma.customer.findUnique({ where: { id }, select: { salesContact: { select: { id: true } } } });
  if (!c) notFound();
  return (
    <KundenakteSeite id={id}>
      {c.salesContact ? (
        <div data-funktion="page-contactpage-embedded--eingebettete-kontaktakte-verlauf-aufgaben">
          <ContactPage params={Promise.resolve({ id: c.salesContact.id })} searchParams={Promise.resolve({ embedded: "1" })} />
        </div>
      ) : (
        // Leerer Zustand mit nächster Handlung (SUS-Prüfung 20.11.2026) statt nur Text
        <Card>
          <EmptyState
            icon={UserRound}
            title="Kein Vertriebskontakt verknüpft"
            text="Dieser Kunde wurde ohne Kontakt aus dem Vertrieb angelegt."
            action={
              <ButtonLink href={`/admin/neu/kunden/${id}`} variant="secondary" size="md">
                Zur Übersicht
              </ButtonLink>
            }
          />
        </Card>
      )}
    </KundenakteSeite>
  );
}
