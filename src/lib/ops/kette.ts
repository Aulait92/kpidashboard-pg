// Diagnose-Abfrage „kette“ (Ole, 17.11.2026, Datenbasis für Benchmarks, Baustein 1 „Bestandsaufnahme“): nur lesend.
// Wie vollständig ist die Kette je Lead erfasst (Anzeige → Lead → erster Kontakt → Termin → Termin-Status → Angebot →
// Abschluss → Storno → Cross-Selling; Pay-per-Lead: Lieferung, Storno, Käufer-Rückmeldung)? Je Zeitraum (30/90 Tage,
// gesamt), Kundenart (Vermittler-Kunde, Pay-per-Lead) und Kunde (nur ID und Name).
// Keine Personendaten: aus der Datenbank kommen je Lead nur ja/nein, Zeitpunkte und Status, ausgegeben werden nur Zahlen.
// Testleads, Testkunden, interne Kunden und das Bewertungs-Demo zählen nicht.
//   GET /api/ops/diagnose?q=kette[&kunde=<Kunden-ID>]   (&kunde: volle Auswertung nur dieses Kunden)

import { prisma } from "@/lib/prisma";
import { isMetaLeadId } from "@/lib/capi/shared";
import { leadOrigin } from "@/lib/lead-herkunft";
import { auswerten, FEHLENDE_FELDER, imZeitraum, kompakt, kundenartFuer, kundenartKunde, ZEITRAEUME, type Herkunft, type KetteLead } from "@/lib/ops/kette-auswertung";

const DEMO_KUNDE = "cust_google_review_demo";
const BATCH = 2000;

type IdRow = { id: string };

/** Lead-IDs (nur intern als Schlüssel, nie in der Ausgabe) für Merkmale in JSON- oder Textfeldern. */
async function idSets() {
  const [formular, reentryFormular, angebotVerlauf, verschobenVerlauf, angebotTermin, tarifTermin, pool, intake, hvk, bezuege] = await Promise.all([
    prisma.$queryRaw<IdRow[]>`SELECT "id" FROM "Lead" WHERE COALESCE("consentData"->>'formId', '') <> ''`,
    prisma.$queryRaw<IdRow[]>`SELECT DISTINCT "leadId" AS "id" FROM "LeadReentry" WHERE COALESCE("formId", '') <> ''`,
    prisma.$queryRaw<IdRow[]>`SELECT DISTINCT "leadId" AS "id" FROM "LeadHistory" WHERE "text" ILIKE '%Angebot gesendet%'`,
    prisma.$queryRaw<IdRow[]>`SELECT DISTINCT "leadId" AS "id" FROM "LeadHistory" WHERE "text" ILIKE 'Termin verschoben%'`,
    prisma.$queryRaw<IdRow[]>`SELECT DISTINCT "leadId" AS "id" FROM "Appointment" WHERE "leadId" IS NOT NULL AND (("offersJson" IS NOT NULL AND "offersJson" <> 'null'::jsonb) OR ("tarifauswahl" IS NOT NULL AND "tarifauswahl" <> 'null'::jsonb))`,
    prisma.$queryRaw<IdRow[]>`SELECT DISTINCT "leadId" AS "id" FROM "Appointment" WHERE "leadId" IS NOT NULL AND "tarifauswahl" IS NOT NULL AND "tarifauswahl" <> 'null'::jsonb`,
    prisma.poolLead.findMany({ where: { leadId: { not: null } }, select: { leadId: true } }),
    prisma.pplIntake.findMany({ where: { leadId: { not: null } }, select: { leadId: true } }),
    prisma.hvkReklamation.findMany({ where: { leadId: { not: null } }, select: { leadId: true } }),
    prisma.leadSubscription.findMany({ select: { customerId: true, productKey: true } }),
  ]);
  const set = (rows: IdRow[]) => new Set(rows.map((r) => r.id));
  const set2 = (rows: { leadId: string | null }[]) => new Set(rows.map((r) => r.leadId!));
  const formularSet = set(formular);
  for (const r of reentryFormular) formularSet.add(r.id);
  return {
    formular: formularSet,
    angebotVerlauf: set(angebotVerlauf),
    verschobenVerlauf: set(verschobenVerlauf),
    angebotTermin: set(angebotTermin),
    tarifTermin: set(tarifTermin),
    pool: set2(pool),
    intake: set2(intake),
    hvk: set2(hvk),
    /** Produkte, die ein Kunde als Pay-per-Lead-Bezug kauft (für die Kundenart der Airtable-Leads) */
    bezugProdukte: bezuege.reduce((m, b) => m.set(b.customerId, (m.get(b.customerId) ?? new Set<string>()).add(b.productKey)), new Map<string, Set<string>>()),
  };
}

