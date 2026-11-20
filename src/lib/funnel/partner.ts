// Öffentliche Partnerliste der eigenen Funnels (Auflage L2, docs/recht/pkv-funnel.md): alle Abnehmer, die Leads aus
// dem Funnel bekommen können, mit Firma, Name, Sitz und Registernummer nach § 34d GewO. Automatisch aus denselben
// Bezügen, die die Pool-Verteilung beliefert (lib/ppl/engine.ts distribute: LeadSubscription aktiv, Kunde nicht
// ruhend), ohne Testkunden. Angaben aus der Erstinformation (§ 15 VersVermV), Registernummer ersatzweise aus der
// Registerprüfung (Customer.vermittlerRegisterNr). Fehlt etwas, steht der Abnehmer trotzdem mit Firma und Ort da.

import { prisma } from "@/lib/prisma";
import { resolvePplProduct } from "@/lib/ppl/produkt-key";
import type { FunnelDef } from "@/lib/funnel/definition";

export type PartnerRoh = {
  customerId: string;
  kundeName: string;
  isTest: boolean;
  ruhend: boolean;
  aktiv: boolean;
  aktualisiert: Date;
  erstinfo: { name: string | null; firma: string | null; anschrift: string | null; registerNummer: string | null } | null;
  registerNr: string | null;
  /** Angaben für die Partnerliste am Kunden (gehen vor; z. B. Vertriebspartner eines Maklers) */
  partnerAngaben?: { firma: string | null; anschrift: string | null; registerNr: string | null } | null;
};

export type Partner = {
  firma: string;
  name: string | null;
  ort: string | null;
  registerNummer: string | null;
  /** Angaben, die für die Liste fehlen (nur intern, nicht auf der Seite) */
  fehlt: string[];
};

const t = (v: string | null | undefined) => (v ?? "").replace(/\s+/g, " ").trim();

/** Ort aus einer Anschrift („Musterstr. 1, 12345 Berlin“ bzw. mehrzeilig): Text nach der Postleitzahl. */
export function ortAusAnschrift(anschrift: string | null | undefined): string | null {
  const m = /\b\d{5}\s+([^,\n]+)/.exec(anschrift ?? "");
  const ort = t(m?.[1]).replace(/[.;]+$/, "");
  return ort || null;
}

/** Registernummer im Format D-XXXX-XXXXX-XX (Großbuchstaben); sonst null. */
export function registerNummer(raw: string | null | undefined): string | null {
  const v = t(raw).toUpperCase();
  return /^D-[A-Z0-9]{4}-[A-Z0-9]{5}-[A-Z0-9]{2}$/.test(v) ? v : null;
}

/**
 * Liste aus den Bezügen (rein): nur aktive Bezüge, ohne Testkunden und ruhende Konten, je Kunde einmal, nach Firma.
 * Stand = letzte Änderung eines gelisteten Bezugs.
 */
export function partnerAus(rows: PartnerRoh[]): { partner: Partner[]; stand: Date | null } {
  const je = new Map<string, Partner>();
  let stand: Date | null = null;
  for (const r of rows) {
    if (!r.aktiv || r.isTest || r.ruhend) continue;
    if (!stand || r.aktualisiert > stand) stand = r.aktualisiert;
    if (je.has(r.customerId)) continue;
    const e = r.erstinfo;
    const p = r.partnerAngaben;
    const firma = t(p?.firma) || t(e?.firma) || t(r.kundeName);
    // Ansprechpartner: Name aus der Erstinformation, bei eigenen Partner-Angaben der Kontoname (z. B. Vertriebspartner)
    const name = (t(p?.firma) ? t(r.kundeName) : t(e?.name)) || null;
    const ort = ortAusAnschrift(p?.anschrift) ?? ortAusAnschrift(e?.anschrift);
    const reg = registerNummer(p?.registerNr) ?? registerNummer(e?.registerNummer) ?? registerNummer(r.registerNr);
    const fehlt = [...(!t(p?.firma) && !t(e?.firma) ? ["Firma (Erstinformation oder Partner-Angaben)"] : []), ...(!name ? ["Name"] : []), ...(!ort ? ["Sitz (Ort)"] : []), ...(!reg ? ["Registernummer § 34d"] : [])];
    je.set(r.customerId, { firma, name: name && name !== firma ? name : null, ort, registerNummer: reg, fehlt });
  }
  const partner = [...je.values()].sort((a, b) => a.firma.localeCompare(b.firma, "de"));
  return { partner, stand };
}

/** Partnerliste eines Funnels aus der Datenbank (Produkt wie beim Absenden, PKV_FUNNEL_PRODUKT geht vor). */
export async function ladePartner(f: FunnelDef): Promise<{ partner: Partner[]; stand: Date | null }> {
  const { productKey } = await resolvePplProduct(process.env.PKV_FUNNEL_PRODUKT?.trim() || f.produkt);
  const subs = await prisma.leadSubscription.findMany({
    where: { productKey, active: true },
    select: {
      customerId: true,
      active: true,
      updatedAt: true,
      customer: {
        select: {
          name: true,
          isTest: true,
          dormantSince: true,
          vermittlerRegisterNr: true,
          partnerFirma: true,
          partnerAnschrift: true,
          partnerRegisterNr: true,
          erstinformation: { select: { name: true, firma: true, anschrift: true, registerNummer: true } },
        },
      },
    },
  });
  return partnerAus(
    subs.map((s) => ({
      customerId: s.customerId,
      kundeName: s.customer.name,
      isTest: s.customer.isTest,
      ruhend: !!s.customer.dormantSince,
      aktiv: s.active,
      aktualisiert: s.updatedAt,
      erstinfo: s.customer.erstinformation,
      registerNr: s.customer.vermittlerRegisterNr,
      partnerAngaben: { firma: s.customer.partnerFirma, anschrift: s.customer.partnerAnschrift, registerNr: s.customer.partnerRegisterNr },
    })),
  );
}
