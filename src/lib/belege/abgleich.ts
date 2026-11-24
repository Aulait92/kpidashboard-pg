// Belege ↔ Kontoumsätze (Ole, 22.11.2026: Buchhaltung möglichst lückenlos und ohne Handarbeit). Ohne Datenbank, getestet.
//
// Regeln:
// - Nur Ausgaben, die einen Beleg brauchen (brauchtBeleg): zugeordnete und offene Ausgaben sowie Meta-Werbung (in der
//   App „ignoriert“, weil die Kosten per API kommen, für die Buchhaltung aber belegpflichtig). Keine Amex-Abrechnung auf
//   dem Girokonto (die Kartenumsätze haben eigene Belege), keine Steuern, Umbuchungen, Privates, Gehalt, Stripe.
// - Nur Eingangsbelege (Rechnung, Quittung, Zahlungsbeleg, Auslage, Sonstiges), keine eigenen Ausgangsrechnungen.
// - Beleg-Datum zwischen 45 Tagen vor und 7 Tagen nach der Buchung (Zahlungsziel bzw. Kartenbuchung später).
// - Treffer nur, wenn eindeutig: gleicher Betrag in EUR (±2 Cent) und Anbieter passt, oder gleicher Betrag und es gibt
//   im Zeitfenster genau einen solchen Beleg und genau einen solchen Umsatz (nur centgenau und nur, wenn der Beleg keinen
//   erkannten Anbieter hat: ein Beleg von Microsoft gehört nie zu einer Zahlung an Anthropic); bei Fremdwährung Anbieter + Betrag ±20 % (Wechselkurs).
//   Was nicht eindeutig ist, bleibt offen (Liste „ohne Beleg“) statt geraten.
// - Zweiter Durchgang (Ole, 24.11.2026): gleicher Anbieter und centgenau, Rechnung bis 75 Tage vor der Buchung (z. B.
//   Steuerbüro mit langem Zahlungsziel), nur, wenn nach dem ersten Durchgang genau dieser eine Beleg und genau diese eine
//   Zahlung übrig sind. Nach der Buchung weiter höchstens 7 Tage (eine spätere Rechnung ist meist die des Folgemonats).
// - Gleichartige Belege mit eigener Rechnungsnummer (z. B. mehrere Meta-Abbuchungen über 4,00 € am selben Tag) sind
//   eigene Belege, keine Doppel: je Zahlung einer, egal welcher. Doppel sind nur Belege mit gleicher oder fehlender Nummer.

export type AbgleichUmsatz = {
  id: string;
  datum: string; // YYYY-MM-DD
  betrag: number; // Ausgabe negativ
  gegenpartei: string | null;
  zweck: string | null;
  status: string; // neu | zugeordnet | ignoriert
};

export type AbgleichBeleg = {
  id: string;
  typ: string;
  firma: string | null;
  datum: string | null; // YYYY-MM-DD
  brutto: number | null;
  waehrung: string;
  /** Rechnungsnummer: unterscheidet gleichartige Belege (Meta) von doppelt erfassten */
  nummer?: string | null;
};

export const EINGANGS_TYPEN = ["INCOMING_INVOICE", "RECEIPT", "PAYMENT_RECEIPT", "EXPENSE_REIMBURSEMENT", "MISC"] as const;

const META_KOMPAKT = /facebook|facebk|metaplatforms|fb\.me\/ads/i;
// Verwendungszwecke aus der Bank-CSV brechen Wörter um („FACEBOO K PAYMENTS“): ohne Leerzeichen vergleichen
const META = { test: (t: string) => META_KOMPAKT.test(t.replace(/\s+/g, "")) };
// Bankentgelte (Kontoauszug genügt) und Darlehensraten (Vertrag liegt einmal vor) brauchen keinen Einzelbeleg.
// Steuerbüro (PhDr. Müller Treuhand, auch per GoCardless „GC RE PHDRMUELLERSTBG“): bucht seine eigenen Rechnungen und
// Vorauszahlungen selbst (Ole, 24.11.2026), kein Beleg von uns nötig.
const OHNE_BELEG = /american express|\bamex\b|zahlung erhalten|stripe|umbuchung|übertrag|finanzamt|bundeskasse|privat|gehalt|kontoführung|kontofuehrung|darlehen|tilgung|entgelt|phdrmueller|m(?:ue|ü)ller treuhand/i;

