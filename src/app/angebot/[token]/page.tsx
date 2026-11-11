import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { OfferDocument, toOfferDoc } from "@/components/offer-document";
import { getCurrentSession } from "@/lib/auth";
import { getOfferByToken, markOfferViewed } from "@/lib/offers";
import { AcceptForm } from "./accept-form";
import { PayButton } from "./pay-button";
import { billingEnabled } from "@/lib/billing";
import { CheckCircle2, Clock } from "lucide-react";
import { nowMs } from "@/lib/now";

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
  searchParams: Promise<{ print?: string; zahlung?: string }>;
}) {
  const { token } = await params;
  const { print, zahlung } = await searchParams;
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

  const expired = offer.validUntil.getTime() < nowMs();
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
        {offer.status === "accepted" ? (
          <PaymentBox
            token={token}
            status={offer.paymentStatus}
            returned={zahlung ?? null}
            enabled={billingEnabled()}
          />
        ) : null}
        <OfferDocument offer={doc} collapseAgb />
        {offer.status === "accepted" ? null : (
          <div id="annehmen" className="mx-auto mt-6 max-w-[880px] scroll-mt-4 rounded-[20px] border border-[#e5e7eb] bg-white px-6 py-8 sm:px-12">
            <section>
              <h2 className="text-lg font-bold">Angebot annehmen</h2>
              {offer.status === "superseded" ? (
                <p className="mt-2 text-sm text-[color:var(--muted)]">
                  Dieses Angebot wurde durch eine neuere Version ersetzt. Bitte nutzen Sie den Link aus der letzten E-Mail.
                </p>
              ) : expired ? (
                <p className="mt-2 text-sm text-[color:var(--muted)]">
                  Dieses Angebot ist abgelaufen. Melden Sie sich gern, wir schicken Ihnen ein aktuelles.
                </p>
              ) : canAccept ? (
                <div className="mt-4">
                  <AcceptForm token={token} termsUrl={offer.termsUrl!} dpaUrl={offer.dpaUrl!} defaultName={offer.contactName} />
                </div>
              ) : (
                <p className="mt-2 text-sm text-[color:var(--muted)]">
                  Bitte bestätigen Sie das Angebot kurz per E-Mail oder im Gespräch, wir schalten die Online-Annahme in
                  Kürze frei.
                </p>
              )}
            </section>
          </div>
        )}
        {canAccept && offer.status !== "accepted" ? (
          // Immer sichtbar: direkt zur Annahme springen (die Seite ist lang).
          <>
            <div className="h-20" />
            <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#e5e7eb] bg-white/95 px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 backdrop-blur">
              <div className="mx-auto flex max-w-[880px] items-center justify-between gap-3">
                <span className="hidden text-sm text-[#374151] sm:block">Alles klar? Dann hier annehmen.</span>
                <a
                  href="#annehmen"
                  className="inline-flex h-12 w-full items-center justify-center rounded-[var(--radius-md)] bg-[color:var(--brand)] px-6 text-[15px] font-semibold text-white hover:bg-[color:var(--brand-dark)] sm:w-auto"
                >
                  Angebot annehmen
                </a>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}

function PaymentBox({
  token,
  status,
  returned,
  enabled,
}: {
  token: string;
  status: string;
  returned: string | null;
  enabled: boolean;
}) {
  const box = "mx-auto mb-6 max-w-[880px] rounded-[20px] border px-6 py-5 sm:px-10";
  if (status === "paid") {
    return (
      <div className={`${box} flex items-start gap-3 border-emerald-200 bg-emerald-50 text-emerald-900`}>
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <div className="font-semibold">Zahlung erhalten. Vielen Dank!</div>
          <p className="mt-1 text-sm">Wir melden uns in Kürze für den Onboarding-Termin. Ihre Rechnung kommt per E-Mail.</p>
        </div>
      </div>
    );
  }
  if (status === "processing" || returned === "ok") {
    return (
      <div className={`${box} flex items-start gap-3 border-sky-200 bg-sky-50 text-sky-900`}>
        <Clock className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <div className="font-semibold">Zahlung eingerichtet. Vielen Dank!</div>
          <p className="mt-1 text-sm">
            Bei SEPA-Lastschrift dauert die Bestätigung ein paar Tage. Wir melden uns in Kürze für den
            Onboarding-Termin.
          </p>
        </div>
      </div>
    );
  }
  if (!enabled) return null;
  return (
    <div className={`${box} border-[#e5e7eb] bg-white`}>
      <div className="font-semibold">
        {returned === "abgebrochen" ? "Die Zahlung wurde nicht abgeschlossen." : "Angebot angenommen. Es fehlt nur noch die Zahlung."}
      </div>
      <p className="mb-4 mt-1 text-sm text-[color:var(--muted)]">
        Richten Sie jetzt SEPA-Lastschrift oder Karte ein. Fällig ist jetzt nur das Setup; die laufende Vergütung (monatlich bzw. bei Jahreszahlung jährlich) wird ab dem Startdatum automatisch eingezogen. Die Zahlung läuft sicher über Stripe.
      </p>
      <PayButton token={token} />
    </div>
  );
}
