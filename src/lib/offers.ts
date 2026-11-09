// Angebote / Auftragsbestätigungen aus dem Cold-CRM: anlegen (Konditionen
// werden eingefroren), per geheimem Link anzeigen, online annehmen.

import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getAppUrl } from "@/lib/email";
import { updateSalesDeal } from "@/lib/airtable-sales-write";
import { sendToAdmins } from "@/lib/push";
import { reportError } from "@/lib/monitoring";
import { computeOfferPrice, type OfferProduct, type OfferTerm } from "@/lib/offer-pricing";

export const WON_STATUS = "Serienbetrieb";
export const OFFER_SENT_STATUS = "Angebot verschickt";

export type OfferFormInput = {
  contactName: string;
  company?: string | null;
  email?: string | null;
  street?: string | null;
  zip?: string | null;
  city?: string | null;
  term: OfferTerm;
  products: OfferProduct[];
  setupOverride?: number | null;
  monthlyOverride?: number | null;
  introMonthlyFee?: number | null;
  introMonths?: number | null;
  specialTerms?: string | null;
  startDate?: string | null; // YYYY-MM-DD
  validDays?: number;
};

/** Rechtstexte, denen bei der Annahme zugestimmt wird (per Umgebungsvariable). */
export function legalUrls() {
  let base: string | null = null;
  try {
    base = getAppUrl();
  } catch {
    base = null;
  }
  // Standard: eigene Seiten /rechtliches/agb und /rechtliches/avv (Stand im
  // Seitenkopf). Per Umgebungsvariable auf andere URLs umstellbar.
  return {
    termsUrl: process.env.OFFER_TERMS_URL?.trim() || (base ? `${base}/rechtliches/agb` : null),
    dpaUrl: process.env.OFFER_DPA_URL?.trim() || (base ? `${base}/rechtliches/avv` : null),
  };
}

