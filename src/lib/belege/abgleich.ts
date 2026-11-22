// Belege ↔ Kontoumsätze (Ole, 22.11.2026: Buchhaltung möglichst lückenlos und ohne Handarbeit). Ohne Datenbank, getestet.
//
// Regeln:
// - Nur Ausgaben, die einen Beleg brauchen (brauchtBeleg): zugeordnete und offene Ausgaben sowie Meta-Werbung (in der
//   App „ignoriert“, weil die Kosten per API kommen, für die Buchhaltung aber belegpflichtig). Keine Amex-Abrechnung auf
//   dem Girokonto (die Kartenumsätze haben eigene Belege), keine Steuern, Umbuchungen, Privates, Gehalt, Stripe.
// - Nur Eingangsbelege (Rechnung, Quittung, Zahlungsbeleg, Auslage, Sonstiges), keine eigenen Ausgangsrechnungen.
// - Beleg-Datum zwischen 45 Tagen vor und 7 Tagen nach der Buchung (Zahlungsziel bzw. Kartenbuchung später).
// - Treffer nur, wenn eindeutig: gleicher Betrag in EUR (±2 Cent) und Anbieter passt, oder gleicher Betrag und es gibt
//   im Zeitfenster genau einen solchen Beleg und genau einen solchen Umsatz; bei Fremdwährung Anbieter + Betrag ±20 % (Wechselkurs).
//   Was nicht eindeutig ist, bleibt offen (Liste „ohne Beleg“) statt geraten.

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
};

export const EINGANGS_TYPEN = ["INCOMING_INVOICE", "RECEIPT", "PAYMENT_RECEIPT", "EXPENSE_REIMBURSEMENT", "MISC"] as const;

const META = /facebook|facebk|meta platforms|fb\.me\/ads/i;
const OHNE_BELEG = /american express|\bamex\b|zahlung erhalten|stripe|umbuchung|übertrag|finanzamt|bundeskasse|privat|gehalt/i;

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
  return kennwoerter(b.firma).some((k) => text.includes(k));
}

const tage = (a: string, b: string) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);
const imFenster = (beleg: string | null, buchung: string) => !!beleg && tage(buchung, beleg) <= 45 && tage(buchung, beleg) >= -7;
const gleicherBetrag = (b: AbgleichBeleg, u: AbgleichUmsatz) => b.waehrung === "EUR" && b.brutto != null && Math.abs(b.brutto - -u.betrag) <= 0.02;
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
        if (anbieterPasst(b, u)) kandidaten.push({ u, b, stufe: 3, abstand });
        else {
          // nur Betrag: eindeutig in beide Richtungen
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
    // Gleichstand gleicher Stufe und gleichen Abstands bei einem anderen freien Beleg → nicht raten
    const gleich = kandidaten.filter((x) => x !== k && x.u === k.u && x.stufe === k.stufe && x.abstand === k.abstand && !belegt.has(x.b.id));
    if (gleich.length) continue;
    belegt.add(k.u.id);
    belegt.add(k.b.id);
    out.push({ umsatzId: k.u.id, belegId: k.b.id });
  }
  return out;
}

/** Anbieter-Name für die Liste „ohne Beleg“ (Klarna-Zahlungen an Meta als Meta). */
export function anbieterName(u: Pick<AbgleichUmsatz, "gegenpartei" | "zweck">): string {
  const text = `${u.gegenpartei ?? ""} ${u.zweck ?? ""}`;
  if (META.test(text)) return "Meta (Werbung)";
  return (u.gegenpartei ?? "Ohne Empfänger").replace(/\s+/g, " ").replace(/[*#].*$/, "").trim().slice(0, 60) || "Ohne Empfänger";
}
