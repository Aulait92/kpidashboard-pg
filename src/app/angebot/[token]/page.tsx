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

  // Druckansicht für das PDF: Deckblatt (randlos) und Inhalt (mit Rändern)
  // werden getrennt gerendert und im PDF-Endpunkt zusammengefügt.
  if (print === "cover" || print === "body") {
    return (
      <main className="bg-white">
        <style>{`
          @page { size: A4; margin: ${print === "cover" ? "0" : "16mm 18mm 20mm"}; }
          html, body { background: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .offer-doc { max-width: none !important; }
          .offer-doc table { table-layout: fixed; }
          .offer-doc td, .offer-doc th { overflow-wrap: anywhere; }
        `}</style>
        <OfferDocument offer={doc} part={print} />
      </main>
    );
  }

  // Aufrufe durch eingeloggte Admins (Vorschau) zählen nicht als „gesehen“.
  const session = await getCurrentSession().catch(() => null);
  if (session?.role !== "ADMIN") await markOfferViewed(offer.id);

  const expired = offer.validUntil.getTime() < Date.now();
  const canAccept = (offer.status === "draft" || offer.status === "sent") && !expired && offer.termsUrl && offer.dpaUrl;

  return (
    <main className="min-h-screen bg-[#eef2f8] px-3 py-6 sm:px-4 sm:py-12">
      <div className="mx-auto max-w-[920px]">
        <div className="mb-4 flex justify-end">
          <a
            href={`/angebot/${token}/pdf`}
            className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-sm font-semibold shadow-[var(--shadow-sm)] hover:bg-[color:var(--surface-sunken)]"
          >
            <Download className="h-4 w-4" /> Als PDF herunterladen
          </a>
        </div>
        <OfferDocument offer={doc} />
        {offer.status === "accepted" ? null : (
          <div className="mx-auto mt-6 max-w-[880px] rounded-[20px] border border-[#e5e7eb] bg-white px-6 py-8 sm:px-12">
            <section>
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
          </div>
        )}
      </div>
    </main>
  );
}
