import { OfferForm } from "@/components/offer-form";
import { ueberweisungAktiv } from "@/lib/mahnwesen";
import { legalUrls } from "@/lib/offers";
import { prisma } from "@/lib/prisma";
import { loadReferralSettings, referralForContact, referralSetupDiscount } from "@/lib/kollegen";
import { benefitSentence } from "@/lib/kollegen-shared";
import { eur } from "@/lib/offer-pricing";
import { entwurfZuFormWerte } from "@/lib/offer-form-werte";
import { ButtonLink } from "@/components/ui";

// „Angebot erstellen“ für einen Vertriebskontakt: Hinweise (AGB-Links, Empfehlung) und das Angebotsformular mit
// Vorbelegung. Gemeinsam für /admin/vertrieb/kontakte/[id]/angebot und /admin/neu/vertrieb/kontakte/[id]/angebot.
// Mit ?bearbeiten=<Angebots-ID> (Knopf „Bearbeiten“ in der Angebotskarte): dasselbe Formular, vorbefüllt mit dem Entwurf.

/** Angebots-ID aus ?bearbeiten=… (oder null). */
export function bearbeitenId(sp: { [key: string]: string | string[] | undefined }): string | null {
  const v = sp.bearbeiten;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Angebots-ID aus ?vorlage=… (Duplizieren, Ole 20.11.2026: als neuen Entwurf anlegen) oder null. */
export function vorlageId(sp: { [key: string]: string | string[] | undefined }): string | null {
  const v = sp.vorlage;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

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

/**
 * `backHref`: Kontaktakte, zu der das Formular nach dem Speichern zurückkehrt (#angebot).
 * `bearbeiten`: ID eines Entwurfs dieses Kontakts, der bearbeitet wird (sonst neues Angebot).
 */
export async function AngebotErstellen({ c, backHref, bearbeiten = null, vorlage = null }: { c: AngebotKontakt; backHref: string; bearbeiten?: string | null; vorlage?: string | null }) {
  const legal = legalUrls();
  const quelle = bearbeiten ?? vorlage;
  const entwurf = quelle ? await prisma.offer.findFirst({ where: { id: quelle, salesContactId: c.id } }) : null;
  // Duplizieren: jedes Angebot dieses Kontakts als Vorlage für einen neuen Entwurf
  const duplikat = !bearbeiten && !!vorlage && !!entwurf;
  // Verschickt (Ole, 20.11.2026): vorbefüllt bearbeiten, Speichern legt eine neue Version an
  const neueVersion = duplikat || entwurf?.status === "sent";
  if (quelle && entwurf?.status !== "draft" && !neueVersion) {
    // Angenommen bzw. ersetzt: nicht bearbeiten, sondern neue Version
    return (
      <div className="mt-6 flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" data-angebot-nicht-bearbeitbar>
        <span className="min-w-0 flex-1">
          {entwurf ? `Angebot ${entwurf.number} ist kein Entwurf mehr und lässt sich nicht bearbeiten.` : "Angebot nicht gefunden."}
        </span>
        <ButtonLink href={`${backHref}/angebot`}>Neue Version</ButtonLink>
      </div>
    );
  }
  const person = [c.firstName, c.lastName].filter(Boolean).join(" ") || c.leaderNames?.split(",")[0]?.trim() || "";
  // „Kollegen empfehlen“: Neukunden-Vorteil als Hinweis bzw. Vorbelegung
  const referral = await referralForContact(c.id);
  const settings = referral ? await loadReferralSettings() : null;
  const benefit = settings ? benefitSentence(settings) : null;
  // Rabatt auf die Einrichtung: automatisch vorbelegt, wenn berechtigt; sonst 0 mit Grund (übersteuerbar)
  const discount = referral && settings?.benefitKind === "setup_discount" ? await referralSetupDiscount(c.id) : null;
  const referralDiscount = discount
    ? {
        amount: discount.eligible ? discount.amount : 0,
        label: discount.label,
        note: discount.eligible ? null : `Nicht automatisch: ${discount.reason}.`,
      }
    : null;

  // Abschlussbonus (Ole, 21.11.2026: abgeschafft): nur ein zugesagter Bonus eines offenen Angebots (Entwurf oder
  // verschickt) geht in die neue Version mit; ein Duplikat eines abgeschlossenen Angebots bekommt keinen
  const formWerte = (o: NonNullable<typeof entwurf>) => {
    const w = entwurfZuFormWerte(o, referralDiscount);
    return o.status === "draft" || o.status === "sent" ? w : { ...w, bonusVorhanden: false, bonusAn: false };
  };

  return (
    <>
      {!legal.termsUrl || !legal.dpaUrl ? (
        <p className="mt-4 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Online-Annahme noch nicht freigeschaltet: Bitte die Links zu AGB und Auftragsverarbeitungsvertrag hinterlegen.
        </p>
      ) : null}
      {referral && !entwurf ? (
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
          key={entwurf?.id ?? "neu"}
          target={{ salesContactId: c.id }}
          ueberweisungVerfuegbar={ueberweisungAktiv()}
          backHref={backHref}
          referralDiscount={referralDiscount}
          entwurf={entwurf ? { offerId: entwurf.id, werte: formWerte(entwurf), neueVersion, duplikat } : undefined}
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
