// Eingehende Leads: Meta Lead Ads (über Zapier / Make), Landingpage-Formulare
// (z.B. Perspective) oder jedes andere Tool, das einen Webhook schicken kann.
// Felder werden tolerant erkannt – inkl. Metas "field_data"-Format.
import { prisma } from "@/lib/prisma";
import { Matcher, flatten, norm } from "@/lib/vertrieb/linkedin";
import type { Prisma } from "@/generated/prisma/client";
import { SOURCE_LABEL } from "@/lib/vertrieb/crm";
import { normalizeLinkedInUrl } from "@/lib/vertrieb/linkedin";

const K = {
  email: ["email", "emailadresse", "mail", "eMail", "workemail", "businessemail"],
  phone: ["phonenumber", "phone", "telefon", "telefonnummer", "mobile", "mobil", "handy", "tel"],
  fullName: ["fullname", "name", "vollstandigername", "vollername"],
  firstName: ["firstname", "vorname"],
  lastName: ["lastname", "nachname"],
  company: ["companyname", "company", "agentur", "agenturname", "firma", "unternehmen", "firmenname"],
  city: ["city", "stadt", "ort", "wohnort"],
  zip: ["zipcode", "zip", "postcode", "postalcode", "plz", "postleitzahl"],
  campaign: ["campaignname", "campaign", "kampagne", "utmcampaign"],
  adset: ["adsetname", "adset", "anzeigengruppe"],
  ad: ["adname", "ad", "anzeige", "utmcontent"],
  form: ["formname", "form", "formular", "leadformname"],
  platform: ["platform", "utmsource", "source", "quelle"],
  linkedin: ["linkedinurl", "linkedin", "linkedinprofil", "profileurl", "profilurl"],
  message: ["message", "nachricht", "text", "comment", "kommentar"],
};
const TECH = new Set(
  ["id", "leadid", "leadgenid", "formid", "adid", "adsetid", "campaignid", "pageid", "createdtime", "createdat", "timestamp", "isorganic", "token", "partnername", "retailerid", "vehicle", "inboxurl"].map(norm),
);

function pick(f: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys.map(norm)) {
    const v = f[k];
    if (v == null || v === "") continue;
    return Array.isArray(v) ? v.map(String).join(", ") : String(v).trim();
  }
  return null;
}

/** Metas field_data: [{ name: "email", values: ["a@b.de"] }] → { email: "a@b.de" } */
function fromFieldData(raw: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const walk = (o: unknown) => {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o)) {
      for (const x of o) {
        if (x && typeof x === "object" && "name" in x && ("values" in x || "value" in x)) {
          const r = x as { name: string; values?: unknown[]; value?: unknown };
          out[String(r.name)] = r.values ? r.values.map(String).join(", ") : String(r.value ?? "");
        } else walk(x);
      }
      return;
    }
    for (const v of Object.values(o as Record<string, unknown>)) walk(v);
  };
  walk(raw);
  return out;
}

export type ParsedLead = {
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  city: string | null;
  zip: string | null;
  campaign: string | null;
  ad: string | null;
  form: string | null;
  platform: string | null;
  answers: string | null;
  linkedinUrl: string | null;
  message: string | null;
};

