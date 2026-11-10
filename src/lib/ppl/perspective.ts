// Perspective-Funnel → Formularfelder (Nachbau des Zapier-„Übersetzers“).
// Perspective liefert verschachtelt: { id, profile: { firstName: { value } … },
// values: { phone, "address#postalCode", question_xyz … } }. Die Fragen
// heißen je Funnel gleich (question_lcbt58 …), ihre Bedeutung hängt vom
// Produkt ab. Ergebnis: Felder mit deutschen Namen wie bisher in Airtable.

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): string => {
  if (v == null) return "";
  if (Array.isArray(v)) return v.map(text).filter(Boolean).join(", ");
  if (isObj(v)) return text(v.value ?? v.label ?? "");
  return String(v).trim();
};

export function isPerspectivePayload(body: Obj): boolean {
  return isObj(body.profile) || isObj(body.values);
}

type Category = "pkv" | "tier" | "futter" | "sterbegeld" | "ksp" | "zahnzusatz";

export function categoryOf(slug: string): Category {
  const s = slug.toLowerCase();
  if (/katzen-|hunde-|pferdekrankenversicherung/.test(s) && !/futter/.test(s)) return "tier";
  if (/futter/.test(s)) return "futter";
  if (s.includes("sterbegeld")) return "sterbegeld";
  if (/kindersparpl(ae|ä)ne?|kindersparplan/.test(s)) return "ksp";
  if (s.includes("zahnzusatz")) return "zahnzusatz";
  return "pkv";
}

const MAP: Record<Category, [string, string][]> = {
  pkv: [
    ["question_lcbt58", "Situation"],
    ["question_eqxptw", "Gesetzlich oder privat?"],
  ],
  tier: [
    ["question_lcbt58", "Geburtsjahr (Tier)"],
    ["question_eqxptw", "Anzahl Tiere"],
    ["custom-3c0582d272071ca96984f56", "Tiername"],
    ["question_i9986q", "Geschlecht (Tier)"],
    ["question_xgnb49", "Rasse (Tier)"],
    ["question_z6lukx", "Geburtsmonat (Tier)"],
    ["question_iaqdzg", "Kastriert (Tier)"],
    ["question_qp1yb6", "Haltung (Tier)"],
  ],
  futter: [
    ["question_eqxptw", "Geschlecht (Tier)"],
    ["name-des-hundes", "Tiername"],
    ["question_pdyv4a", "Rasse (Tier)"],
    ["question_3p4m5l", "Kastriert (Tier)"],
    ["question_tcq67l", "Alter (Futter)"],
    ["input_4lrfrj", "Gewicht (Futter)"],
    ["question_9kg73s", "Aktivitätslevel (Futter)"],
    ["question_x29wa3", "Gesundheitliche Probleme (Futter)"],
    ["input_c1768c", "Gesundheit-Detail (Futter)"],
    ["question_23y1hz", "Allergien (Futter)"],
    ["input_9qgtkw", "Allergie-Detail (Futter)"],
    ["input_1vyqmb", "Aktuelles Futter (Futter)"],
  ],
  sterbegeld: [
    ["question_eqxptw", "Interesse (Sterbegeld)"],
    ["question_lcbt58", "Absicherungshöhe (Sterbegeld)"],
    ["question_m1rb3r", "Altersklasse (Sterbegeld)"],
  ],
  ksp: [
    ["question_eqxptw", "Anzahl Kinder (KSP)"],
    ["question_lcbt58", "Zielbetrag (KSP)"],
    ["question_6bkgvf", "Alter der Kinder (KSP)"],
    ["question_eaybwd", "Alter der Kinder (KSP)"],
    ["question_r5mv5l", "Monatliche Sparrate (KSP)"],
    ["question_tcq67l", "Zeithorizont (KSP)"],
  ],
  zahnzusatz: [
    ["question_lcbt58", "Fehlende Zähne (Zahnzusatz)"],
    ["question_eqxptw", "Interesse (Zahnzusatz)"],
  ],
};

/** Geburtsdatum als TT.MM.JJJJ (aus ISO, T.M.JJJJ oder T/M/JJJJ). */
export function formatBirthday(raw: string): string {
  const s = raw.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[3].padStart(2, "0")}.${m[2].padStart(2, "0")}.${m[1]}`;
  m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(s);
  if (m) return `${m[1].padStart(2, "0")}.${m[2].padStart(2, "0")}.${m[3]}`;
  return s;
}

/** „1.200,50 €“ → "1200.5" (Text, damit es als Feld bleibt). */
export function parseEuro(raw: string): string {
  const s = raw.replace(/[^\d,.]/g, "");
  if (!s) return "";
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/\.(?=\d{3}(\D|$))/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? String(n) : "";
}

export function translatePerspective(body: Obj, productSlug: string): { externalId: string | null; fields: Record<string, string> } {
  const profile = isObj(body.profile) ? body.profile : {};
  const values = isObj(body.values) ? body.values : {};
  // Reihenfolge wie im Zap: values → profile → flache Felder; erster belegter Wert gewinnt
  const get = (...keys: string[]) => {
    for (const k of keys) {
      for (const src of [values, profile, body]) {
        const v = text((src as Obj)[k]);
        if (v) return v;
      }
    }
    return "";
  };
  const fields: Record<string, string> = {
    Vorname: get("firstName", "first_name", "vorname"),
    Nachname: get("lastName", "last_name", "nachname"),
    "E-Mail": get("email"),
    Telefonnummer: get("phone", "telefon", "telefonnummer"),
    Geburtsdatum: formatBirthday(get("birthday", "geburtsdatum")),
    Postleitzahl: get("zip", "address#postalCode", "postleitzahl", "plz").replace(/\D/g, "").slice(0, 5),
    Ort: get("city", "address#city", "ort"),
  };
  const cat = categoryOf(productSlug);
  if (cat === "pkv") {
    fields["Aktuelle Versicherung"] = get("input_1w2ux1");
    fields["Wie lange in PKV?"] = get("question_4lb8co");
    fields["Monatlicher Beitrag"] = parseEuro(get("custom-69e114fc5f2bf28c0301a25f", "beitrag", "monatsbeitrag"));
  }
  if (cat === "tier") {
    const s = productSlug.toLowerCase();
    fields["Tierart"] = s.includes("katzen") ? "Katze" : s.includes("hunde") ? "Hund" : s.includes("pferd") ? "Pferd" : "";
  }
  for (const [key, label] of MAP[cat]) {
    const v = get(key);
    if (v) fields[label] = fields[label] ? `${fields[label]}, ${v}` : v;
  }
  const src = get("source");
  if (src) fields["Source"] = src;
  for (const [k, v] of Object.entries(fields)) if (!v) delete fields[k];
  const id = text(body.id);
  return { externalId: id ? `perspective:${id}` : null, fields };
}
