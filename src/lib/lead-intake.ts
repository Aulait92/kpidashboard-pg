// Direkter Lead-Eingang ohne Airtable: Meta-Webhook (leadgen) oder Zapier-
// Webhook liefern einen Lead → Zuordnung über das Leadformular (LeadSource)
// → Lead in der Datenbank → sofort weiterverarbeiten (Push an den Kunden,
// WhatsApp-Erstanschreiben, bei „Nur Betreuung“ Lead-Mail). Formulare ohne
// Zuordnung landen im Posteingang (UnassignedLead) und gehen nicht verloren.
// Dieselbe Person erneut beim selben Kunden (Telefon oder E-Mail): kein zweiter Lead (lib/lead-erneut.ts).

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/whatsapp/phone";
import { attachLeadToContact } from "@/lib/whatsapp/lead-link";
import { sendToAdmins } from "@/lib/push";
import { assignLead } from "@/lib/team";
import { EMPFEHLUNG_SOURCE } from "@/lib/lead-herkunft";
import { empfehlungPush } from "@/lib/empfehlung/shared";
import { reportError } from "@/lib/monitoring";
import { runOutreach } from "@/lib/whatsapp/outreach";
import { emailLeads } from "@/lib/onboarding-cron";
import { tryReentry } from "@/lib/lead-erneut";
import type { MetaLead } from "@/lib/meta-leads";
import { consentStateOf, istKnopfFassung, parseDisclaimerResponses, type ConsentNachweis, type DisclaimerResponse } from "@/lib/einwilligung-leadformular";
import { logTestLead } from "@/lib/testlead";
import { adData, adFromFlat, adFromMetaLead, mergeAd, type LeadAd } from "@/lib/anzeige";
import { handleInboundLead } from "@/lib/vertrieb/inbound";

export type IncomingLead = {
  externalId: string | null;
  formId: string | null;
  pageId: string | null;
  createdAt: string; // ISO
  campaignName: string | null;
  adName: string | null;
  fields: Record<string, string>;
  /** Häkchen im Formular (custom_disclaimer_responses); null = Formular ohne eigenen Hinweis bzw. unbekannt */
  disclaimer?: DisclaimerResponse[] | null;
  /** Anzeige (Plattform, Kampagne, Anzeigengruppe, Anzeige; lib/anzeige.ts). Fehlt bei älteren Payloads im Lead-Eingang. */
  ad?: LeadAd | null;
};

const META_KEYS = new Set([
  "id", "leadgen_id", "lead_id", "form_id", "page_id", "created_time", "ad_id", "ad_name", "adset_id",
  "adset_name", "campaign_id", "campaign_name", "platform", "is_organic", "form_name", "page_name",
  "field_data", "partner_name", "retailer_item_id", "vehicle", "inbox_url", "custom_disclaimer_responses",
]);

const str = (v: unknown) => (v == null ? "" : Array.isArray(v) ? v.map(String).join(", ") : String(v)).trim();

export function fromMetaLead(l: MetaLead, pageId: string | null): IncomingLead {
  const fields: Record<string, string> = {};
  for (const f of l.field_data ?? []) fields[f.name] = (f.values ?? []).join(", ").trim();
  return {
    externalId: l.id,
    formId: l.form_id ?? null,
    pageId,
    createdAt: l.created_time ? new Date(l.created_time).toISOString() : new Date().toISOString(),
    campaignName: l.campaign_name ?? null,
    adName: l.ad_name ?? null,
    fields,
    disclaimer: parseDisclaimerResponses(l.custom_disclaimer_responses),
    ad: adFromMetaLead(l),
  };
}