const KEINE = new Set<string>();

const leadSelect = {
  id: true,
  customerId: true,
  createdAt: true,
  source: true,
  adChannel: true,
  referralLinkId: true,
  externalId: true,
  airtableId: true,
  adPlatform: true,
  adFormId: true,
  adCampaignId: true,
  adSetId: true,
  adId: true,
  firstContactAt: true,
  reached: true,
  contactAttempts: true,
  callAttempts: true,
  outreachAt: true,
  outreachStatus: true,
  status: true,
  closedAt: true,
  closeValue: true,
  policyDoneAt: true,
  subscriptionId: true,
  orderId: true,
  deliveredAt: true,
  stornoState: true,
  stornoReason: true,
  stornoRequestedAt: true,
  stornoDecidedAt: true,
  creditAmount: true,
  subscription: { select: { delivery: true } },
  revenues: { select: { cancelled: true } },
  files: { select: { kind: true } },
  appointments: { select: { status: true, createdAt: true, startsAt: true, cancelledAt: true, cancelledBy: true } },
  contracts: {
    select: {
      primaryLeadId: true,
      sparte: true,
      premium: true,
      provisionValue: true,
      insurer: true,
      contractNo: true,
      fileId: true,
      productName: true,
      status: true,
      cancelledAt: true,
      cancelReason: true,
      chargeback: true,
    },
  },
} as const;

type Ids = Awaited<ReturnType<typeof idSets>>;

function herkunftOf(l: { airtableId: string | null; externalId: string | null; subscriptionId: string | null; source: string | null; adChannel: string | null; referralLinkId: string | null }, ids: Ids, id: string): Herkunft {
  const origin = leadOrigin(l);
  if (origin !== "paid") return origin;
  if (l.subscriptionId || ids.pool.has(id) || l.externalId?.startsWith("perspective:")) return "pool";
  if (l.airtableId) return "airtable";
  if (isMetaLeadId(l.externalId)) return "meta";
  if (l.externalId) return "zapier";
  return "sonstige";
}

async function ladeLeads(customerIds: string[]): Promise<KetteLead[]> {
  const ids = await idSets();
  const out: KetteLead[] = [];
  let cursor: string | undefined;
  for (;;) {
    const batch = await prisma.lead.findMany({
      where: { customerId: { in: customerIds }, isTest: false },
      orderBy: { id: "asc" },
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: leadSelect,
    });
    for (const l of batch) {
      const kundenart = kundenartFuer({
        bezug: !!l.subscriptionId,
        pool: ids.pool.has(l.id),
        eingang: ids.intake.has(l.id),
        produkt: l.source,
        bezugProdukte: ids.bezugProdukte.get(l.customerId) ?? KEINE,
      });
      const num = (d: unknown) => d != null && Number(d) > 0;
      out.push({
        customerId: l.customerId,
        kundenart,
        herkunft: herkunftOf(l, ids, l.id),
        createdAt: l.createdAt,
        produkt: !!l.source,
        kanal: !!l.adChannel,
        metaLeadId: isMetaLeadId(l.externalId),
        formular: ids.formular.has(l.id) || !!l.adFormId,
        plattform: !!l.adPlatform,
        kampagne: !!l.adCampaignId,
        anzeigengruppe: !!l.adSetId,
        anzeige: !!l.adId,
        firstContactAt: l.firstContactAt,
        reached: l.reached,
        kontaktversuche: l.contactAttempts > 0 || l.callAttempts > 0,
        outreachSentAt: l.outreachStatus?.startsWith("sent") ? l.outreachAt : null,
        status: l.status,
        termine: l.appointments.map((a) => ({ status: a.status, createdAt: a.createdAt, startsAt: a.startsAt, cancelledAt: a.cancelledAt, cancelledBy: a.cancelledBy })),
        terminVerschobenVerlauf: ids.verschobenVerlauf.has(l.id),
        angebotVerlauf: ids.angebotVerlauf.has(l.id),
        angebotDatei: l.files.some((f) => f.kind === "angebot"),
        angebotAmTermin: ids.angebotTermin.has(l.id),
        tarifauswahlAmTermin: ids.tarifTermin.has(l.id),
        closedAt: l.closedAt,
        closeValue: num(l.closeValue),
        policeDatei: l.files.some((f) => f.kind === "police"),
        policyDone: !!l.policyDoneAt,
        vertraege: l.contracts.map((c) => ({
          primary: !!c.primaryLeadId,
          sparte: c.sparte,
          premium: num(c.premium) || num(c.provisionValue),
          insurer: !!c.insurer?.trim(),
          contractNo: !!c.contractNo?.trim(),
          police: !!c.fileId,
          productName: !!c.productName?.trim(),
          storniert: c.status === "storniert",
          cancelledAt: !!c.cancelledAt,
          cancelReason: !!c.cancelReason,
          chargeback: c.chargeback != null,
        })),
        leadStorno: (l.status ?? "").trim().toLowerCase().startsWith("storno") || l.revenues.some((r) => r.cancelled),
        deliveredAt: l.deliveredAt,
        bezug: !!l.subscriptionId,
        bestellung: !!l.orderId,
        lieferweg: l.subscription?.delivery ?? null,
        eingangVerknuepft: ids.pool.has(l.id) || ids.intake.has(l.id),
        stornoState: l.stornoState,
        stornoReason: !!l.stornoReason,
        stornoRequestedAt: !!l.stornoRequestedAt,
        stornoDecidedAt: !!l.stornoDecidedAt,
        creditAmount: num(l.creditAmount),
        hvkAbgleich: ids.hvk.has(l.id),
      });
    }
    if (batch.length < BATCH) break;
    cursor = batch[batch.length - 1].id;
  }
  return out;
}

