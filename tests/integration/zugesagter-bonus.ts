// Abschlussbonus seit 21.11.2026 abgeschafft (Ole): createOffer gibt neuen Angeboten keinen Bonus mehr. Für Tests der
// Altfälle (Bonus schon zugesagt, gilt bis zur Frist bzw. bei Annahme wie vereinbart) direkt am Angebot setzen,
// auf die Einrichtung gedeckelt wie früher beim Anlegen.
import { prisma } from "@/lib/prisma";
import { berlinTagesendeIso } from "@/lib/offer-pricing";

/** Bonus `betrag` (netto) mit Frist bis 23:59 Uhr Berlin am Tag `bisIso` (null = Versandtag) an ein Angebot hängen. */
export async function zugesagterBonus(offerId: string, betrag: number, bisIso: string | null = null) {
  const o = await prisma.offer.findUniqueOrThrow({ where: { id: offerId } });
  const b = Math.min(betrag, Number(o.setupFee));
  return prisma.offer.update({
    where: { id: offerId },
    data: { abschlussBonus: b > 0 ? b : null, abschlussBonusBis: b > 0 && bisIso ? berlinTagesendeIso(bisIso) : null },
  });
}