/** Flaches JSON (z. B. aus Zapier „Facebook Lead Ads“) in einen Lead übersetzen. */
export function fromFlatPayload(body: Record<string, unknown>): IncomingLead {
  const fields: Record<string, string> = {};
  if (Array.isArray(body.field_data)) {
    for (const f of body.field_data as { name?: string; values?: unknown }[]) {
      if (f?.name) fields[f.name] = str(f.values);
    }
  }
  for (const [k, v] of Object.entries(body)) {
    if (META_KEYS.has(k.toLowerCase()) || v == null || typeof v === "object") continue;
    const value = str(v);
    if (value) fields[k] = value;
  }
  const created = str(body.created_time);
  return {
    externalId: str(body.leadgen_id) || str(body.lead_id) || str(body.id) || null,
    formId: str(body.form_id) || null,
    pageId: str(body.page_id) || null,
    createdAt: created && !Number.isNaN(new Date(created).getTime()) ? new Date(created).toISOString() : new Date().toISOString(),
    campaignName: str(body.campaign_name) || null,
    adName: str(body.ad_name) || null,
    fields,
    disclaimer: parseDisclaimerResponses(body.custom_disclaimer_responses),
    ad: adFromFlat(body),
  };
}

const norm = (k: string) => k.toLowerCase().replace(/[^a-z0-9äöüß]/g, "");
const pick = (fields: Record<string, string>, keys: string[]) => {
  const want = new Set(keys.map(norm));
  for (const [k, v] of Object.entries(fields)) if (want.has(norm(k)) && v) return { key: k, value: v };
  return null;
};

/** Standardfelder der Meta-Leadformulare auf Deutsch (sonst stünde „Post code“, „City“ im Kontakt). */
const META_STANDARD: Record<string, string> = {
  post_code: "Postleitzahl",
  zip_code: "Postleitzahl",
  zip: "Postleitzahl",
  city: "Ort",
  street_address: "Straße",
  date_of_birth: "Geburtsdatum",
  state: "Bundesland",
  province: "Bundesland",
  country: "Land",
  job_title: "Beruf",
  company_name: "Firma",
  marital_status: "Familienstand",
  gender: "Geschlecht",
};

function prettify(key: string): string {
  const std = META_STANDARD[key.trim().toLowerCase()];
  if (std) return std;
  const s = key.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  return s ? s[0].toUpperCase() + s.slice(1) : key;
}

export function extract(inc: Pick<IncomingLead, "fields">, labels: Record<string, string>) {
  const used = new Set<string>();
  const take = (keys: string[]) => {
    const hit = pick(inc.fields, keys);
    if (hit) used.add(hit.key);
    return hit?.value ?? null;
  };
  const full = take(["full_name", "name", "vollständiger_name", "vollstaendiger_name"]);
  const first = take(["first_name", "vorname"]);
  const last = take(["last_name", "nachname"]);
  const name = full ?? ([first, last].filter(Boolean).join(" ") || null);
  const phone = normalizePhone(take(["whatsapp_number", "phone_number", "phone", "telefonnummer", "telefon", "handynummer"]) ?? "");
  const email = take(["email", "e-mail", "e_mail", "emailadresse"])?.toLowerCase() ?? null;
  const answers = Object.entries(inc.fields)
    .filter(([k, v]) => !used.has(k) && v)
    .map(([k, v]) => ({ label: labels[k] ?? prettify(k), value: v.replace(/_/g, " ") }));
  return { name, phone, email, answers };
}

/** reentry: dieselbe Person beim selben Kunden erneut eingetragen, kein neuer Lead (lib/lead-erneut.ts).
 *  vertrieb: Formular gehört dem Vertrieb (VertriebLeadForm), Lead ging als Vermittler-Lead in den Vertrieb. */
export type IngestResult = { status: "created" | "duplicate" | "unassigned" | "reentry" | "vertrieb"; leadId?: string; contactId?: string };

/** Lead eines Vertriebsformulars im Format, das lib/vertrieb/inbound.ts (parseLead) auch vom Zap bekommt. */
export function vertriebPayload(inc: IncomingLead, formName: string | null): Record<string, unknown> {
  const ad = inc.ad ?? null;
  return {
    leadgen_id: inc.externalId,
    form_id: inc.formId,
    page_id: inc.pageId,
    created_time: inc.createdAt,
    form_name: formName,
    campaign_name: ad?.adCampaignName ?? inc.campaignName,
    adset_name: ad?.adSetName ?? null,
    ad_name: ad?.adName ?? inc.adName,
    platform: ad?.adPlatform ?? null,
    field_data: Object.entries(inc.fields).map(([name, v]) => ({ name, values: [v] })),
  };
}

