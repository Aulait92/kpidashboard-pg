// Bestandsaufnahme „Kette je Lead“ (lib/ops/kette-auswertung.ts): Stufen, Abdeckung, Zeiträume, verschobene Termine.
import { describe, expect, it } from "vitest";
import { auswerten, imZeitraum, kompakt, type KetteLead } from "@/lib/ops/kette-auswertung";

const NOW = new Date("2026-11-17T12:00:00Z");
const H = 3_600_000;
const D = 24 * H;

function lead(p: Partial<KetteLead> = {}): KetteLead {
  return {
    customerId: "c1",
    kundenart: "vermittler",
    herkunft: "meta",
    createdAt: new Date(NOW.getTime() - 5 * D),
    produkt: true,
    kanal: true,
    metaLeadId: true,
    formular: false,
    firstContactAt: null,
    reached: false,
    kontaktversuche: false,
    outreachSentAt: null,
    status: "Neuer Lead",
    termine: [],
    terminVerschobenVerlauf: false,
    angebotVerlauf: false,
    angebotDatei: false,
    angebotAmTermin: false,
    tarifauswahlAmTermin: false,
    closedAt: null,
    closeValue: false,
    policeDatei: false,
    policyDone: false,
    vertraege: [],
    leadStorno: false,
    deliveredAt: null,
    bezug: false,
    bestellung: false,
    lieferweg: null,
    eingangVerknuepft: false,
    stornoState: null,
    stornoReason: false,
    stornoRequestedAt: false,
    stornoDecidedAt: false,
    creditAmount: false,
    hvkAbgleich: false,
    ...p,
  };
}

const vertrag = (p: Partial<KetteLead["vertraege"][number]> = {}) => ({
  primary: true,
  sparte: "hausrat",
  premium: false,
  insurer: false,
  contractNo: false,
  police: false,
  productName: false,
  storniert: false,
  cancelledAt: false,
  cancelReason: false,
  chargeback: false,
  ...p,
});

