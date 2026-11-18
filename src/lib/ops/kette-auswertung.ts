// Bestandsaufnahme „Kette je Lead“ (Ole, 17.11.2026, Datenbasis für Benchmarks, Baustein 1): reine Auswertung ohne
// Datenbank. Eingabe sind Fakten je Lead OHNE Personendaten (nur ja/nein, Zeitpunkte, Status), Ausgabe nur Zahlen:
// je Stufe der Kette, wie viele Leads sie erreicht haben, und wie viele davon die Pflichtfelder der Stufe befüllt haben.
// Laden: lib/ops/kette.ts (Diagnose-Abfrage q=kette). Bericht: docs/datenbasis-bestandsaufnahme.md.

export type Kundenart = "vermittler" | "ppl";
export type Herkunft = "airtable" | "meta" | "zapier" | "pool" | "empfehlung" | "bestand" | "eigen" | "sonstige";

export type KetteTermin = {
  status: string;
  createdAt: Date;
  startsAt: Date;
  cancelledAt: Date | null;
  cancelledBy: string | null;
};

export type KetteVertrag = {
  primary: boolean;
  sparte: string;
  premium: boolean;
  insurer: boolean;
  contractNo: boolean;
  police: boolean;
  productName: boolean;
  storniert: boolean;
  cancelledAt: boolean;
  cancelReason: boolean;
  chargeback: boolean;
};

/** Fakten je Lead, ohne Name, Telefon, E-Mail, Formularangaben, Notizen oder IDs des Leads. */
export type KetteLead = {
  customerId: string;
  kundenart: Kundenart;
  herkunft: Herkunft;
  createdAt: Date;
  // Anzeige / Quelle
  produkt: boolean;
  kanal: boolean;
  metaLeadId: boolean;
  formular: boolean;
  /** Anzeigenfelder am Lead (seit 17.11.2026, lib/anzeige.ts): Plattform, Kampagne, Anzeigengruppe, Anzeige */
  plattform: boolean;
  kampagne: boolean;
  anzeigengruppe: boolean;
  anzeige: boolean;
  // Erster Kontakt
  firstContactAt: Date | null;
  reached: boolean;
  kontaktversuche: boolean;
  /** WhatsApp-Erstanschreiben gesendet (Zeitpunkt), um automatische Erstkontakte zu erkennen */
  outreachSentAt: Date | null;
  status: string | null;
  // Termine
  termine: KetteTermin[];
  terminVerschobenVerlauf: boolean;
  // Angebot
  angebotVerlauf: boolean;
  angebotDatei: boolean;
  angebotAmTermin: boolean;
  tarifauswahlAmTermin: boolean;
  // Abschluss
  closedAt: Date | null;
  closeValue: boolean;
  policeDatei: boolean;
  policyDone: boolean;
  vertraege: KetteVertrag[];
  /** Lead-Storno beim Vermittler-Kunden (Status „Storno…“ bzw. Lead-Umsatz storniert) */
  leadStorno: boolean;
  // Pay-per-Lead
  deliveredAt: Date | null;
  bezug: boolean;
  bestellung: boolean;
  lieferweg: string | null;
  eingangVerknuepft: boolean;
  stornoState: string | null;
  stornoReason: boolean;
  stornoRequestedAt: boolean;
  stornoDecidedAt: boolean;
  creditAmount: boolean;
  hvkAbgleich: boolean;
};

/**
 * Kundenart eines Leads (Ole, 18.11.2026, korrigiert): Pay-per-Lead nur, wenn der Lead über einen Bezug oder den Pool
 * geliefert wurde, oder wenn er aus dem Airtable-Eingang (PplIntake) kommt UND der Kunde dieses Produkt als Bezug kauft.
 * Vorher zählte jede Verknüpfung mit PplIntake als Pay-per-Lead; der Airtable-Eingang enthält aber alle Airtable-Leads,
 * auch die der Vermittler-Kunden (Ergebnis: 0 Vermittler-Leads in der Bestandsaufnahme vom 17.11.).
 */
