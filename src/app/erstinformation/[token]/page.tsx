import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { statusRegisterText } from "@/lib/erstinformation-shared";

// Öffentliche Erstinformation eines Vermittlers (§ 15/16 VersVermV), verlinkt in der ersten WhatsApp-Nachricht
// des Assistenten. Link hinterlegt → Weiterleitung, PDF hochgeladen → PDF, sonst die Pflichtangaben aus der
// Einrichtung (Name, Anschrift, Status, Registernummer, Register und Schlichtungsstellen).
export const dynamic = "force-dynamic";
export const metadata = { title: "Erstinformation", robots: { index: false, follow: false } };

type Props = { params: Promise<{ token: string }> };

export default async function ErstinformationPage({ params }: Props) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(token)) notFound();
  const e = await prisma.erstinformation.findUnique({
    where: { token },
    select: {
      url: true,
      fileName: true,
      registerNummer: true,
      customer: { select: { name: true, vermittlerTyp: true, onboarding: { select: { websiteInfo: true } } } },
    },
  });
  if (!e) notFound();
  if (e.url) redirect(e.url);
  if (e.fileName) redirect(`/erstinformation/${token}/pdf`);

  const web = (e.customer.onboarding?.websiteInfo ?? {}) as { companyName?: string | null; address?: string | null; phone?: string | null; email?: string | null };
  const name = web.companyName?.trim() || e.customer.name;
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6">
      <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-6 text-[15px] leading-relaxed">
        <h1 className="text-xl font-bold">Erstinformation</h1>
        <p className="mt-1 text-sm text-[color:var(--muted)]">Angaben nach § 15 Versicherungsvermittlungsverordnung</p>
        <dl className="mt-5 space-y-3">
          <div>
            <dt className="text-sm text-[color:var(--muted)]">Vermittler</dt>
            <dd className="font-medium">{name}</dd>
            {web.address ? <dd className="whitespace-pre-line">{web.address}</dd> : null}
            {web.phone ? <dd>Telefon: {web.phone}</dd> : null}
            {web.email ? <dd>E-Mail: {web.email}</dd> : null}
          </div>
          <div>
            <dt className="text-sm text-[color:var(--muted)]">Status</dt>
            <dd>{statusRegisterText(e.customer.vermittlerTyp)}</dd>
          </div>
          {e.registerNummer ? (
            <div>
              <dt className="text-sm text-[color:var(--muted)]">Registernummer</dt>
              <dd>{e.registerNummer}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-sm text-[color:var(--muted)]">Vermittlerregister</dt>
            <dd>
              Deutscher Industrie- und Handelskammertag (DIHK) e. V., Breite Straße 29, 10178 Berlin,{" "}
              <a href="https://www.vermittlerregister.info" target="_blank" rel="noreferrer" className="text-[color:var(--brand)] underline">
                www.vermittlerregister.info
              </a>
            </dd>
          </div>
          <div>
            <dt className="text-sm text-[color:var(--muted)]">Schlichtungsstellen</dt>
            <dd>Versicherungsombudsmann e. V., Postfach 08 06 32, 10006 Berlin, www.versicherungsombudsmann.de</dd>
            <dd>Ombudsmann Private Kranken- und Pflegeversicherung, Postfach 06 02 22, 10052 Berlin, www.pkv-ombudsmann.de</dd>
          </div>
        </dl>
        <p className="mt-5 text-sm text-[color:var(--muted)]">
          Weitere Angaben, zum Beispiel zu Beteiligungen an Versicherungsunternehmen und zur Vergütung, erhalten Sie von {name} persönlich.
        </p>
      </div>
    </main>
  );
}