describe("Kette je Lead", () => {
  it("zählt Stufen und Abdeckung der Pflichtfelder beim Abschluss", () => {
    const created = new Date(NOW.getTime() - 5 * D);
    const rows = [
      lead(),
      lead({ status: "Abschluss", closedAt: new Date(created.getTime() + D), vertraege: [vertrag({ premium: true, insurer: true })], createdAt: created }),
      // Airtable-Altfall: closedAt = createdAt, kein Vertrag gespeichert, Wert am Lead
      lead({ herkunft: "airtable", status: "Abschluss", closedAt: created, createdAt: created, closeValue: true }),
    ];
    const b = auswerten(rows, NOW);
    expect(b.leads).toBe(3);
    expect(b.herkunft.airtable).toBe(1);
    const a = b.stufen.abschluss;
    expect(a.erreicht).toBe(2);
    expect(a.felder.jahresbeitrag).toEqual({ n: 2, pct: 100 });
    expect(a.felder.gesellschaft).toEqual({ n: 1, pct: 50 });
    expect(a.felder.vertragGespeichert.n).toBe(1);
    expect(a.felder.closedAtPlausibel.n).toBe(1);
    expect(a.felder.tarif.n).toBe(0);
    // Abschluss zählt auch als erreichtes Angebot (ohne Zeitstempel)
    expect(b.stufen.angebot.erreicht).toBe(2);
    expect(b.stufen.angebot.felder.zeitpunkt.n).toBe(0);
  });

  it("erster Kontakt: Median, automatische Erstkontakte und Zeiten vor dem Eingang", () => {
    const c = new Date(NOW.getTime() - 2 * D);
    const rows = [
      lead({ createdAt: c, firstContactAt: new Date(c.getTime() + 2 * 60_000), outreachSentAt: new Date(c.getTime() + 2 * 60_000) }),
      lead({ createdAt: c, firstContactAt: new Date(c.getTime() + 60 * 60_000), reached: true }),
      lead({ createdAt: c, firstContactAt: new Date(c.getTime() - D) }),
    ];
    const k = auswerten(rows, NOW).stufen.ersterKontakt;
    expect(k.erreicht).toBe(3);
    expect(k.felder.zeitPlausibel.n).toBe(2);
    expect(k.zahlen).toMatchObject({ erstkontaktAutomatisch: 1, zeitVorEingang: 1, zeitBisKontaktMedianMin: 31, zeitBisKontaktOhneAutomatikMedianMin: 60 });
  });

  it("Termine: verschoben (neu gebucht beim Absagen), vorbei ohne Ergebnis, erschienen", () => {
    const t0 = new Date(NOW.getTime() - 3 * D);
    const cancel = new Date(NOW.getTime() - 2 * D);
    const rows = [
      lead({
        status: "In Beratung",
        termine: [
          { status: "cancelled", createdAt: t0, startsAt: new Date(NOW.getTime() - D), cancelledAt: cancel, cancelledBy: "lead" },
          { status: "booked", createdAt: new Date(cancel.getTime() - 1000), startsAt: new Date(NOW.getTime() + D), cancelledAt: null, cancelledBy: null },
        ],
      }),
      lead({ termine: [{ status: "booked", createdAt: t0, startsAt: new Date(NOW.getTime() - H), cancelledAt: null, cancelledBy: null }] }),
      lead({ termine: [{ status: "completed", createdAt: t0, startsAt: new Date(NOW.getTime() - 2 * H), cancelledAt: null, cancelledBy: null }] }),
      lead({ status: "Termin vereinbart" }),
    ];
    const b = auswerten(rows, NOW);
    expect(b.stufen.termin.erreicht).toBe(4);
    expect(b.stufen.termin.felder.terminZeile).toEqual({ n: 3, pct: 75 });
    expect(b.stufen.terminStatus.zahlen).toMatchObject({ verschoben: 1, abgesagt: 0, vorbeiOhneErgebnis: 1, erschienen: 1, zukuenftig: 1 });
    expect(b.stufen.terminStatus.felder.ergebnisErfasst.n).toBe(2);
  });

  it("Pay-per-Lead: Lieferung, Storno, Rückmeldung je Lieferweg; Vermittler-Leads zählen dort nicht", () => {
    const rows = [
      lead({ kundenart: "ppl", herkunft: "pool", deliveredAt: NOW, bezug: true, lieferweg: "email" }),
      lead({ kundenart: "ppl", herkunft: "pool", deliveredAt: NOW, bezug: true, lieferweg: "app", status: "Abschluss", stornoState: "approved", stornoReason: true, stornoRequestedAt: true, stornoDecidedAt: true }),
      lead({ kundenart: "ppl", herkunft: "airtable", status: "Storno", eingangVerknuepft: true }),
      lead(),
    ];
    const b = auswerten(rows, NOW);
    expect(b.stufen.lieferung.erreicht).toBe(3);
    expect(b.stufen.lieferung.felder.geliefertAm.n).toBe(2);
    expect(b.stufen.pplStorno.erreicht).toBe(2);
    expect(b.stufen.pplStorno.zahlen).toMatchObject({ genehmigt: 1, genehmigtMitGutschrift: 0, nurStatusOhneStornoFeld: 1 });
    expect(b.stufen.kaeuferRueckmeldung.zahlen).toMatchObject({ lieferweg_email: 1, lieferweg_email_bearbeitet: 0, lieferweg_app: 1, lieferweg_app_bearbeitet: 1 });
  });

  it("Storno und Cross-Selling auf Vertragsebene, Zeitraum und Kurzform", () => {
    const rows = [
      lead({
        createdAt: new Date(NOW.getTime() - 100 * D),
        status: "Abschluss",
        vertraege: [vertrag({ storniert: true, cancelledAt: true, cancelReason: true }), vertrag({ primary: false, premium: true }), vertrag({ primary: false })],
      }),
    ];
    const b = auswerten(rows, NOW);
    expect(b.stufen.storno).toMatchObject({ erreicht: 1, basisVertraege: 1 });
    expect(b.stufen.storno.felder.rueckbelastung.n).toBe(0);
    expect(b.stufen.crossSelling).toMatchObject({ erreicht: 1, basisVertraege: 2 });
    expect(b.stufen.crossSelling.felder.jahresbeitrag).toEqual({ n: 1, pct: 50 });
    expect(imZeitraum(rows, 90, NOW)).toHaveLength(0);
    const k = kompakt(b);
    expect(k.stufen.abschluss).toBe(1);
    expect(k.abdeckung["crossSelling.jahresbeitrag"]).toBe(50);
    expect(k.abdeckung["lieferung.geliefertAm"]).toBeUndefined();
  });
});