export function kundenartFuer(l: { bezug: boolean; pool: boolean; eingang: boolean; produkt: string | null; bezugProdukte: ReadonlySet<string> }): Kundenart {
  if (l.bezug || l.pool) return "ppl";
  if (l.eingang && l.produkt && l.bezugProdukte.has(l.produkt)) return "ppl";
  return "vermittler";
}

/** Kundenart je Kunde aus den Leads: nur Pay-per-Lead, gemischt oder Vermittler. */
export function kundenartKunde(rows: Pick<KetteLead, "kundenart">[]): Kundenart | "gemischt" {
  const ppl = rows.filter((l) => l.kundenart === "ppl").length;
  if (ppl && ppl === rows.length) return "ppl";
  return ppl ? "gemischt" : "vermittler";
}

export const TERMIN_STATUS = new Set(["In Beratung", "Termin vereinbart", "Angebot/Beratung läuft"]);
export const ANGEBOT_STATUS = new Set(["Angebot gesendet", "Angebot/Beratung läuft"]);
export const CLOSED_STATUS = "Abschluss";

const MIN = 60_000;
const DAY = 86_400_000;

/** Felder, die es im Schema heute gar nicht gibt (je Stufe), damit der Bericht sie mit 0 % nicht verschweigt.
 *  Anzeige: seit 17.11.2026 im Schema (Lead.adPlatform, adFormId, adCampaignId, adSetId, adId), zählt unter stufen.anzeige. */
export const FEHLENDE_FELDER: Record<string, string[]> = {
  ersterKontakt: ["erreichtAm (Zeitpunkt des ersten echten Gesprächs)", "kontaktArt (Anruf/WhatsApp/automatisch)"],
  termin: ["terminGebuchtVon (Lead/Vermittler/Assistent) als Feld", "verschobenVon (Verweis auf den alten Termin)"],
  terminStatus: ["erschienen/nicht erschienen mit Zeitpunkt der Erfassung"],
  angebot: ["angebotGesendetAm", "angebotsStatus (offen/angenommen/abgelehnt)", "angebotsBeitrag", "Verweis Angebot ↔ Vertrag"],
  abschluss: ["tarif (Tarifname am Vertrag)", "jahresbeitrag einheitlich (PKV: Monatsbeitrag, Tarifoptimierung: Ersparnis)"],
  storno: ["stornoGemeldetAm (Erfassung) getrennt von cancelledAt (wirksam zum)"],
  kaeuferRueckmeldung: ["Rückmeldung der Käufer bei Lieferung per E-Mail oder Webhook (kein Rückkanal)"],
};

type Pct = { n: number; pct: number | null };
type Stufe = { erreicht: number; ebene?: "vertrag" | "termin"; basisVertraege?: number; felder: Record<string, Pct>; zahlen?: Record<string, number | null> };
export type Bericht = { leads: number; herkunft: Record<Herkunft, number>; stufen: Record<string, Stufe> };

const pct = (n: number, basis: number): Pct => ({ n, pct: basis ? Math.round((n / basis) * 1000) / 10 : null });

function stufe(rows: KetteLead[], basis: (l: KetteLead) => boolean, felder: Record<string, (l: KetteLead) => boolean>): Stufe {
  const hit = rows.filter(basis);
  return { erreicht: hit.length, felder: Object.fromEntries(Object.entries(felder).map(([k, f]) => [k, pct(hit.filter(f).length, hit.length)])) };
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return Math.round((s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) * 10) / 10;
}

const isClosed = (l: KetteLead) => l.status === CLOSED_STATUS || l.vertraege.some((v) => v.primary);
const isLeadStorno = (s: string | null) => (s ?? "").trim().toLowerCase().startsWith("storno");

