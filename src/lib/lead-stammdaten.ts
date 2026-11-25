// Lead-Stammdaten im Kontakt korrigieren (Ole, 14.11.2026): Vermittler können Tippfehler in Name,
// Anrede, Telefon, E-Mail und Adresse beheben. Die Formularantworten (Lead.formData) bleiben
// unverändert als Herkunft; Korrekturen stehen in Lead.contactOverrides bzw. in name/phone/email.
// Ab der ersten Korrektur überschreibt der Airtable-Abgleich Name, Telefon und E-Mail nicht mehr.

import { prisma } from "@/lib/prisma";
import { logLeadHistory } from "@/lib/lead-history";
import { EMAIL_RE, normalizePhone } from "@/lib/whatsapp/phone";
import { namePartsFromForm, salutationFromForm, salutationOf, type Salutation } from "@/lib/ansprache";
import { anredeAusVorname, anredeBewusstOffen } from "@/lib/vorname-anrede";
import { bereinigeWeitereEmails, parseWeitereEmails } from "@/lib/lead-emails";

export type Stammdaten = {
  salutation: Salutation | null;
  firstName: string;
  lastName: string;
  /** normalisiert ohne „+“, z. B. 4915112345678 */
  phone: string | null;
  email: string | null;
  /** Weitere E-Mail-Adressen, mit „, “ verbunden (Lead.weitereEmails, lib/lead-emails.ts) */
  weitereEmails: string;
  street: string;
  zip: string;
  city: string;
};

/** Gespeicherte Korrekturen (nur, was nicht in name/phone/email steht) */
export type ContactOverrides = Partial<Pick<Stammdaten, "firstName" | "lastName" | "street" | "zip" | "city">> & {
  /** „keine“: Vermittler hat „Keine Angabe“ gewählt, dann keine Anrede aus dem Vornamen (Ole, 16.11.2026) */
  salutation?: Salutation | "keine";
};

const LABEL: Record<keyof Stammdaten, string> = {
  salutation: "Anrede",
  firstName: "Vorname",
  lastName: "Nachname",
  phone: "Telefon",
  email: "E-Mail",
  weitereEmails: "Weitere E-Mail",
  street: "Straße",
  zip: "Postleitzahl",
  city: "Ort",
};

export function asOverrides(v: unknown): ContactOverrides {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const o = v as Record<string, unknown>;
  const out: ContactOverrides = {};
  for (const k of ["firstName", "lastName", "street", "zip", "city"] as const) if (typeof o[k] === "string") out[k] = o[k] as string;
  const sal = salutationOf(o.salutation);
  if (sal) out.salutation = sal;
  else if (anredeBewusstOffen(o.salutation)) out.salutation = "keine";
  return out;
}

/**
 * Formularantworten mit den Korrekturen davor: salutationFromForm/namePartsFromForm nehmen den ersten Treffer,
 * so gelten die Korrekturen, ohne dass die ursprünglichen Antworten verändert werden.
 */
export function formWithOverrides(formData: unknown, overrides: unknown): unknown {
  const o = asOverrides(overrides);
  const pre: { label: string; value: string }[] = [];
  if (o.salutation) pre.push({ label: "Anrede", value: o.salutation });
  if (o.firstName) pre.push({ label: "Vorname", value: o.firstName });
  if (o.lastName) pre.push({ label: "Nachname", value: o.lastName });
  if (pre.length === 0) return formData;
  return [...pre, ...(Array.isArray(formData) ? formData : [])];
}

const str = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");

/** Antwort aus dem Leadformular (Lead.formData) zu einer Frage, z. B. Postleitzahl aus dem Perspective- oder Meta-Formular. */
function formAntwort(formData: unknown, re: RegExp): string {
  if (!Array.isArray(formData)) return "";
  for (const x of formData) {
    const { label, value } = (x ?? {}) as { label?: unknown; value?: unknown };
    if (typeof label === "string" && re.test(label.trim()) && str(value)) return str(value);
  }
  return "";
}