async function nextOfferNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `PG-${year}-`;
  const last = await prisma.offer.findFirst({
    where: { number: { startsWith: prefix } },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  const n = last ? Number(last.number.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(n).padStart(4, "0")}`;
}

export async function createOffer(dealId: string, input: OfferFormInput, createdById: string | null) {
  const products = input.products
    .map((p) => ({ name: p.name.trim(), dailyBudget: Math.max(0, Number(p.dailyBudget) || 0) }))
    .filter((p) => p.name);
  if (!input.contactName.trim()) throw new Error("Bitte einen Ansprechpartner angeben.");
  if (products.length === 0) throw new Error("Bitte mindestens ein Produkt angeben.");

  const price = computeOfferPrice({
    term: input.term,
    products,
    setupOverride: input.setupOverride,
    monthlyOverride: input.monthlyOverride,
  });
  if (price.monthlyFee == null) {
    throw new Error("Ab 10.000 € Werbebudget gibt es keinen Listenpreis – bitte die Monatsgebühr individuell eintragen.");
  }

  const { termsUrl, dpaUrl } = legalUrls();
  const validUntil = new Date(Date.now() + (input.validDays ?? 14) * 24 * 60 * 60 * 1000);

  // Nummer kann bei gleichzeitigem Anlegen kollidieren → wenige Versuche.
  for (let attempt = 0; attempt < 3; attempt++) {
    const number = await nextOfferNumber();
    try {
      return await prisma.$transaction(async (tx) => {
        const previous = await tx.offer.findMany({
          where: { dealId, status: { in: ["draft", "sent"] } },
          select: { id: true, version: true },
        });
        const maxVersion = await tx.offer.aggregate({ where: { dealId }, _max: { version: true } });
        if (previous.length) {
          await tx.offer.updateMany({
            where: { id: { in: previous.map((p) => p.id) } },
            data: { status: "superseded" },
          });
        }
        return tx.offer.create({
          data: {
            dealId,
            number,
            version: (maxVersion._max.version ?? 0) + 1,
            token: crypto.randomBytes(24).toString("base64url"),
            contactName: input.contactName.trim(),
            company: input.company?.trim() || null,
            email: input.email?.trim() || null,
            street: input.street?.trim() || null,
            zip: input.zip?.trim() || null,
            city: input.city?.trim() || null,
            term: input.term,
            products,
            setupFee: price.setupFee,
            monthlyFee: price.monthlyFee!,
            softwareFee: price.softwareFee,
            introMonthlyFee: input.introMonthlyFee ?? null,
            introMonths: input.introMonthlyFee != null ? (input.introMonths ?? null) : null,
            specialTerms: input.specialTerms?.trim() || null,
            startDate: input.startDate ? new Date(`${input.startDate}T12:00:00Z`) : null,
            validUntil,
            termsUrl,
            dpaUrl,
            createdById,
          },
        });
      });
    } catch (err) {
      const unique = err instanceof Error && /Unique constraint|P2002/.test(err.message);
      if (!unique || attempt === 2) throw err;
    }
  }
  throw new Error("Angebotsnummer konnte nicht vergeben werden.");
}

export async function getOfferByToken(token: string) {
  if (!token || token.length < 20) return null;
  return prisma.offer.findUnique({ where: { token } });
}

export type AcceptResult = { ok: true } | { ok: false; error: string };

export async function acceptOffer(
  token: string,
  opts: { name: string; ip: string | null; agent: string | null; termsAccepted: boolean },
): Promise<AcceptResult> {
  const offer = await getOfferByToken(token);
  if (!offer) return { ok: false, error: "Angebot nicht gefunden." };
  if (offer.status === "accepted") return { ok: true };
  if (offer.status === "superseded") return { ok: false, error: "Dieses Angebot wurde durch eine neuere Version ersetzt." };
  if (offer.validUntil.getTime() < Date.now()) return { ok: false, error: "Dieses Angebot ist abgelaufen. Bitte fordere ein neues an." };
  if (!offer.termsUrl || !offer.dpaUrl) return { ok: false, error: "Die Online-Annahme ist für dieses Angebot noch nicht freigeschaltet." };
  if (!opts.termsAccepted) return { ok: false, error: "Bitte bestätige AGB und Auftragsverarbeitungsvertrag." };
  const name = opts.name.trim();
  if (name.length < 3) return { ok: false, error: "Bitte gib deinen vollständigen Namen ein." };

  const now = new Date();
  const updated = await prisma.offer.updateMany({
    where: { id: offer.id, status: { in: ["draft", "sent"] } },
    data: {
      status: "accepted",
      acceptedAt: now,
      acceptedName: name.slice(0, 200),
      acceptedIp: opts.ip?.slice(0, 100) ?? null,
      acceptedAgent: opts.agent?.slice(0, 400) ?? null,
    },
  });
  if (updated.count === 0) return { ok: false, error: "Dieses Angebot kann nicht mehr angenommen werden." };

  // Deal auf „gewonnen“ setzen (Airtable + DB) und in der Historie vermerken.
  try {
    const deal = await prisma.deal.findUnique({
      where: { id: offer.dealId },
      select: { id: true, airtableId: true, status: true, wonAt: true, closeDate: true },
    });
    if (deal) {
      const closeDate = deal.closeDate ?? now;
      if (deal.airtableId) {
        await updateSalesDeal({
          airtableId: deal.airtableId,
          status: WON_STATUS,
          closeDate: closeDate.toISOString().slice(0, 10),
        });
      }
      await prisma.$transaction([
        prisma.deal.update({
          where: { id: deal.id },
          data: { status: WON_STATUS, wonAt: deal.wonAt ?? now, lostAt: null, closeDate },
        }),
        prisma.dealActivity.create({
          data: {
            dealId: deal.id,
            kind: "status_change",
            title: `Angebot ${offer.number} online angenommen von ${name}`,
            body: `Status: ${deal.status ?? "—"} → ${WON_STATUS}`,
            metadata: { fromStatus: deal.status, toStatus: WON_STATUS, offerId: offer.id },
          },
        }),
      ]);
    }
  } catch (err) {
    // Die Annahme selbst ist gespeichert; Deal-Status notfalls von Hand nachziehen.
    reportError(err, "offer-accept-deal-update", { offer: offer.number });
  }

  await sendToAdmins({
    title: `✅ Angebot angenommen: ${offer.company ?? offer.contactName}`,
    body: `${offer.number} · ${name}`,
    url: `/admin/crm/${offer.dealId}`,
    tag: `offer:${offer.id}`,
  }).catch((err) => reportError(err, "offer-accept-push"));

  return { ok: true };
}

export async function markOfferViewed(id: string) {
  await prisma.offer
    .updateMany({ where: { id, viewedAt: null }, data: { viewedAt: new Date() } })
    .catch(() => {});
}