/** Braucht diese Ausgabe einen Beleg? */
export function brauchtBeleg(u: Pick<AbgleichUmsatz, "betrag" | "gegenpartei" | "zweck" | "status">): boolean {
  if (u.betrag >= 0) return false;
  const text = `${u.gegenpartei ?? ""} ${u.zweck ?? ""}`;
  if (META.test(text)) return true;
  if (u.status === "ignoriert") return false;
  return !OHNE_BELEG.test(u.gegenpartei ?? "");
}

const RECHTSFORM =
  /\b(gmbh|mbh|co|kg|ag|ug|se|inc|llc|ltd|limited|pbc|plc|bv|b\.v|s\.a|sa|sarl|s\.?r\.?l|corp|corporation|company|europe|deutschland|germany|ireland|international|haftungsbeschränkt|haftungsbeschraenkt|payments?|services?|technologies|software|the|und|and)\b/g;

/** Kennwörter eines Anbieters (klein, ohne Rechtsform, mind. 4 Zeichen); Meta ↔ Facebook. */
export function kennwoerter(firma: string | null): string[] {
  if (!firma) return [];
  const w = firma
    .toLowerCase()
    .replace(/[(),.&+]/g, " ")
    .replace(RECHTSFORM, " ")
    .split(/\s+/)
    .filter((x) => x.length >= 4);
  if (w.includes("meta") || w.includes("facebook")) w.push("facebook", "facebk", "meta platforms");
  if (w.includes("google")) w.push("google");
  return [...new Set(w)];
}

/** Passt der Anbieter des Belegs zum Umsatz? */
export function anbieterPasst(b: Pick<AbgleichBeleg, "firma">, u: Pick<AbgleichUmsatz, "gegenpartei" | "zweck">): boolean {
  const text = `${u.gegenpartei ?? ""} ${u.zweck ?? ""}`.toLowerCase();
  const kompakt = text.replace(/\s+/g, "");
  return kennwoerter(b.firma).some((k) => text.includes(k) || kompakt.includes(k.replace(/\s+/g, "")));
}

const tage = (a: string, b: string) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);
const imFenster = (beleg: string | null, buchung: string) => !!beleg && tage(buchung, beleg) <= 45 && tage(buchung, beleg) >= -7;
const imWeitenFenster = (beleg: string | null, buchung: string) => !!beleg && tage(buchung, beleg) <= 75 && tage(buchung, beleg) >= -7;
/** Gleicher Anbieter, Tag und Betrag (austauschbar für die Zuordnung) */
const zwilling = (x: AbgleichBeleg, y: AbgleichBeleg) => x.firma === y.firma && x.datum === y.datum && x.brutto === y.brutto && x.waehrung === y.waehrung;
// Rechnungsnummer ohne Leerzeichen und Zeichen („36 0506 6300 0571“ = „36050663000571“, Mail-Auslesen vs. Portal)
const nr = (n: string | null | undefined) => (n ?? "").replace(/[^0-9a-z]/gi, "").toLowerCase();
/** Doppelt erfasst (per Mail und Portal): Zwilling mit gleicher oder ohne Rechnungsnummer */
const doppel = (x: AbgleichBeleg, y: AbgleichBeleg) => zwilling(x, y) && (!nr(x.nummer) || !nr(y.nummer) || nr(x.nummer) === nr(y.nummer));
const gleicherBetrag = (b: AbgleichBeleg, u: AbgleichUmsatz) => b.waehrung === "EUR" && b.brutto != null && Math.abs(b.brutto - -u.betrag) <= 0.02;
// Ohne passenden Anbieter nur centgenau (sonst trifft z. B. 19,99 € auf eine Zahlung über 20,00 €)
const centgenau = (b: AbgleichBeleg, u: AbgleichUmsatz) => b.waehrung === "EUR" && b.brutto != null && Math.round(b.brutto * 100) === Math.round(-u.betrag * 100);
const fremdPasst = (b: AbgleichBeleg, u: AbgleichUmsatz) =>
  b.waehrung !== "EUR" && b.brutto != null && b.brutto > 0 && Math.abs(-u.betrag / b.brutto - 1) <= 0.2;

/**
 * Ordnet freie Belege offenen Ausgaben zu. Gibt Paare { umsatzId, belegId } zurück; jeder Beleg und jeder Umsatz höchstens
 * einmal. Bevorzugt Betrag + Anbieter, dann eindeutigen Betrag, dann Fremdwährung + Anbieter; bei Gleichstand das nähere Datum.
 */