/** Formular gehört dem Vertrieb (Oles eigene Vermittler-Leads): direkt in den Vertrieb, mit Push an Ole. */
async function ingestVertrieb(inc: IncomingLead, form: { id: string; formName: string | null }): Promise<IngestResult> {
  const r = await handleInboundLead(vertriebPayload(inc, form.formName), "META_ADS", { externalId: inc.externalId, notify: true });
  await prisma.vertriebLeadForm.update({ where: { id: form.id }, data: { lastLeadAt: new Date() } }).catch(() => {});
  if ("ignored" in r) {
    reportError(new Error(`Vertriebs-Lead ohne Kontaktdaten: ${r.ignored}`), "lead-intake-vertrieb", { form: inc.formId, lead: inc.externalId });
    return { status: "vertrieb" };
  }
  return { status: r.duplicate ? "duplicate" : "vertrieb", contactId: r.contactId || undefined };
}

export async function ingestLead(
  inc: IncomingLead,
  via: "meta" | "zapier",
  override?: { customerId?: string | null; productKey?: string | null },
): Promise<IngestResult> {
  if (inc.externalId) {
    const dup = await prisma.lead.findUnique({ where: { externalId: inc.externalId }, select: { id: true } });
    if (dup) return { status: "duplicate", leadId: dup.id };
    // Schon als erneute Eintragung verarbeitet (lib/lead-erneut.ts); Fehler hier → normaler Weg
    const again = await prisma.leadReentry.findUnique({ where: { externalId: inc.externalId }, select: { leadId: true } }).catch((err) => {
      reportError(err, "lead-erneut-dublette", { externalId: inc.externalId });
      return null;
    });
    if (again) return { status: "duplicate", leadId: again.leadId };
  }
  // Formular des Vertriebs (Lead-Eingang → „Vertrieb (eigene Vermittler-Leads)“): kein Kunden-Lead
  const vertrieb = inc.formId ? await prisma.vertriebLeadForm.findFirst({ where: { formId: inc.formId, active: true }, select: { id: true, formName: true } }) : null;
  if (vertrieb) return ingestVertrieb(inc, vertrieb);
  const source = inc.formId ? await prisma.leadSource.findFirst({ where: { formId: inc.formId, active: true } }) : null;
  const customerId = source?.customerId ?? override?.customerId ?? null;
  const productKey = source?.productKey ?? override?.productKey ?? null;
  // Ruhendes Konto (Vertrag beendet, lib/ruhend.ts): nichts mehr verarbeiten, Lead landet im Lead-Eingang
  const dormant = customerId ? !!(await prisma.customer.findUnique({ where: { id: customerId }, select: { dormantSince: true } }))?.dormantSince : false;

  if (!customerId || !productKey || dormant) {
    const payload = inc as unknown as Prisma.InputJsonValue;
    if (inc.externalId) {
      await prisma.unassignedLead.upsert({ where: { externalId: inc.externalId }, create: { externalId: inc.externalId, formId: inc.formId, pageId: inc.pageId, via, payload }, update: {} });
    } else {
      await prisma.unassignedLead.create({ data: { formId: inc.formId, pageId: inc.pageId, via, payload } });
    }
    await sendToAdmins({
      title: "📥 Lead ohne Zuordnung",
      body: `Formular ${inc.formId ?? "unbekannt"}${inc.campaignName ? ` · ${inc.campaignName}` : ""}${dormant ? " · Kunde ruht (Vertrag beendet)" : ""}. Bitte unter Lead-Eingang zuordnen.`,
      url: "/admin/neu/leads",
      tag: `unassigned:${inc.formId ?? "x"}`,
    }).catch(() => {});
    return { status: "unassigned" };
  }

  // Anzeige der Einsendung; ältere Payloads (Lead-Eingang) kennen nur Kampagnen- und Anzeigennamen
  const ad = mergeAd(inc.ad, { adFormId: inc.formId, adCampaignName: inc.campaignName, adName: inc.adName });
  const labels = (source?.questionLabels ?? {}) as Record<string, string>;
  const { name, phone, email, answers } = extract(inc, labels);
  const createdAt = new Date(inc.createdAt);
  // Einwilligung (lib/einwilligung-leadformular.ts): Nachweis mit Zeitpunkt, Formular, Textversion und Wortlaut.
  // Formular ohne Häkchen → waConsent null (bisheriges Verhalten), Hinweis da und Häkchen fehlt → "nein".
  const responses = inc.disclaimer ?? null;
  // Einwilligung per Knopf (Formular ohne Häkchen, CONSENT_VERSION_KNOPF an der Zuordnung): Absenden = eingewilligt.
  // Zuordnung ohne Fassung (Formular von Hand angelegt, Ole 26.11.2026): einmal bei Meta nachsehen und nachtragen.
  if (source && !responses && !source.consentVersion && inc.formId) {
    if (await (await import("@/lib/einwilligung-knopf-server")).knopfEinwilligungNachtragen(inc.formId)) {
      const neu = await prisma.leadSource.findUnique({ where: { id: source.id }, select: { consentVersion: true, consentText: true } });
      if (neu) Object.assign(source, neu);
    }
  }
  const knopf = !responses && istKnopfFassung(source?.consentVersion);
  const waConsent = knopf ? "ja" : consentStateOf(responses);
  const nachweis: ConsentNachweis = {
    at: (createdAt.getTime() > Date.now() ? new Date() : createdAt).toISOString(),
    formId: inc.formId,
    textVersion: responses || knopf ? (source?.consentVersion ?? null) : null,
    text: responses || knopf ? (source?.consentText ?? null) : null,
    responses: responses ?? [],
  };
  // Dieselbe Person hat sich bei diesem Kunden schon eingetragen (gleiche Nummer oder E-Mail): kein zweiter Lead,
  // der bestehende rückt nach oben (lib/lead-erneut.ts). Jeder Fehler dort → wie bisher neuer Lead.
  const reentry = await tryReentry({
    customerId,
    productKey,
    externalId: inc.externalId,
    formId: inc.formId,
    name,
    phone,
    email,
    answers,
    waConsent,
    consentData: nachweis,
    ad,
  }).catch((err) => {
    reportError(err, "lead-erneut", { customer: customerId });
    return null;
  });
  // Gleiche Nummer bzw. E-Mail, anderer Nachname (lib/lead-name.ts): eigener Lead, danach bekommt er den WhatsApp-Chat
  const anderePerson = reentry?.status === "andere_person" ? reentry : null;
  if (reentry && reentry.status !== "andere_person") {
    if (reentry.status === "reentry" && source) {
      await prisma.leadSource
        .update({ where: { id: source.id }, data: { lastLeadAt: new Date(), lastConsentState: waConsent ?? "ohne" } })
        .catch((err) => reportError(err, "lead-erneut-quelle", { lead: reentry.leadId }));
    }
    return reentry;
  }

  let lead;
  try {
    lead = await prisma.lead.create({
      data: {
        externalId: inc.externalId,
        source: productKey,
        customerId,
        name,
        phone,
        email,
        formData: answers.length ? answers : Prisma.DbNull,
        waConsent,
        consentData: nachweis as unknown as Prisma.InputJsonValue,
        createdAt: createdAt.getTime() > Date.now() ? new Date() : createdAt,
        adChannel: "Meta",
        status: "Neuer Lead",
        bezugAirtableId: source?.bezugAirtableId ?? null,
        ...adData(ad),
      },
      select: { id: true },
    });
  } catch (err) {
    // Gleichzeitiger Doppel-Eingang (Meta + Zapier) → Unique-Konflikt = Dublette.
    if (err instanceof Error && /Unique constraint|P2002/.test(err.message) && inc.externalId) {
      const dup = await prisma.lead.findUnique({ where: { externalId: inc.externalId }, select: { id: true } });
      if (dup) return { status: "duplicate", leadId: dup.id };
    }
    throw err;
  }

  if (source?.leadPrice && Number(source.leadPrice) > 0) {
    await prisma.revenue.create({
      data: { amount: source.leadPrice, occurredAt: createdAt, customerId, leadId: lead.id, cancelled: false },
    });
  }
  if (source) await prisma.leadSource.update({ where: { id: source.id }, data: { lastLeadAt: new Date(), lastConsentState: waConsent ?? "ohne" } });

  if (anderePerson) {
    const { chatAnNeueAnfrage } = await import("@/lib/lead-name-server");
    await chatAnNeueAnfrage({ customerId, leadId: lead.id, altLeadId: anderePerson.altLeadId, name, altName: anderePerson.altName, phone, productKey }).catch((err) =>
      reportError(err, "lead-intake-andere-person", { lead: lead.id }),
    );
  }

  await processNewLead(lead.id).catch((err) => reportError(err, "lead-intake-process", { lead: lead.id }));
  return { status: "created", leadId: lead.id };
}

