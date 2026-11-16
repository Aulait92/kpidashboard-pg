// Instantly-Antworten nachholen (Ole, 16.11.2026: Antwort von Christina Dröge fehlte im CRM).
// Liest alle empfangenen Mails der letzten 90 Tage aus Instantly (alle Postfächer, alle Kampagnen,
// nur lesend) und legt fehlende Antworten so an wie der normale Abgleich: Kontakt mit Namen aus
// Instantly, Antwort im Verlauf, Aufgabe bei positiver Antwort, Später-Follow-up bei „später“
// (ohne Zeitpunkt nach 3 Monaten; ältere als 14 Tage warten auf Freigabe, lib/vertrieb/followup.ts).
// Idempotent: Antworten werden über die Instantly-ID (bzw. Betreff + Zeitpunkt) erkannt.
// Sperrliste (lib/vertrieb/sperrliste.ts): gesperrte Adressen und Domains werden weder angelegt noch eingeplant.
import { prisma } from "@/lib/prisma";
import { contactIdsByEmails } from "@/lib/vertrieb/contact-merge";
import { classifyReply, isAutoReplyText } from "@/lib/vertrieb/sentiment";
import { emailGesperrt } from "@/lib/vertrieb/sperrliste";
import {
  IGNORE_CAMPAIGN,
  ensureInstantlyContact,
  leadDetails,
  listCampaigns,
  listEmails,
  recordReply,
  stripQuoted,
  upsertCampaign,
  type ApiEmail,
} from "@/lib/vertrieb/instantly";

export type NachholenEintrag = {
  at: string;
  lead: string;
  postfach: string | null;
  kampagne: string | null;
  betreff: string | null;
  kontakt: "neu" | "vorhanden";
  spaeter: boolean;
};

export type NachholenErgebnis = {
  tage: number;
  angewendet: boolean;
  /** empfangene Mails aus Instantly im Zeitraum */
  gelesen: number;
  schonImCrm: number;
  /** fehlen im CRM (Vorschau) bzw. wurden geprüft und nachgeholt (Anwenden) */
  fehlend: number;
  neueKontakte: number;
  spaeter: number;
  gesperrt: number;
  /** Kampagne ausgeblendet (Pflege, Badumbau, Kinderwunsch) */
  ignoriert: number;
  /** Abwesenheitsnotizen, Eingangsbestätigungen */
  automatisch: number;
  /** unbekannter Absender ohne Kampagne (kein Cold-Mail-Kontakt) */
  ohneKampagne: number;
  nachgeholt: number;
  /** fehlende Antworten je Postfach */
  postfaecher: Record<string, number>;
  /** fehlende Antworten (neueste zuerst, höchstens 200) */
  liste: NachholenEintrag[];
};

const LIST_MAX = 200;

/** Antwort schon gespeichert (Webhook ohne Instantly-ID: gleicher Betreff ±15 Min., wie recordReply)? */
async function replyKnown(contactId: string, subject: string | null, sentAt: Date): Promise<boolean> {
  const hit = await prisma.salesEmail.findFirst({
    where: {
      contactId,
      direction: "IN",
      subject,
      sentAt: { gte: new Date(sentAt.getTime() - 15 * 60000), lte: new Date(sentAt.getTime() + 15 * 60000) },
    },
    select: { id: true },
  });
  return !!hit;
}

async function contactBlocked(contactId: string): Promise<boolean> {
  const c = await prisma.salesContact.findUnique({ where: { id: contactId }, select: { email: true, altEmails: true } });
  return !!c && [c.email, ...c.altEmails].some(emailGesperrt);
}

/**
 * Vorschau (anwenden = false: nichts wird geschrieben) bzw. Nachholen fehlender Antworten.
 * Instantly wird nur gelesen.
 */
