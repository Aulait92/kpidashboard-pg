import { notFound } from "next/navigation";
import { Seite } from "@/components/admin-neu/ui/seite";
import { kurzName } from "@/components/admin-neu/kunden/akte";
import KundenKampagne from "@/app/admin/kunden/[id]/kampagne/page";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/vertrieb/auth";

export const metadata = { title: "Kampagne mit KI | performancegrowth Admin" };

const FUNKTIONEN = [
  "actions-startrunaction--ki-kampagne-starten-produkt-zusatzwunsch-seiten",
  "actions-getrunaction--fortschritt-abrufen-plan-anzeigen-sofortformular",
  "actions-updatecopyaction--anzeigentext-bearbeiten",
  "actions-regenerateimageaction--bild-neu-erzeugen",
  "actions-buildrunaction--kampagne-bei-meta-anlegen-pausiert",
  "actions-cleanuprunaction--angelegte-kampagne-bei-meta-loeschen-formular",
  "page--verlauf-der-laeufe",
].join(" ");

// Kampagne mit KI (Einstieg aus Kundenakte › Kampagne & Leads): KI-Team erstellt Anzeigen, Texte und Formular und legt
// die Kampagne pausiert an; Verlauf der Läufe daneben. Inhalt und Actions wie /admin/kunden/[id]/kampagne.
export default async function KundeKampagneKi({ params }: { params: Promise<{ id: string }> }) {
  await requireAuth();
  const { id } = await params;
  const c = await prisma.customer.findUnique({ where: { id }, select: { name: true } });
  if (!c) notFound();
  return (
    <Seite titel="Kampagne mit KI" untertitel="Angelegt wird pausiert, veröffentlicht wird von Hand." zurueck={{ href: `/admin/neu/kunden/${id}/leads`, label: kurzName(c.name) }}>
      <div className="-mt-5" data-funktion={FUNKTIONEN}>
        <KundenKampagne params={Promise.resolve({ id })} />
      </div>
    </Seite>
  );
}