export function parseLead(raw: unknown): ParsedLead {
  const fd = fromFieldData(raw);
  const flat = { ...flatten(raw), ...flatten(fd) };
  let firstName = pick(flat, K.firstName);
  let lastName = pick(flat, K.lastName);
  if (!firstName && !lastName) {
    const full = pick(flat, K.fullName);
    if (full) {
      const parts = full.split(/\s+/);
      firstName = parts[0];
      lastName = parts.slice(1).join(" ") || null;
    }
  }
  const email = pick(flat, K.email);
  const used = new Set(Object.values(K).flat().map(norm));
  // Alle übrigen Formularfelder (eigene Fragen) als Antworten speichern
  const answerSrc = Object.keys(fd).length ? fd : (raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {});
  const answers = Object.entries(answerSrc)
    .filter(([k, v]) => !used.has(norm(k)) && !TECH.has(norm(k)) && v != null && v !== "" && typeof v !== "object")
    .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`)
    .join("\n");
  return {
    email: email && email.includes("@") ? email.toLowerCase() : null,
    phone: pick(flat, K.phone),
    firstName,
    lastName,
    company: pick(flat, K.company),
    city: pick(flat, K.city),
    zip: pick(flat, K.zip),
    campaign: [pick(flat, K.campaign), pick(flat, K.adset)].filter(Boolean).join(" / ") || null,
    ad: pick(flat, K.ad),
    form: pick(flat, K.form),
    platform: pick(flat, K.platform),
    answers: answers || null,
    linkedinUrl: (() => {
      const u = pick(flat, K.linkedin);
      return u && /linkedin\.com\/in\//i.test(u) ? u : null;
    })(),
    message: pick(flat, K.message),
  };
}

const SOURCE_TEXT: Record<string, string> = SOURCE_LABEL;

export async function handleInboundLead(raw: unknown, source = "META_ADS", opts: { taskTitle?: string; activity?: string } = {}) {
  const l = parseLead(raw);
  if (!l.email && !l.phone && !l.lastName && !l.firstName && !l.linkedinUrl) return { ignored: "keine Kontaktdaten erkannt" };
  const label = SOURCE_TEXT[source] ?? source;
  const matcher = await Matcher.load();
  const m =
    matcher.match({ url: l.linkedinUrl, slug: normalizeLinkedInUrl(l.linkedinUrl), firstName: null, lastName: null, email: l.email, company: null, location: null, status: null, connectedAt: null, messageAt: null, repliedAt: null, list: null, tags: null }) ??
    matcher.match({ url: null, slug: null, firstName: l.firstName, lastName: l.lastName, email: null, company: null, location: l.city, status: null, connectedAt: null, messageAt: null, repliedAt: null, list: null, tags: null });

  let contactId = m?.id ?? null;
  let created = false;
  if (!contactId) {
    const fullName = [l.firstName, l.lastName].filter(Boolean).join(" ");
    const slug = normalizeLinkedInUrl(l.linkedinUrl);
    const email = l.email ?? (slug ? `linkedin-${slug}@ohne-email.invalid` : `lead-${Date.now()}@ohne-email.invalid`);
    const existing = l.email ? await prisma.salesContact.findUnique({ where: { email }, select: { id: true } }) : null;
    if (existing) contactId = existing.id;
    else {
      const c = await prisma.salesContact.create({
        data: {
          email,
          name: l.company ?? (fullName || email),
          firstName: l.firstName,
          lastName: l.lastName,
          phone: l.phone,
          linkedinUrl: l.linkedinUrl,
          city: l.city,
          zip: l.zip,
          stage: "INTERESSE",
          customerSource: source,
          customerSourceNote: [l.campaign, l.ad].filter(Boolean).join(" · ") || null,
          description: `Lead über ${label}`,
        },
      });
      contactId = c.id;
      created = true;
    }
  }

  if (!created) {
    const c = await prisma.salesContact.findUniqueOrThrow({ where: { id: contactId }, select: { stage: true, phone: true, customerSource: true } });
    await prisma.salesContact.update({
      where: { id: contactId },
      data: {
        phone: c.phone ?? l.phone ?? undefined,
        linkedinUrl: l.linkedinUrl ?? undefined,
        // Kontakt hat sich selbst gemeldet → mindestens "Interesse"
        stage: ["NEU", "NICHT_ERREICHT", "WIEDERVORLAGE", "SPAETER", "VERLOREN", "UNGUELTIG"].includes(c.stage) ? "INTERESSE" : undefined,
        lossReason: ["VERLOREN", "UNGUELTIG"].includes(c.stage) ? null : undefined,
        customerSource: c.customerSource ?? source,
        customerSourceNote: c.customerSource ? undefined : [l.campaign, l.ad].filter(Boolean).join(" · ") || null,
      },
    });
  }

  const info = [
    l.form && `Formular: ${l.form}`,
    l.campaign && `Kampagne: ${l.campaign}`,
    l.ad && `Anzeige: ${l.ad}`,
    l.platform && `Plattform: ${l.platform}`,
    [l.firstName, l.lastName].filter(Boolean).length && `Name: ${[l.firstName, l.lastName].filter(Boolean).join(" ")}`,
    l.email && `E-Mail: ${l.email}`,
    l.phone && `Telefon: ${l.phone}`,
    l.linkedinUrl && `LinkedIn: ${l.linkedinUrl}`,
    l.message && `Nachricht:\n${l.message}`,
    l.answers,
  ].filter(Boolean).join("\n");

  await prisma.salesInboundLead.create({
    data: {
      contactId,
      source,
      name: [l.firstName, l.lastName].filter(Boolean).join(" ") || null,
      email: l.email,
      phone: l.phone,
      campaign: l.campaign,
      ad: l.ad,
      form: l.form,
      answers: [l.message, l.answers].filter(Boolean).join("\n") || null,
      created,
      payload: (raw ?? {}) as Prisma.InputJsonValue,
    },
  });
  await prisma.salesActivity.create({
    data: {
      contactId,
      type: source === "LINKEDIN" ? "LINKEDIN" : "NOTIZ",
      outcome: `${opts.activity ?? `Lead über ${label} eingetragen`}${created ? " (neuer Kontakt)" : ""}`,
      note: info || null,
    },
  });
  await prisma.salesTask.create({
    data: { contactId, title: opts.taskTitle ?? `Neuen ${label}-Lead anrufen`, type: "ANRUF", dueAt: new Date(), note: info.slice(0, 500) || null },
  });
  return { ok: true, created, matched: m?.via ?? null, contactId };
}