/** Nach dem Absagen gleich neu gebucht (Verschieben über den Kalender: erst neu buchen, dann alt absagen). */
function verschobeneTermine(t: KetteTermin[]): number {
  return t.filter(
    (a) => a.status === "cancelled" && a.cancelledAt && t.some((b) => b !== a && Math.abs(b.createdAt.getTime() - a.cancelledAt!.getTime()) <= 10 * MIN),
  ).length;
}

function ersterKontaktErreicht(l: KetteLead): boolean {
  return !!l.firstContactAt || l.reached || l.kontaktversuche || l.termine.length > 0 || isClosed(l) || !!(l.status && l.status !== "Neuer Lead");
}

export function auswerten(rows: KetteLead[], now: Date): Bericht {
  const herkunft = { airtable: 0, meta: 0, zapier: 0, pool: 0, empfehlung: 0, bestand: 0, eigen: 0, sonstige: 0 } as Record<Herkunft, number>;
  for (const l of rows) herkunft[l.herkunft]++;

  const anzeige = stufe(rows, () => true, {
    produkt: (l) => l.produkt,
    kanal: (l) => l.kanal,
    metaLeadId: (l) => l.metaLeadId,
    formular: (l) => l.formular,
    plattform: (l) => l.plattform,
    kampagne: (l) => l.kampagne,
    anzeigengruppe: (l) => l.anzeigengruppe,
    anzeige: (l) => l.anzeige,
  });

  const lead = stufe(rows, () => true, {
    eingangszeit: () => true,
    // Airtable-Leads: createdAt = Zuweisungsdatum (Tag), nicht der Eingang beim Formular
    eingangszeitGenau: (l) => l.herkunft !== "airtable",
  });

  const kontakt = stufe(rows, ersterKontaktErreicht, {
    zeitpunkt: (l) => !!l.firstContactAt,
    erreichtMarkiert: (l) => l.reached,
    kontaktversuche: (l) => l.kontaktversuche,
    zeitPlausibel: (l) => !!l.firstContactAt && l.firstContactAt.getTime() >= l.createdAt.getTime() - MIN,
  });
  const mitZeit = rows.filter((l) => l.firstContactAt && l.firstContactAt.getTime() >= l.createdAt.getTime() - MIN);
  const automatisch = mitZeit.filter((l) => l.outreachSentAt && Math.abs(l.outreachSentAt.getTime() - l.firstContactAt!.getTime()) <= 5 * MIN);
  const menschlich = mitZeit.filter((l) => !automatisch.includes(l));
  kontakt.zahlen = {
    zeitBisKontaktMedianMin: median(mitZeit.map((l) => (l.firstContactAt!.getTime() - l.createdAt.getTime()) / MIN)),
    zeitBisKontaktOhneAutomatikMedianMin: median(menschlich.map((l) => (l.firstContactAt!.getTime() - l.createdAt.getTime()) / MIN)),
    erstkontaktAutomatisch: automatisch.length,
    zeitVorEingang: rows.filter((l) => l.firstContactAt && l.firstContactAt.getTime() < l.createdAt.getTime() - MIN).length,
  };

  const termin = stufe(rows, (l) => l.termine.length > 0 || TERMIN_STATUS.has(l.status ?? ""), {
    terminZeile: (l) => l.termine.length > 0,
  });
  const mitTermin = rows.filter((l) => l.termine.length > 0);
  termin.zahlen = {
    termine: mitTermin.reduce((s, l) => s + l.termine.length, 0),
    zeitBisTerminMedianStd: median(
      mitTermin.map((l) => (Math.min(...l.termine.map((t) => t.createdAt.getTime())) - l.createdAt.getTime()) / (60 * MIN)).filter((h) => h >= 0),
    ),
  };

  // Termin-Status: Leads mit mindestens einem Termin in der Vergangenheit
  const past = (l: KetteLead) => l.termine.filter((t) => t.startsAt.getTime() <= now.getTime());
  const terminStatus = stufe(rows, (l) => past(l).length > 0, {
    ergebnisErfasst: (l) => past(l).filter((t) => t.status !== "cancelled").every((t) => t.status === "completed" || t.status === "no_show"),
    absageMitUrheber: (l) => l.termine.filter((t) => t.status === "cancelled").every((t) => !!t.cancelledBy && !!t.cancelledAt),
  });
  const alle = rows.flatMap((l) => l.termine);
  const vergangene = alle.filter((t) => t.startsAt.getTime() <= now.getTime());
  const verschoben = rows.reduce((s, l) => s + verschobeneTermine(l.termine), 0);
  terminStatus.zahlen = {
    erschienen: alle.filter((t) => t.status === "completed").length,
    nichtErschienen: alle.filter((t) => t.status === "no_show").length,
    abgesagt: alle.filter((t) => t.status === "cancelled").length - verschoben,
    verschoben,
    leadsMitVerschobenImVerlauf: rows.filter((l) => l.terminVerschobenVerlauf).length,
    vorbeiOhneErgebnis: vergangene.filter((t) => t.status === "booked").length,
    zukuenftig: alle.filter((t) => t.status === "booked" && t.startsAt.getTime() > now.getTime()).length,
    abgesagtVonLead: alle.filter((t) => t.status === "cancelled" && t.cancelledBy === "lead").length,
  };

  const angebot = stufe(
    rows,
    (l) => ANGEBOT_STATUS.has(l.status ?? "") || l.angebotVerlauf || l.angebotDatei || l.angebotAmTermin || isClosed(l),
    {
      zeitpunkt: (l) => l.angebotVerlauf,
      dokument: (l) => l.angebotDatei,
      angebotAmTermin: (l) => l.angebotAmTermin,
      statusAktuellAngebot: (l) => ANGEBOT_STATUS.has(l.status ?? ""),
    },
  );

  const primary = (l: KetteLead) => l.vertraege.find((v) => v.primary) ?? null;
  const abschluss = stufe(rows, isClosed, {
    closedAt: (l) => !!l.closedAt,
    closedAtPlausibel: (l) => !!l.closedAt && l.closedAt.getTime() > l.createdAt.getTime(),
    vertragGespeichert: (l) => !!primary(l),
    sparte: (l) => !!primary(l) && (primary(l)!.sparte !== "sonstiges" || primary(l)!.productName),
    jahresbeitrag: (l) => !!primary(l)?.premium || l.closeValue,
    gesellschaft: (l) => !!primary(l)?.insurer,
    tarif: (l) => !!primary(l)?.productName || l.tarifauswahlAmTermin,
    vertragsnummer: (l) => !!primary(l)?.contractNo,
    police: (l) => !!primary(l)?.police || l.policeDatei || l.policyDone,
  });

  // Storno der Verträge (alle Verträge), Ebene Vertrag
  const vertraege = rows.flatMap((l) => l.vertraege);
  const storniert = vertraege.filter((v) => v.storniert);
  const storno: Stufe = {
    erreicht: rows.filter((l) => l.vertraege.some((v) => v.storniert)).length,
    ebene: "vertrag",
    basisVertraege: storniert.length,
    felder: {
      datum: pct(storniert.filter((v) => v.cancelledAt).length, storniert.length),
      grund: pct(storniert.filter((v) => v.cancelReason).length, storniert.length),
      rueckbelastung: pct(storniert.filter((v) => v.chargeback).length, storniert.length),
    },
    zahlen: { vertraege: vertraege.length, vertraegeStorniert: storniert.length, leadStornoVermittler: rows.filter((l) => l.kundenart === "vermittler" && l.leadStorno).length },
  };

  const cross = vertraege.filter((v) => !v.primary);
  const crossSelling: Stufe = {
    erreicht: rows.filter((l) => l.vertraege.some((v) => !v.primary)).length,
    ebene: "vertrag",
    basisVertraege: cross.length,
    felder: {
      jahresbeitrag: pct(cross.filter((v) => v.premium).length, cross.length),
      gesellschaft: pct(cross.filter((v) => v.insurer).length, cross.length),
      vertragsnummer: pct(cross.filter((v) => v.contractNo).length, cross.length),
      police: pct(cross.filter((v) => v.police).length, cross.length),
    },
  };

  const ppl = rows.filter((l) => l.kundenart === "ppl");
  const lieferung = stufe(ppl, () => true, {
    geliefertAm: (l) => !!l.deliveredAt,
    bezug: (l) => l.bezug,
    bestellung: (l) => l.bestellung,
    eingangVerknuepft: (l) => l.eingangVerknuepft,
  });
  const pplStorno = stufe(ppl, (l) => !!l.stornoState || isLeadStorno(l.status), {
    stornoStatus: (l) => !!l.stornoState,
    grund: (l) => l.stornoReason,
    angefragtAm: (l) => l.stornoRequestedAt,
  });
  const entschieden = ppl.filter((l) => l.stornoState === "approved" || l.stornoState === "rejected");
  pplStorno.zahlen = {
    genehmigt: ppl.filter((l) => l.stornoState === "approved").length,
    genehmigtMitGutschrift: ppl.filter((l) => l.stornoState === "approved" && l.creditAmount).length,
    entschieden: entschieden.length,
    entschiedenMitDatum: entschieden.filter((l) => l.stornoDecidedAt).length,
    abgelehnt: ppl.filter((l) => l.stornoState === "rejected").length,
    offen: ppl.filter((l) => l.stornoState === "requested" || l.stornoState === "review").length,
    nurStatusOhneStornoFeld: ppl.filter((l) => !l.stornoState && isLeadStorno(l.status)).length,
  };
  const rueck = stufe(ppl, (l) => !!l.deliveredAt || l.bezug || l.eingangVerknuepft, {
    statusBearbeitet: (l) => !!l.status && l.status !== "Neuer Lead",
    ersterKontakt: (l) => !!l.firstContactAt,
    abschluss: (l) => isClosed(l),
    hvkAbgleich: (l) => l.hvkAbgleich,
  });
  const wege = new Map<string, { leads: number; bearbeitet: number }>();
  for (const l of ppl) {
    const k = `lieferweg_${l.lieferweg ?? "unbekannt"}`;
    const w = wege.get(k) ?? { leads: 0, bearbeitet: 0 };
    w.leads++;
    if (l.status && l.status !== "Neuer Lead") w.bearbeitet++;
    wege.set(k, w);
  }
  rueck.zahlen = Object.fromEntries([...wege].flatMap(([k, w]) => [[k, w.leads], [`${k}_bearbeitet`, w.bearbeitet]]));

  return {
    leads: rows.length,
    herkunft,
    stufen: { anzeige, lead, ersterKontakt: kontakt, termin, terminStatus, angebot, abschluss, storno, crossSelling, lieferung, pplStorno, kaeuferRueckmeldung: rueck },
  };
}

/** Kurzform je Kunde: erreichte Leads je Stufe und Abdeckung je Feld als „stufe.feld“ in %. */
export function kompakt(b: Bericht): { leads: number; stufen: Record<string, number>; abdeckung: Record<string, number | null> } {
  const stufen: Record<string, number> = {};
  const abdeckung: Record<string, number | null> = {};
  for (const [k, s] of Object.entries(b.stufen)) {
    stufen[k] = s.erreicht;
    if (!s.erreicht) continue;
    for (const [f, p] of Object.entries(s.felder)) abdeckung[`${k}.${f}`] = p.pct;
  }
  return { leads: b.leads, stufen, abdeckung };
}

export const ZEITRAEUME = [
  { key: "d30", tage: 30 },
  { key: "d90", tage: 90 },
  { key: "gesamt", tage: null },
] as const;

export function imZeitraum(rows: KetteLead[], tage: number | null, now: Date): KetteLead[] {
  if (tage == null) return rows;
  const since = now.getTime() - tage * DAY;
  return rows.filter((l) => l.createdAt.getTime() >= since);
}
