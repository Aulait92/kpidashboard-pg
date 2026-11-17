import { OfferForm } from "@/components/offer-form";
import { mahnwesenAktiv } from "@/lib/mahnwesen";
import { legalUrls } from "@/lib/offers";
import { prisma } from "@/lib/prisma";
import { loadReferralSettings, referralForContact, referralSetupDiscount } from "@/lib/kollegen";
import { benefitSentence } from "@/lib/kollegen-shared";
import { eur } from "@/lib/offer-pricing";

// „Angebot erstellen“ für einen Vertriebskontakt: Hinweise (AGB-Links, Empfehlung) und das Angebotsformular mit
// Vorbelegung. Gemeinsam für /admin/vertrieb/kontakte/[id]/angebot und /admin/neu/vertrieb/kontakte/[id]/angebot.

export function ladeAngebotKontakt(id: string) {
  return prisma.salesContact.findUnique({
    where: { id },
    select: {
      id: true, name: true, email: true, street: true, zip: true, city: true,
      salutation: true, firstName: true, lastName: true, leaderNames: true, products: true,
    },
  });
}

type AngebotKontakt = NonNullable<Awaited<ReturnType<typeof ladeAngebotKontakt>>>;

/** `backHref`: Kontaktakte, zu der das Formular nach dem Speichern zurückkehrt (#angebot). */
export async function AngebotErstellen({ c, backHref }: { c: AngebotKontakt; backHref: string }) {
  const legal = legalUrls();
  const person = [c.firstName, c.lastName].filter(Boolean).join(" ") || c.leaderNames?.split(",")[0]?.trim() || "";
  // „Kollegen empfehlen“: Neukunden-Vorteil als Hinweis bzw. Vorbelegung
  const referral = await referralForContact(c.id);
  const settings = referral ? await loadReferralSettings() : null;
  const benefit = settings ? benefitSentence(settings) : null;
  // Rabatt auf die Einrichtung: automatisch vorbelegt, wenn berechtigt; sonst 0 mit Grund (übersteuerbar)
  const discount = referral && settings?.benefitKind === "setup_discount" ? await referralSetupDiscount(c.id) : null;

  return (
    <>
      {!legal.termsUrl || !legal.dpaUrl ? (
        <p className="mt-4 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Online-Annahme noch nicht freigeschaltet: Bitte die Links zu AGB und Auftragsverarbeitungsvertrag hinterlegen.
        </p>
      ) : null}
      {referral ? (
        <p className="mt-4 rounded-[var(--radius-md)] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" data-angebot-empfehlung>
          Empfohlen von {referral.referrer.name}.{" "}
          {discount
            ? discount.eligible
              ? `Empfehlungsrabatt: ${eur(discount.amount)} auf die Einrichtung, ist unten vorbelegt und wird automatisch abgezogen.`
              : `Kein automatischer Empfehlungsrabatt: ${discount.reason}. Bei Bedarf unten von Hand eintragen.`
            : benefit
              ? settings?.benefitKind === "setup_free"
                ? "Neukunden-Vorteil: Einrichtung gratis, ist unten vorbelegt."
                : `Neukunden-Vorteil: ${benefit} (bitte als Sonderkondition eintragen).`
              : "Kein Neukunden-Vorteil eingestellt."}
        </p>
      ) : null}
      <div className="mt-6">
        <OfferForm
          target={{ salesContactId: c.id }}
          ueberweisungVerfuegbar={mahnwesenAktiv()}
          backHref={backHref}
          referralDiscount={
            discount
              ? {
                  amount: discount.eligible ? discount.amount : 0,
                  label: discount.label,
                  note: discount.eligible ? null : `Nicht automatisch: ${discount.reason}.`,
                }
              : null
          }
          initial={{
            contactName: person,
            company: c.name,
            email: c.email,
            product: c.products?.split(",")[0]?.trim() ?? "",
            street: c.street ?? "",
            zip: c.zip ?? "",
            city: c.city ?? "",
            ...(referral && settings?.benefitKind === "setup_free"
              ? { setupOverride: "0", specialTerms: `Empfehlung von ${referral.referrer.name}: Einrichtung ohne Gebühr.` }
              : {}),
          }}
        />
      </div>
    </>
  );
}
