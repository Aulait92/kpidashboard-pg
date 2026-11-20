import { notFound } from "next/navigation";
import { shortName } from "@/lib/vertrieb/crm";
import { AdminBack } from "@/components/admin/admin-back";
import { AngebotErstellen, bearbeitenId, ladeAngebotKontakt, vorlageId } from "@/components/vertrieb/angebot-erstellen";

export const metadata = { title: "Angebot erstellen | Vertrieb" };

// Hinweise und Formular: components/vertrieb/angebot-erstellen.tsx (gemeinsam mit dem neuen Admin)
export default async function ContactOfferPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const bearbeiten = bearbeitenId(sp);
  const vorlage = bearbeiten ? null : vorlageId(sp);
  const c = await ladeAngebotKontakt(id);
  if (!c) notFound();
  const back = `/admin/vertrieb/kontakte/${c.id}`;

  return (
    <div className="mx-auto w-full max-w-6xl">
      <AdminBack href={back}>{shortName(c.name)}</AdminBack>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{bearbeiten ? "Angebot bearbeiten" : vorlage ? "Angebot duplizieren" : "Angebot erstellen"}</h1>
      {bearbeiten ? null : (
        <p className="mt-1 text-sm text-[color:var(--muted)]">
          Preise nach Preisliste, Sonderkonditionen jederzeit möglich. Nach der Online-Annahme rückt der Kontakt in der
          Kunden-Pipeline auf „Vertrag“, nach eingerichteter Zahlung auf „Onboarding“.
        </p>
      )}
      <AngebotErstellen c={c} backHref={back} bearbeiten={bearbeiten} vorlage={vorlage} />
    </div>
  );
}