export function belegeZuordnen(umsaetze: AbgleichUmsatz[], belege: AbgleichBeleg[]): { umsatzId: string; belegId: string }[] {
  const offen = umsaetze.filter(brauchtBeleg);
  const frei = belege.filter((b) => (EINGANGS_TYPEN as readonly string[]).includes(b.typ) && b.datum && b.brutto != null && b.brutto > 0);
  type Kandidat = { u: AbgleichUmsatz; b: AbgleichBeleg; stufe: number; abstand: number };
  const kandidaten: Kandidat[] = [];
  for (const u of offen) {
    for (const b of frei) {
      if (!imFenster(b.datum, u.datum)) continue;
      const abstand = Math.abs(tage(u.datum, b.datum!));
      if (gleicherBetrag(b, u)) {
        // centgenau vor ±2 Cent (sonst tauschen zwei fast gleiche Beträge die Belege)
        if (anbieterPasst(b, u)) kandidaten.push({ u, b, stufe: centgenau(b, u) ? 4 : 3, abstand });
        else if (centgenau(b, u) && !kennwoerter(b.firma).length) {
          // nur Betrag (Beleg ohne erkannten Anbieter): centgenau und eindeutig in beide Richtungen
          const andereBelege = frei.filter((x) => x !== b && imFenster(x.datum, u.datum) && gleicherBetrag(x, u)).length;
          const andereUmsaetze = offen.filter((x) => x !== u && imFenster(b.datum, x.datum) && gleicherBetrag(b, x)).length;
          if (!andereBelege && !andereUmsaetze) kandidaten.push({ u, b, stufe: 2, abstand });
        }
      } else if (fremdPasst(b, u) && anbieterPasst(b, u)) kandidaten.push({ u, b, stufe: 1, abstand });
    }
  }
  kandidaten.sort((x, y) => y.stufe - x.stufe || x.abstand - y.abstand);
  const belegt = new Set<string>();
  const out: { umsatzId: string; belegId: string }[] = [];
  for (const k of kandidaten) {
    if (belegt.has(k.u.id) || belegt.has(k.b.id)) continue;
    // Gleichstand mit einem anderen, nicht austauschbaren Beleg → nicht raten und auch nicht auf einen schlechteren ausweichen
    const gleich = kandidaten.filter((x) => x !== k && x.u === k.u && x.stufe === k.stufe && x.abstand === k.abstand && !belegt.has(x.b.id) && !zwilling(x.b, k.b));
    if (gleich.length) {
      belegt.add(k.u.id);
      continue;
    }
    // Doppelt erfasste Belege zählen als einer
    for (const x of frei) if (x !== k.b && doppel(x, k.b)) belegt.add(x.id);
    belegt.add(k.u.id);
    belegt.add(k.b.id);
    out.push({ umsatzId: k.u.id, belegId: k.b.id });
  }

  // Zweiter Durchgang: gleicher Anbieter, centgenau, weites Fenster, nur wenn beidseitig eindeutig
  const restU = offen.filter((u) => !belegt.has(u.id));
  const restB = frei.filter((b) => !belegt.has(b.id) && b.waehrung === "EUR" && kennwoerter(b.firma).length);
  const weit = (u: AbgleichUmsatz, b: AbgleichBeleg) => imWeitenFenster(b.datum, u.datum) && centgenau(b, u) && anbieterPasst(b, u);
  // Doppel als einen Beleg zählen
  const verschieden = (bs: AbgleichBeleg[]) => bs.filter((b, i) => !bs.slice(0, i).some((x) => doppel(x, b)));
  for (const u of restU) {
    const bs = verschieden(restB.filter((b) => !belegt.has(b.id) && weit(u, b)));
    if (bs.length !== 1) continue;
    const b = bs[0];
    if (restU.filter((x) => !belegt.has(x.id) && weit(x, b)).length !== 1) continue;
    for (const x of restB) if (x !== b && doppel(x, b)) belegt.add(x.id);
    belegt.add(u.id);
    belegt.add(b.id);
    out.push({ umsatzId: u.id, belegId: b.id });
  }
  return out;
}

/** Anbieter-Name für die Liste „ohne Beleg“ (Klarna-Zahlungen an Meta als Meta). */
export function anbieterName(u: Pick<AbgleichUmsatz, "gegenpartei" | "zweck">): string {
  const text = `${u.gegenpartei ?? ""} ${u.zweck ?? ""}`;
  if (META.test(text)) return "Meta (Werbung)";
  return (u.gegenpartei ?? "Ohne Empfänger").replace(/\s+/g, " ").replace(/[*#].*$/, "").trim().slice(0, 60) || "Ohne Empfänger";
}
