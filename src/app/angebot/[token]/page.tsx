import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { OfferDocument, toOfferDoc } from "@/components/offer-document";
import { getCurrentSession } from "@/lib/auth";
import { getOfferByToken, markOfferViewed } from "@/lib/offers";
import { AcceptForm } from "./accept-form";

// Öffentliches Angebot per geheimem Link. ?print=1 liefert die reine
// Druckansicht (für das PDF).
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Ihr Angebot · performancegrowth",
  robots: { index: false, follow: false },
};


export default async function OfferPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ print?: string }>;
}) {
  const { token } = await params;
  const { print } = await searchParams;
  const offer = await getOfferByToken(token);
  if (!offer) notFound();
  const doc = toOfferDoc(offer);

  if (print === "1") {
    return (
      <main className="bg-white px-10 py-10">
        <style>{"html,body{background:#fff!important}"}</style>
        <OfferDocument offer={doc} />
      </main>
    );
  }

  // Aufrufe durch eingeloggte Admins (Vorschau) zählen nicht als „gesehen“.
  const session = await getCurrentSession().catch(() => null);
  if (session?.role !== "ADMIN") await markOfferViewed(offer.id);

  const expired = offer.validUntil.getTime() < Date.now();
  const canAccept = (offer.status === "draft" || offer.status === "sent") && !expired && offer.termsUrl && offer.dpaUrl;

  return (
    <main className="min-h-screen bg-[color:var(--background)] px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-[920px]">
        <div className="mb-4 flex justify-end">
          <a
            href={`/angebot/${token}/pdf`}
            className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-sm font-semibold shadow-[var(--shadow-sm)] hover:bg-[color:var(--surface-sunken)]"
          >
            <Download className="h-4 w-4" /> Als PDF herunterladen
          </a>
        </div>
        <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-6 shadow-[var(--shadow-md)] sm:p-10">
          <OfferDocument offer={doc} />
          {offer.status === "accepted" ? null : (
            <section className="border-t border-[#e3e8f2] pt-8">
              <h2 className="text-lg font-bold">Angebot annehmen</h2>
              {offer.status === "superseded" ? (
                <p className="mt-2 text-sm text-[color:var(--muted)]">
                  Dieses Angebot wurde durch eine neuere Version ersetzt. Bitte nutzen Sie den Link aus der letzten E-Mail.
                </p>
              ) : expired ? (
                <p className="mt-2 text-sm text-[color:var(--muted)]">
                  Dieses Angebot ist abgelaufen. Melden Sie sich gern – wir schicken Ihnen ein aktuelles.
                </p>
              ) : canAccept ? (
                <div className="mt-4">
                  <AcceptForm token={token} termsUrl={offer.termsUrl!} dpaUrl={offer.dpaUrl!} defaultName={offer.contactName} />
                </div>
              ) : (
                <p className="mt-2 text-sm text-[color:var(--muted)]">
                  Bitte bestätigen Sie das Angebot kurz per E-Mail oder im Gespräch – wir schalten die Online-Annahme in
                  Kürze frei.
                </p>
              )}
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