const ANREDE_LABEL = /^(ihre)?anrede$|^salutation$|^geschlecht$|^gender$|^title$/;
/** Steht im Formular ausdrücklich „Divers“ oder „Keine Angabe“ als Anrede? */
function formOffen(formData: unknown): boolean {
  if (!Array.isArray(formData)) return false;
  return formData.some((x) => {
    const { label, value } = (x ?? {}) as { label?: unknown; value?: unknown };
    return typeof label === "string" && ANREDE_LABEL.test(label.toLowerCase().normalize("NFKD").replace(/[^a-z]/g, "")) && anredeBewusstOffen(value);
  });
}

/** Aktuelle Stammdaten eines Leads (Korrekturen vor Formular vor Airtable-Feldern) */
export function currentStammdaten(
  lead: { name: string | null; phone: string | null; email: string | null; weitereEmails?: string[] | null; formData: unknown; contactOverrides: unknown },
  fields?: Record<string, unknown> | null,
): Stammdaten {
  const o = asOverrides(lead.contactOverrides);
  const parts = namePartsFromForm(lead.formData);
  const words = (lead.name ?? "").trim().split(/\s+/).filter(Boolean);
  const f = (k: string) => str(Array.isArray(fields?.[k]) ? (fields?.[k] as unknown[])[0] : fields?.[k]);
  const firstName = o.firstName ?? parts.firstName ?? (f("Vorname") || words[0] || "");
  // Anrede: Korrektur, Formular, Airtable; sonst aus einem eindeutigen Vornamen (Ole, 18.11.2026: „solange wir uns
  // sicher sind“), außer sie wurde bewusst offen gelassen (Keine Angabe, Divers)
  const offen = o.salutation === "keine" || formOffen(lead.formData) || anredeBewusstOffen(f("Anrede"));
  const salutation = o.salutation === "keine" ? null : (o.salutation ?? salutationFromForm(lead.formData) ?? salutationOf(f("Anrede")) ?? (offen ? null : anredeAusVorname(firstName)));
  return {
    salutation,
    firstName,
    lastName: o.lastName ?? parts.lastName ?? (f("Nachname") || words.slice(1).join(" ")),
    phone: lead.phone,
    email: lead.email,
    weitereEmails: bereinigeWeitereEmails(lead.weitereEmails ?? [], lead.email).join(", "),
    // Adresse auch aus dem Leadformular (Leads ohne Airtable: Perspective, Meta), Ole 17.11.2026
    street: o.street ?? (f("Straße") || f("Strasse") || f("Straße und Hausnummer") || formAntwort(lead.formData, /^(stra(ß|ss)e( und hausnummer)?|street( address)?|street_address)$/i)),
    zip: o.zip ?? (f("Postleitzahl") || formAntwort(lead.formData, /^(postleitzahl|plz|zip( code)?|post[ _]?code|postal[ _]code)$/i)),
    city: o.city ?? (f("Ort") || formAntwort(lead.formData, /^(ort|wohnort|stadt|city)$/i)),
  };
}

export type StammdatenInput = Record<Exclude<keyof Stammdaten, "weitereEmails">, string> & { weitereEmails?: string };

/** Eingaben prüfen und normalisieren */
export function parseStammdaten(input: Partial<StammdatenInput>): { ok: true; data: Stammdaten } | { ok: false; error: string } {
  const firstName = str(input.firstName).slice(0, 80);
  const lastName = str(input.lastName).slice(0, 80);
  if (!firstName && !lastName) return { ok: false, error: "Bitte mindestens Vor- oder Nachnamen angeben." };
  const phoneRaw = str(input.phone);
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  if (phoneRaw && !phone) return { ok: false, error: "Die Telefonnummer sieht nicht gültig aus. Beispiel: +49 171 1234567 oder 0171 1234567." };
  const email = str(input.email).toLowerCase() || null;
  if (email && !EMAIL_RE.test(email)) return { ok: false, error: "Die E-Mail-Adresse sieht nicht gültig aus." };
  const weitere = parseWeitereEmails(str(input.weitereEmails), email);
  if (!weitere.ok) return weitere;
  const zip = str(input.zip).slice(0, 10);
  if (zip && !/^[0-9A-Za-z -]{3,10}$/.test(zip)) return { ok: false, error: "Die Postleitzahl sieht nicht gültig aus." };
  return {
    ok: true,
    data: {
      salutation: salutationOf(str(input.salutation)),
      firstName,
      lastName,
      phone,
      email,
      weitereEmails: weitere.list.join(", "),
      street: str(input.street).slice(0, 120),
      zip,
      city: str(input.city).slice(0, 80),
    },
  };
}

