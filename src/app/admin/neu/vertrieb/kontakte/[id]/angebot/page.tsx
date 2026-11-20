import { notFound } from "next/navigation";
import { Seite } from "@/components/admin-neu/ui/seite";
import { kontaktPfad } from "@/components/admin-neu/vertrieb/listen";
import { AngebotErstellen, bearbeitenId, ladeAngebotKontakt } from "@/components/vertrieb/angebot-erstellen";
import { shortName } from "@/lib/vertrieb/crm";
import { requireAuth } from "@/lib/vertrieb/auth";

export const metadata = { title: "Angebot erstellen | performancegrowth Admin" };

// Angebot erstellen: dasselbe Formular wie /admin/vertrieb/kontakte/[id]/angebot (components/vertrieb/angebot-erstellen.tsx,
// components/offer-form.tsx, Server Action createOfferAction). Nach dem Speichern zurück zur Kontaktakte (#angebot),
// dort Versand per E-Mail, Zahlungserinnerung und Abschlussbonus (Angebotskarte).
const ANGEBOT_FORMULAR = [
  "offer-actions-createofferaction--angebot-erstellen-produkte-werbebudget-laufzeit",
  "offer-form-empfaenger--angebot-empfaenger-und-kunde-ist-vertreter-oder",
  "offer-form-paket--angebot-paket-waehlen-z-b-nur-betreuung",
  "offer-form--angebot-testangebot-0-ohne-zahlung-spaeter",
  "offer-form-verkaeufer--angebot-verkaeufer-zahlweise-und-module",
  "offer-form-zusammenfassung--angebot-zusammenfassung",
].join(" ");

export default async function AngebotErstellenPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireAuth();
  const { id } = await params;
  const bearbeiten = bearbeitenId(await searchParams);
  const c = await ladeAngebotKontakt(id);
  if (!c) notFound();
  const back = kontaktPfad(c.id);
  return (
    <Seite
      titel={bearbeiten ? "Angebot bearbeiten" : "Angebot erstellen"}
      untertitel={bearbeiten ? undefined : "Der Interessent nimmt online an und zahlt per Stripe."}
      zurueck={{ href: back, label: shortName(c.name) }}
      breit
    >
      <div className="-mt-4" data-funktion={ANGEBOT_FORMULAR}>
        <AngebotErstellen c={c} backHref={back} bearbeiten={bearbeiten} />
      </div>
    </Seite>
  );
}