/** Alles, was ein neuer Lead sofort auslösen soll. */
export async function processNewLead(leadId: string) {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      name: true,
      source: true,
      customerId: true,
      isTest: true,
      phone: true,
      status: true,
      customer: { select: { plan: true } },
      // Empfehlung (Modul Empfehlungen & Bewertungen): Vorname des Empfehlenden für Push und Gesprächseinstieg
      referralLink: { select: { kind: true, lead: { select: { name: true } }, existingCustomer: { select: { firstName: true } } } },
    },
  });
  if (!lead) return;
  // Testlead (lib/testlead.ts): jede Station als Logzeile „[testlead <id>] …“
  logTestLead(lead, "process", { customer: lead.customerId });
  // Eindeutig falsche Nummer (Ole, 21.11.2026: „23456789“): selbst auf „Verloren: falsche Daten“, ohne Push, ohne
  // WhatsApp und ohne Mail-Strecke. Nur sichere Fälle (lib/ppl/telefon-pruefung.ts offensichtlichFalscheNummer).
  if (!lead.isTest && (!lead.status || lead.status === "Neuer Lead")) {
    const falsch = (await import("@/lib/ppl/telefon-pruefung")).offensichtlichFalscheNummer(lead.phone);
    if (falsch) {
      await alsFalscheDatenVerloren(lead.id, lead.customerId, falsch).catch((err) => reportError(err, "lead-intake-falsche-nummer", { lead: lead.id }));
      return;
    }
  }
  // Team (Großkunden): gleichmäßig zuteilen, Push nur an den Zuständigen.
  await assignLead(lead.id).catch((err) => reportError(err, "lead-intake-assign"));
  // Zweifelhafte Nummer (Ole, 22.11.2026): Aufgabe „Nummer prüfen“ auf Heute und am Kontakt, Lead bleibt offen
  if (!lead.isTest) {
    const zweifel = (await import("@/lib/ppl/telefon-pruefung")).nummerZweifelhaft(lead.phone);
    if (zweifel) {
      await (await import("@/lib/lead-aufgaben"))
        .planeAufgabe({ leadId: lead.id, customerId: lead.customerId, kind: "nummer_pruefen", note: `Nummer prüfen: ${zweifel}. Bitte anrufen oder die richtige Handynummer eintragen`, dueAt: new Date() })
        .catch((err) => reportError(err, "lead-intake-nummer-pruefen", { lead: lead.id }));
    }
  }
  await attachLeadToContact(lead.id).catch((err) => reportError(err, "lead-intake-attach"));
  // Empfohlene Person hat sich eingetragen: eigener Push „Empfehlung von {Vorname}: jetzt anrufen“ mit Gesprächseinstieg
  // (lib/empfehlung/shared.ts empfehlungPush, ohne Nummern). Geht wie jeder Push nur an Geräte mit erlaubten Mitteilungen.
  // Push je Login nach „nur meine / alle im Team“ (lib/lead-benachrichtigung.ts, Ole 26.11.2026)
  await (await import("@/lib/lead-benachrichtigung")).neuerLeadPush(
    lead.id,
    lead.source === EMPFEHLUNG_SOURCE && lead.referralLink
      ? empfehlungPush(lead.id, lead.referralLink.kind === "general" ? null : (lead.referralLink.lead?.name ?? lead.referralLink.existingCustomer?.firstName ?? null))
      : {
          title: `🆕 Neuer Lead: ${lead.name ?? "ohne Name"}`,
          body: lead.source ?? "",
          tag: `lead-buyer:${lead.id}`,
          url: "/buyer",
        },
  );
  // Admin liest mit (erste Kunden, lib/admin-mitlesen.ts)
  await (await import("@/lib/admin-mitlesen")).adminMitlesen({ leadId: lead.id, ereignis: "lead" });
  logTestLead(lead, "notify push");
  {
    await emailLeads(new Date(), lead.customerId).catch((err) => reportError(err, "lead-intake-email"));
    // Teams: E-Mail je Login nach „nur meine / alle im Team“ (ohne Doppel zu emailLeads und Pay-per-Lead-PDF)
    await (await import("@/lib/lead-benachrichtigung")).neuerLeadMail(lead.id).catch((err) => reportError(err, "lead-intake-team-mail", { lead: lead.id }));
  }
  logTestLead(lead, "notify mail checked");
  // WhatsApp-Erstanschreiben: sofort, wenn keine Wartezeit eingestellt ist
  // (sonst übernimmt der Cron nach Ablauf der Wartezeit).
  const agent = await prisma.agentConfig.findUnique({ where: { customerId: lead.customerId }, select: { outreachEnabled: true, outreachDelayMin: true, active: true } });
  if (agent?.active && agent.outreachEnabled && agent.outreachDelayMin === 0) {
    await runOutreach(lead.customerId).catch((err) => reportError(err, "lead-intake-outreach"));
  } else {
    logTestLead(lead, "outreach not immediate", { agentActive: !!agent?.active, outreachEnabled: !!agent?.outreachEnabled, delayMin: agent?.outreachDelayMin ?? null });
  }
}