function jeZeitraum(rows: KetteLead[], now: Date) {
  return Object.fromEntries(
    ZEITRAEUME.map((z) => {
      const r = imZeitraum(rows, z.tage, now);
      return [
        z.key,
        {
          alle: auswerten(r, now),
          vermittler: auswerten(r.filter((l) => l.kundenart === "vermittler"), now),
          ppl: auswerten(r.filter((l) => l.kundenart === "ppl"), now),
        },
      ];
    }),
  );
}

export async function kette(params: URLSearchParams, now = new Date()) {
  const kunde = (params.get("kunde") ?? "").trim();
  const customers = await prisma.customer.findMany({
    where: { isTest: false, plan: { not: "internal" }, id: kunde ? kunde : { not: DEMO_KUNDE } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, plan: true, archived: true, _count: { select: { leadSubscriptions: true } } },
  });
  if (kunde && !customers.length) return { fehler: "Kunde nicht gefunden (oder Testkunde/intern)" };
  const rows = await ladeLeads(customers.map((c) => c.id));
  const byCustomer = new Map<string, KetteLead[]>();
  for (const l of rows) byCustomer.set(l.customerId, [...(byCustomer.get(l.customerId) ?? []), l]);

  const kunden = customers
    .map((c) => {
      const r = byCustomer.get(c.id) ?? [];
      return {
        id: c.id,
        name: c.name,
        paket: c.plan,
        archiviert: c.archived,
        // Ohne Leads im Kunden: Bezug vorhanden → Pay-per-Lead (taucht ohne &kunde nicht auf)
        kundenart: r.length ? kundenartKunde(r) : c._count.leadSubscriptions ? "ppl" : "vermittler",
        ...(kunde
          ? { zeitraeume: jeZeitraum(r, now) }
          : { zeitraeume: Object.fromEntries(ZEITRAEUME.map((z) => [z.key, kompakt(auswerten(imZeitraum(r, z.tage, now), now))])) }),
      };
    })
    .filter((k) => kunde || (byCustomer.get(k.id)?.length ?? 0) > 0);

  return {
    stand: now.toISOString(),
    hinweis:
      "Nur Zahlen. Stufe.erreicht = Leads, die die Stufe erreicht haben; felder = davon mit befülltem Feld (n, pct). Storno und Cross-Selling auf Vertragsebene (basisVertraege). Ohne Testleads, Testkunden, interne Kunden.",
    fehlendeFelder: FEHLENDE_FELDER,
    ...(kunde ? {} : { zeitraeume: jeZeitraum(rows, now) }),
    kunden,
  };
}