const show = (k: keyof Stammdaten, v: Stammdaten[keyof Stammdaten]) => {
  if (v == null || v === "") return "leer";
  if (k === "phone") return `+${v}`;
  return String(v);
};

/** Text für den Verlauf, z. B. „Telefon geändert von +49… auf +49…“ */
export function diffText(before: Stammdaten, after: Stammdaten): string[] {
  const out: string[] = [];
  for (const k of Object.keys(LABEL) as (keyof Stammdaten)[]) {
    if ((before[k] ?? "") === (after[k] ?? "")) continue;
    out.push(`${LABEL[k]} geändert von ${show(k, before[k])} auf ${show(k, after[k])}`);
  }
  return out;
}

export type SaveStammdatenResult =
  | { ok: true; changed: string[]; hinweise: string[]; /** Nummer geändert, noch keine Erstnachricht: Knopf „Per WhatsApp anschreiben“ */ erstnachrichtAnbieten?: boolean }
  | { ok: false; error: string };

/**
 * Erstnachricht an die (korrigierte) Nummer schicken (Knopf nach dem Ändern, Ole 22.11.2026). Gleiche Regeln wie das
 * automatische Erstanschreiben (Assistent an, WhatsApp verbunden, Einwilligung). Text für die Meldung.
 */
export async function erstnachrichtAnNeueNummer(leadId: string, customerId: string): Promise<{ ok: boolean; text: string }> {
  // Unter Sperre je Lead (Ole, 25.11.2026, doppelte Erstnachricht): ein zweiter Klick wartet und sieht dann „schon raus“.
  // Die Transaktion hält nur die Sperre; Lesen, Zurücksetzen und Senden laufen außerhalb (sofort sichtbar für runOutreach).
  const r = await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`erstnachricht:${leadId}`}))`;
      const l = await prisma.lead.findFirst({ where: { id: leadId, customerId, erasedAt: null }, select: { id: true, phone: true, outreachStatus: true } });
      if (!l?.phone) return { abbruch: "Keine Telefonnummer hinterlegt." };
      if (l.outreachStatus?.startsWith("sent")) return { abbruch: "Die Erstnachricht ist schon rausgegangen." };
      await prisma.lead.update({ where: { id: l.id }, data: { outreachAt: null, outreachStatus: null, waUnavailableAt: null } });
      return { abbruch: null, lauf: await import("@/lib/whatsapp/outreach").then((m) => m.runOutreach(customerId, { leadIds: [l.id] })).catch(() => null) };
    },
    { maxWait: 60_000, timeout: 90_000 },
  );
  if (r.abbruch) return { ok: false, text: r.abbruch };
  if ("lauf" in r && r.lauf?.sent) return { ok: true, text: "Die WhatsApp-Erstnachricht ist rausgegangen." };
  const st = (await prisma.lead.findUnique({ where: { id: leadId }, select: { outreachStatus: true } }))?.outreachStatus;
  return { ok: false, text: st ? `Nicht gesendet (${st}). Bitte rufen Sie an.` : "Nicht gesendet: Assistent oder WhatsApp ist nicht aktiv. Bitte rufen Sie an." };
}

export async function saveLeadStammdaten(opts: {
  leadId: string;
  customerId: string;
  userId: string | null;
  input: Partial<StammdatenInput>;
  /** bei Airtable-Leads die bisher angezeigten Felder (für Adresse und Anrede im Verlauf) */
  fields?: Record<string, unknown> | null;
}): Promise<SaveStammdatenResult> {
  const parsed = parseStammdaten(opts.input);
  if (!parsed.ok) return parsed;
  const lead = await prisma.lead.findFirst({
    where: { id: opts.leadId, customerId: opts.customerId, erasedAt: null },
    select: { id: true, name: true, phone: true, email: true, weitereEmails: true, formData: true, contactOverrides: true, airtableId: true },
  });
  if (!lead) return { ok: false, error: "Lead nicht gefunden." };
  // Vorher: was bisher sichtbar war (Korrektur, Formular, bei Airtable-Leads die angezeigten Felder)
  const before = currentStammdaten(lead, opts.fields ?? null);
  // Ohne Feld „Weitere E-Mail“ in der Eingabe bleiben die weiteren Adressen, wie sie sind
  const after = opts.input.weitereEmails === undefined ? { ...parsed.data, weitereEmails: before.weitereEmails } : parsed.data;
  const changed = diffText(before, after);
  if (changed.length === 0) return { ok: true, changed: [], hinweise: [] };

  const overrides: ContactOverrides = {
    // „Keine Angabe“ merken, wenn bisher eine Anrede galt (sonst käme die Anrede aus dem Vornamen zurück)
    ...(after.salutation ? { salutation: after.salutation } : before.salutation || asOverrides(lead.contactOverrides).salutation === "keine" ? { salutation: "keine" as const } : {}),
    firstName: after.firstName,
    lastName: after.lastName,
    street: after.street,
    zip: after.zip,
    city: after.city,
  };
  const name = [after.firstName, after.lastName].filter(Boolean).join(" ");
  await prisma.lead.update({
    where: { id: lead.id },
    // Neue Nummer: „kein WhatsApp“ galt der alten Nummer (Ole, 22.11.2026)
    data: { ...(after.phone !== before.phone ? { waUnavailableAt: null } : {}), name, phone: after.phone, email: after.email, weitereEmails: bereinigeWeitereEmails(after.weitereEmails.split(", "), after.email), contactOverrides: overrides, contactEditedAt: new Date() },
  });

  const hinweise: string[] = [];
  let erstnachrichtAnbieten = false;
  // WhatsApp: Chat mit der alten Nummer zieht auf die neue Nummer um (Verlauf bleibt am Lead)
  if (after.phone && after.phone !== before.phone) {
    const moved = await moveConversation(opts.customerId, lead.id, before.phone, after.phone);
    if (moved === "moved") hinweise.push("Der WhatsApp-Chat läuft ab jetzt über die neue Nummer.");
    if (moved === "linked") hinweise.push("Zur neuen Nummer gab es schon einen WhatsApp-Chat, er ist jetzt mit diesem Lead verbunden.");
    // Nummer korrigiert (Ole, 22.11.2026): Aufgabe „Nummer prüfen“ ist erledigt, und ging noch keine Erstnachricht raus,
    // schickt die App sie jetzt an die neue Nummer (gleiche Regeln wie sonst: Assistent an, WhatsApp verbunden)
    await prisma.leadTask.updateMany({ where: { leadId: lead.id, kind: "nummer_pruefen", status: { in: ["wartet", "aktiv"] } }, data: { status: "entfallen", endedReason: "Nummer korrigiert" } });
    await prisma.lead.updateMany({ where: { id: lead.id, followUpNote: { startsWith: "Nummer prüfen" } }, data: { followUpAt: null, followUpNote: null } });
    // Ole, 22.11.2026: Der Vermittler entscheidet per Klick, ob die neue Nummer die Erstnachricht bekommt
    const l = await prisma.lead.findUnique({ where: { id: lead.id }, select: { outreachStatus: true } });
    // „sent“ und „sent_booked“ (schon gebucht) zählen als gesendet (22.11.2026: doppelte Erstnachricht)
    if (l && !l.outreachStatus?.startsWith("sent")) erstnachrichtAnbieten = true;
  }
  // Galt der Lead wegen der alten Nummer als „kein WhatsApp“: neu versuchen (lib/whatsapp/kein-whatsapp.ts)
  if (after.phone && after.phone !== before.phone) {
    const { nachNummernKorrektur } = await import("@/lib/whatsapp/kein-whatsapp");
    const r = await nachNummernKorrektur(lead.id);
    if (r === "termin") hinweise.push("Die Terminbestätigung geht per WhatsApp an die neue Nummer.");
    if (r === "erstanschreiben") hinweise.push("Der Assistent schreibt die neue Nummer per WhatsApp an.");
  }
  if (after.email && after.email !== before.email) {
    await prisma.conversation.updateMany({ where: { customerId: opts.customerId, leadId: lead.id }, data: { contactEmail: after.email } });
  }
  if (name !== (lead.name ?? "")) {
    await prisma.conversation.updateMany({ where: { customerId: opts.customerId, leadId: lead.id }, data: { contactName: name } });
  }
  // Dubletten: anderer Lead mit derselben Nummer oder E-Mail (nur Hinweis, kein Sperren)
  const or: object[] = [];
  if (after.phone && after.phone !== before.phone) or.push({ phone: after.phone });
  if (after.email && after.email !== before.email) or.push({ email: { equals: after.email, mode: "insensitive" } });
  if (or.length) {
    const dup = await prisma.lead.findFirst({
      where: { customerId: opts.customerId, id: { not: lead.id }, erasedAt: null, OR: or },
      select: { name: true },
    });
    if (dup) hinweise.push(`Achtung: ${dup.name ? `„${dup.name}“` : "Ein anderer Lead"} hat dieselbe Telefonnummer oder E-Mail. Prüfen Sie, ob es eine Dublette ist.`);
  }

  await logLeadHistory(lead.id, "stammdaten", changed.join("\n"), { customerId: opts.customerId, userId: opts.userId });
  return { ok: true, changed, hinweise, ...(erstnachrichtAnbieten ? { erstnachrichtAnbieten } : {}) };
}

async function moveConversation(customerId: string, leadId: string, oldPhone: string | null, newPhone: string): Promise<"moved" | "linked" | "none"> {
  const existing = await prisma.conversation.findUnique({ where: { customerId_contactPhone: { customerId, contactPhone: newPhone } }, select: { id: true, leadId: true } });
  if (existing) {
    if (!existing.leadId) {
      await prisma.conversation.update({ where: { id: existing.id }, data: { leadId } });
      return "linked";
    }
    return "none";
  }
  if (!oldPhone) return "none";
  const old = await prisma.conversation.findUnique({ where: { customerId_contactPhone: { customerId, contactPhone: oldPhone } }, select: { id: true, leadId: true } });
  if (!old || old.leadId !== leadId) return "none";
  // Das 24-Stunden-Fenster gehört zur alten Nummer: für die neue gilt es nicht
  await prisma.conversation.update({ where: { id: old.id }, data: { contactPhone: newPhone, windowExpiresAt: null } });
  return "moved";
}

/** Anzeige im Kontakt: Korrekturen über die Felder aus Airtable bzw. dem Formular legen */
export function applyStammdatenToFields(
  fields: Record<string, unknown>,
  lead: { name: string | null; phone: string | null; email: string | null; formData: unknown; contactOverrides: unknown; contactEditedAt: Date | null },
): Record<string, unknown> {
  if (!lead.contactEditedAt) return fields;
  const s = currentStammdaten(lead, fields);
  const out = { ...fields };
  const set = (k: string, v: string | null) => {
    if (v) out[k] = v;
    else delete out[k];
  };
  set("Vorname", s.firstName);
  set("Nachname", s.lastName);
  set("Telefonnummer", s.phone ? `+${s.phone}` : null);
  set("E-Mail", s.email);
  set("Postleitzahl", s.zip);
  set("Ort", s.city);
  if (s.street) out["Straße"] = s.street;
  if (s.salutation) out["Anrede"] = s.salutation;
  return out;
}