export async function nachholenAntworten(opts: { tage?: number; anwenden?: boolean; now?: Date } = {}): Promise<NachholenErgebnis> {
  const tage = opts.tage ?? 90;
  const anwenden = !!opts.anwenden;
  const now = opts.now ?? new Date();
  const since = new Date(now.getTime() - tage * 86_400_000);
  const r: NachholenErgebnis = {
    tage,
    angewendet: anwenden,
    gelesen: 0,
    schonImCrm: 0,
    fehlend: 0,
    neueKontakte: 0,
    spaeter: 0,
    gesperrt: 0,
    ignoriert: 0,
    automatisch: 0,
    ohneKampagne: 0,
    nachgeholt: 0,
    postfaecher: {},
    liste: [],
  };

  // Kampagnen: Namen aus Instantly, „ignoriert“ aus dem CRM (umschaltbar) bzw. nach Thema
  const apiCampaigns = await listCampaigns();
  const stored = await prisma.salesCampaign.findMany({ where: { instantlyId: { not: null } }, select: { instantlyId: true, name: true, ignored: true } });
  const names = new Map<string, string>(stored.map((c) => [c.instantlyId!, c.name]));
  for (const c of apiCampaigns) names.set(c.id, c.name);
  const ignored = new Set(stored.filter((c) => c.ignored).map((c) => c.instantlyId!));
  for (const c of apiCampaigns) if (!stored.some((s) => s.instantlyId === c.id) && IGNORE_CAMPAIGN.test(c.name)) ignored.add(c.id);

  const newLeads = new Set<string>();
  let cursor: string | undefined;
  do {
    const q = new URLSearchParams({ email_type: "received", limit: "100", sort_order: "asc", min_timestamp_created: since.toISOString() });
    if (cursor) q.set("starting_after", cursor);
    const page = await listEmails(q);
    cursor = page.items.length ? page.next_starting_after : undefined;
    const leadOf = (e: ApiEmail) => (e.lead ?? e.from_address_email ?? "").trim().toLowerCase();
    const ids = await contactIdsByEmails(page.items.map(leadOf).filter(Boolean));
    for (const e of page.items) {
      if (e.ue_type != null && e.ue_type !== 2) continue;
      r.gelesen++;
      if (await prisma.salesEmail.findUnique({ where: { instantlyId: e.id }, select: { id: true } })) {
        r.schonImCrm++;
        continue;
      }
      const leadEmail = leadOf(e);
      if (!leadEmail) {
        r.ohneKampagne++;
        continue;
      }
      if (e.campaign_id && ignored.has(e.campaign_id)) {
        r.ignoriert++;
        continue;
      }
      let contactId = ids.get(leadEmail);
      if (emailGesperrt(leadEmail) || (contactId && (await contactBlocked(contactId)))) {
        r.gesperrt++;
        continue;
      }
      const sentAt = new Date(e.timestamp_email || e.timestamp_created);
      const subject = e.subject ?? null;
      const text = e.body?.text ?? e.content_preview ?? null;
      const campaign = e.campaign_id ? names.get(e.campaign_id) ?? null : null;
      const reply = {
        instantlyId: e.id,
        subject,
        text,
        html: e.body?.html ?? null,
        fromEmail: e.from_address_email,
        threadId: e.thread_id,
        eaccount: e.eaccount ?? null,
        isAutoReply: e.is_auto_reply === 1,
        sentAt,
        campaign,
        interest: e.i_status ?? null,
      };
      if (contactId && (await replyKnown(contactId, subject, sentAt))) {
        r.schonImCrm++;
        // Webhook-Antwort ohne Instantly-ID: ID nachtragen (recordReply erkennt die Doppelte, legt nichts an)
        if (anwenden) await recordReply(contactId, reply);
        continue;
      }
      // Abwesenheitsnotizen und Eingangsbestätigungen holen wir nicht nach
      if (reply.isAutoReply || isAutoReplyText(subject, stripQuoted(text ?? ""))) {
        r.automatisch++;
        continue;
      }
      // Unbekannter Absender ohne Kampagne: keine Cold-Mail-Antwort (Newsletter, Spam …)
      if (!contactId && !e.campaign_id) {
        r.ohneKampagne++;
        continue;
      }
      const spaeter = classifyReply(stripQuoted(text ?? ""), subject?.replace(/^(re|aw|antw|fwd?|wg):\s*/i, ""), sentAt) === "SPAETER";
      r.fehlend++;
      if (spaeter) r.spaeter++;
      if (!contactId && !newLeads.has(leadEmail)) {
        newLeads.add(leadEmail);
        r.neueKontakte++;
      }
      const box = e.eaccount ?? "?";
      r.postfaecher[box] = (r.postfaecher[box] ?? 0) + 1;
      r.liste.push({ at: sentAt.toISOString(), lead: leadEmail, postfach: e.eaccount ?? null, kampagne: campaign, betreff: subject, kontakt: newLeads.has(leadEmail) ? "neu" : "vorhanden", spaeter });
      if (!anwenden) continue;

      if (!contactId) {
        contactId = (await ensureInstantlyContact(leadEmail, await leadDetails(leadEmail), campaign ?? "Instantly")).id;
        ids.set(leadEmail, contactId);
      }
      if (e.campaign_id) {
        const c = await upsertCampaign(campaign, e.campaign_id);
        const key = { contactId_campaignId: { contactId, campaignId: c.id } };
        const prev = await prisma.salesCampaignLead.findUnique({ where: key, select: { replyCount: true } });
        if (!prev) await prisma.salesCampaignLead.create({ data: { contactId, campaignId: c.id, replyCount: 1, lastReplyAt: sentAt } });
        else if (!prev.replyCount) await prisma.salesCampaignLead.update({ where: key, data: { replyCount: 1, lastReplyAt: sentAt } });
      }
      if (await recordReply(contactId, reply)) r.nachgeholt++;
    }
  } while (cursor);

  r.liste = r.liste.sort((a, b) => b.at.localeCompare(a.at)).slice(0, LIST_MAX);
  return r;
}