/** Neuer Lead mit eindeutig falscher Nummer: Verloren mit Grund „falsche_daten“ (wie markLeadLostResult, ohne Warnung). */
export async function alsFalscheDatenVerloren(leadId: string, customerId: string, grund: string): Promise<void> {
  const { lostReason } = await import("@/lib/lead-lost");
  const reason = lostReason("falsche_daten")!;
  const note = `Automatisch: ${grund}`;
  await prisma.lead.update({
    where: { id: leadId },
    data: { status: reason.status, reached: false, closedAt: null, lostReason: reason.key, lostNote: note, lostAt: new Date(), lostEarly: false, disqualifyReason: reason.key },
  });
  await import("@/lib/lead-followup").then((m) => m.syncFollowUpWithStatus(leadId, reason.status)).catch((e) => console.error("[status sync]", e));
  await (await import("@/lib/lead-history")).logLeadHistory(leadId, "status", `Verloren: ${reason.label} · ${note}`, { customerId });
}

/** Formular zuordnen und alle wartenden Leads dieses Formulars übernehmen. */
export async function assignPendingLeads(formId: string): Promise<number> {
  const pending = await prisma.unassignedLead.findMany({ where: { formId, resolvedAt: null }, orderBy: { createdAt: "asc" } });
  let n = 0;
  for (const p of pending) {
    const res = await ingestLead(p.payload as unknown as IncomingLead, p.via === "meta" ? "meta" : "zapier");
    if (res.status !== "unassigned") {
      await prisma.unassignedLead.update({ where: { id: p.id }, data: { resolvedAt: new Date() } });
      n++;
    }
  }
  return n;
}
