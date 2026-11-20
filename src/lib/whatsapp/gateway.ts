// WhatsApp-Gateway: persistiert eingehende Nachrichten/Status (vom Webhook)
// und sendet ausgehende Nachrichten über 360dialog. Multi-Tenant: das Routing
// läuft über die phone_number_id → WhatsAppAccount → Kunde. Strikt pro Kunde
// isoliert; nichts verlässt den Kunden-Scope.

import { ohneGedankenstriche } from "@/lib/gedankenstriche";
import { isSupportCustomer } from "@/lib/whatsapp/support-inbox";
import { decryptSecret } from "@/lib/encryption";
import { prisma } from "@/lib/prisma";
import { ohneAutoNachrichten } from "@/lib/lead-kontakt-sperre";
import { sendButtons, sendFlow, sendTemplate, sendText, type SendResult } from "@/lib/whatsapp/dialog360";
import { linkLeadToConversation } from "@/lib/whatsapp/lead-link";
import type { StatusError } from "@/lib/whatsapp/zustellfehler";
import { waOhneMarker } from "@/lib/wa-format";

const WINDOW_MS = 24 * 60 * 60 * 1000; // 24-Stunden-Service-Fenster

// Lockere Typen für das Meta-/360dialog-Webhook-Format (nur was wir lesen).
type InboundMessage = {
  from?: string;
  id?: string;
  type?: string;
  text?: { body?: string };
  // Antwort per Schnellantwort-Knopf einer Vorlage (z. B. „Keine Nachrichten mehr“)
  button?: { text?: string; payload?: string };
  // Antwort auf interaktive Knöpfe/Listen (freie Nachrichten im 24-h-Fenster)
  // nfm_reply: Antwort aus einem WhatsApp Flow (Policen-Strecke v2, response_json als JSON-Text)
  interactive?: {
    type?: string;
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string };
    nfm_reply?: { response_json?: string | Record<string, unknown>; body?: string; name?: string };
  };
  // Antwort auf eine unserer Nachrichten (z. B. Knopf der Policen-Einwilligung): ID der beantworteten Nachricht
  context?: { id?: string };
  // Fotos und PDFs (z. B. Policen vor dem Termin, lib/policen)
  image?: { id?: string; mime_type?: string; caption?: string };
  document?: { id?: string; mime_type?: string; filename?: string; caption?: string };
};

/** Lesbarer Text einer eingehenden Nachricht (Knopf-Antworten als Knopftext). */
export function inboundBody(m: InboundMessage): string | null {
  const type = m.type ?? "text";
  if (type === "text") return m.text?.body ?? null;
  if (type === "button") return m.button?.text ?? m.button?.payload ?? "[button]";
  // Formular-Antwort ohne Inhalte (Dateinamen bleiben draußen, A7)
  if (type === "interactive" && m.interactive?.nfm_reply) return "Formular „Policen senden“ abgeschickt";
  if (type === "interactive") return m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? "[interactive]";
  // Ohne Dateinamen: ob er gezeigt werden darf (Gesundheitsangaben), entscheidet lib/policen/server.ts danach
  if (type === "image" || type === "document") return "Dokument empfangen";
  return `[${type}]`;
}

/** Payload eines Knopfs (Vorlage: button.payload, interaktiv: button_reply.id), z. B. „slot:2026-11-17T09:00:00.000Z“. */
export function inboundPayload(m: InboundMessage): string | null {
  if (m.type === "button") return m.button?.payload ?? null;
  if (m.type === "interactive") return m.interactive?.button_reply?.id ?? m.interactive?.list_reply?.id ?? null;
  return null;
}
type StatusUpdate = {
  id?: string;
  status?: string;
  // Meta-Preisangabe (Abrechnung je Nachricht)
  pricing?: { billable?: boolean; category?: string; pricing_model?: string };
  // Bei status "failed": Fehler (z. B. 131026 „Message undeliverable“), lib/whatsapp/zustellfehler.ts
  errors?: StatusError[];
};
// Coexistence: Nachrichten, die der Kunde selbst in seiner WhatsApp-Business-
// App (Handy) an einen Kontakt schickt, kommen als „Echo" (Webhook-Feld
// smb_message_echoes) — from = Geschäftsnummer, to = Kontakt.
type MessageEcho = {
  from?: string;
  to?: string;
  id?: string;
  type?: string;
  text?: { body?: string };
};
// Coexistence-Abgleich beim Verbinden der Business-App (Webhook-Felder „history“ und „smb_app_state_sync“):
// alter Verlauf bzw. Adressbuch. Wir merken uns davon nur die Nummern (lib/whatsapp/nur-leads.ts), sonst nichts.
type HistoryChunk = { threads?: Array<{ id?: string; messages?: unknown[] }> };
type StateSync = { type?: string; action?: string; contact?: { phone_number?: string } };
type ChangeValue = {
  metadata?: { phone_number_id?: string };
  history?: HistoryChunk[];
  state_sync?: StateSync[];
  contacts?: Array<{ profile?: { name?: string } }>;
  messages?: InboundMessage[];
  statuses?: StatusUpdate[];
  message_echoes?: MessageEcho[];
};
type WebhookPayload = {
  entry?: Array<{ changes?: Array<{ field?: string; value?: ChangeValue }> }>;
};

/** Webhook-Felder des Coexistence-Abgleichs: nie als Nachricht verarbeiten (kein Chat, kein Lead, kein Assistent). */
const SYNC_FIELDS = new Set(["history", "smb_app_state_sync"]);

export type InboundResult = { processed: number; errors: string[] };

/** Verarbeitet einen kompletten Webhook-Payload (Nachrichten + Status). */
export async function handleInboundPayload(
  payload: unknown,
  opts: { accountId?: string | null } = {},
): Promise<InboundResult> {
  const errors: string[] = [];
  let processed = 0;

  const entries = (payload as WebhookPayload)?.entry;
  if (!Array.isArray(entries)) return { processed, errors };

  for (const entry of entries) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value;
      if (!value) continue;
      const field = change?.field ?? "";

      const phoneNumberId = value.metadata?.phone_number_id;
      let account = phoneNumberId
        ? await prisma.whatsAppAccount.findFirst({ where: { phoneNumberId } })
        : null;
      if (!account && opts.accountId) {
        // Webhook-URL trägt die Konto-ID (beim Verbinden gesetzt). Beim ersten
        // Event wird die phone_number_id gelernt; danach ist sie maßgeblich.
        const hinted = await prisma.whatsAppAccount.findUnique({
          where: { id: opts.accountId },
        });
        if (hinted && (!hinted.phoneNumberId || hinted.phoneNumberId === phoneNumberId)) {
          account = hinted;
          if (phoneNumberId && !hinted.phoneNumberId) {
            await prisma.whatsAppAccount.update({
              where: { id: hinted.id },
              data: { phoneNumberId },
            });
          }
        }
      }
      if (!account) {
        // Sandbox-/Single-Tenant-Komfort: Gibt es genau EIN Konto, wird es
        // genutzt (und die phone_number_id nachgetragen). In Produktion mit
        // mehreren Konten greift das nicht — dort ist die phone_number_id
        // maßgeblich.
        const accounts = await prisma.whatsAppAccount.findMany({ take: 2 });
        if (accounts.length === 1) {
          account = accounts[0];
          if (phoneNumberId && !account.phoneNumberId) {
            await prisma.whatsAppAccount.update({
              where: { id: account.id },
              data: { phoneNumberId },
            });
          }
        }
      }

      // Coexistence-Abgleich (alter Verlauf, Adressbuch der Business-App): Inhalte werden NICHT gespeichert, es entsteht
      // kein Chat, kein Lead und keine Nachricht. Nur die Nummern merken, damit der Assistent sie nie anschreibt.
      if (SYNC_FIELDS.has(field) || value.history || value.state_sync) {
        if (account) {
          try {
            const { merkeAppKontakte } = await import("@/lib/whatsapp/nur-leads");
            const fromHistory = (value.history ?? []).flatMap((h) => (h?.threads ?? []).map((t) => t?.id ?? ""));
            const fromContacts = (value.state_sync ?? [])
              .filter((x) => x?.type === "contact" && x.action !== "remove")
              .map((x) => x.contact?.phone_number ?? "");
            await merkeAppKontakte(account.customerId, fromHistory, "history");
            await merkeAppKontakte(account.customerId, fromContacts, "contact");
          } catch (e) {
            errors.push(e instanceof Error ? e.message : String(e));
          }
        }
        continue;
      }

      // Eingehende Nachrichten
      const contactName = value.contacts?.[0]?.profile?.name ?? null;
      for (const m of value.messages ?? []) {
        try {
          if (!account) {
            errors.push(
              `Kein WhatsAppAccount für phone_number_id ${phoneNumberId ?? "?"}`,
            );
            continue;
          }
          await persistInbound(account.customerId, account.id, m, contactName);
          processed++;
        } catch (e) {
          errors.push(e instanceof Error ? e.message : String(e));
        }
      }

      // Coexistence-Echos: vom Kunden selbst in der Business-App gesendet.
      for (const echo of value.message_echoes ?? []) {
        try {
          if (!account) continue;
          await persistEcho(account.customerId, account.id, echo);
          processed++;
        } catch (e) {
          errors.push(e instanceof Error ? e.message : String(e));
        }
      }

      // Zustellstatus zu ausgehenden Nachrichten
      for (const s of value.statuses ?? []) {
        try {
          await applyStatus(s);
        } catch (e) {
          errors.push(e instanceof Error ? e.message : String(e));
        }
      }
    }
  }

  return { processed, errors };
}

async function persistInbound(
  customerId: string,
  whatsAppAccountId: string,
  m: InboundMessage,
  contactName: string | null,
): Promise<void> {
  const from = m.from;
  if (!from) return;

  // Idempotenz: Webhooks werden bei Timeout erneut zugestellt.
  if (m.id) {
    const existing = await prisma.message.findUnique({
      where: { waMessageId: m.id },
      select: { id: true },
    });
    if (existing) return;
  }

  const now = new Date();
  const windowExpiresAt = new Date(now.getTime() + WINDOW_MS);
  // Support-Postfach von performancegrowth: ohne Assistent und ohne Lead-Logik (lib/whatsapp/support-inbox.ts)
  const support = isSupportCustomer(customerId);

  // Allowlist (lib/whatsapp/nur-leads.ts): Ein neuer Chat startet mit Assistent AUS. Eingeschaltet wird er erst,
  // wenn ein Lead zugeordnet ist (unten bzw. später beim Lead-Import) oder der Schalter für neue Kontakte greift.
  const isNew = !(await prisma.conversation.count({ where: { customerId, contactPhone: from } }));
  const conversation = await prisma.conversation.upsert({
    where: { customerId_contactPhone: { customerId, contactPhone: from } },
    create: {
      customerId,
      whatsAppAccountId,
      contactPhone: from,
      contactName,
      botActive: false,
      status: "open",
      lastMessageAt: now,
      windowExpiresAt,
    },
    update: {
      status: "open",
      lastMessageAt: now,
      windowExpiresAt,
      ...(contactName ? { contactName } : {}),
    },
  });

  // Mit dem Lead aus Airtable verknüpfen (Formularangaben für den Bot).
  if (!conversation.leadId && !support) {
    await linkLeadToConversation(conversation.id).catch((e) =>
      console.error("[whatsapp lead-link]", e),
    );
  }

  const type = m.type ?? "text";
  const body = inboundBody(m);

  const inboundMsg = await prisma.message.create({
    select: { id: true },
    data: {
      conversationId: conversation.id,
      direction: "inbound",
      kind: type,
      body,
      waMessageId: m.id ?? null,
    },
  });

  // Support-Postfach: Push an die Admins, Chat unter Admin → WhatsApp, sonst nichts
  if (support) {
    // Kunde oder Interessent? (lib/whatsapp/support-contacts.ts)
    if (!conversation.contactLinkManual && !conversation.salesContactId && !conversation.linkedCustomerId) {
      await import("@/lib/whatsapp/support-contacts")
        .then((sc) => sc.linkSupportConversation(conversation.id, now))
        .catch((e) => console.error("[whatsapp support link]", e));
    }
    // „STOPP“ an die Support-Nummer (Ole, 17.11.2026): Sperre am Chat, danach keine Terminerinnerungen und
    // Zahlungserinnerungen mehr (sie prüfen optedOutAt), einmal eine kurze Bestätigung, keine KI. Schreibt der
    // Kontakt danach wieder, bleibt die Sperre (anders als bei Leads); aufheben nur bewusst durch das Team.
    const stopp = await import("@/lib/whatsapp/stopp");
    if (stopp.isStopMessage(body)) {
      await stopp
        .applyOptOut(conversation.id, { confirm: true, now, text: stopp.SUPPORT_STOP_CONFIRMATION })
        .catch((e) => console.error("[whatsapp support stopp]", e));
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { needsAttention: true, attentionReason: "Support: abgemeldet (STOPP)", attentionAt: now },
      });
      const { sendToAdmins } = await import("@/lib/push");
      await sendToAdmins({
        title: `🛟 Support-WhatsApp abgemeldet: ${contactName ?? "Kontakt"}`,
        body: "Hat STOPP geschrieben: keine Termin- und Zahlungserinnerungen mehr per WhatsApp.",
        url: `/admin/whatsapp?c=${conversation.id}`,
        tag: `support-wa:${conversation.id}`,
      }).catch((e) => console.error("[whatsapp support push]", e));
      return;
    }
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { needsAttention: true, attentionReason: (body ? `Support: ${waOhneMarker(body)}` : "Support-Nachricht").slice(0, 200), attentionAt: now },
    });
    const { sendToAdmins } = await import("@/lib/push");
    await sendToAdmins({
      title: `🛟 Support-WhatsApp: ${contactName ?? `+${from}`}`,
      body: (waOhneMarker(body) ?? "Neue Nachricht").slice(0, 140),
      url: `/admin/whatsapp?c=${conversation.id}`,
      tag: `support-wa:${conversation.id}`,
    }).catch((e) => console.error("[whatsapp support push]", e));
    return;
  }

  const nurLeads = await import("@/lib/whatsapp/nur-leads");
  // Empfehlungen: Anfrage über den WhatsApp-Knopf der Empfehlungsseite (Code im Text) → Lead „Empfehlung“.
  // Vor allem anderen, damit der Chat ab hier ein Lead-Chat ist.
  const stopp = await import("@/lib/whatsapp/stopp");
  const isStop = stopp.isStopMessage(body);
  if (!isStop && !conversation.leadId && body && body.includes("(Ref ")) {
    try {
      const { handleReferralInbound } = await import("@/lib/empfehlung/requests");
      await handleReferralInbound(conversation.id, from, body, contactName);
    } catch (e) {
      console.error("[whatsapp referral-inbound]", e);
    }
  }
  // Lead jetzt zugeordnet (Formular, Empfehlungscode)? Neuer Chat → Assistent an (die Antwort folgt unten).
  const fresh = await prisma.conversation.findUnique({ where: { id: conversation.id }, select: { leadId: true, botActive: true } });
  conversation.leadId = fresh?.leadId ?? null;
  conversation.botActive = !!fresh?.botActive;
  if (conversation.leadId && !conversation.botActive && !conversation.optedOutAt) {
    conversation.botActive = await nurLeads.nachLeadZuordnung(conversation.id);
  }
  // Lead antwortet im Chat: ein laufender Anrufplan („Anrufversuch X von 6“) endet (Show-up-Paket, lib/anruf-ausloeser.ts).
  // Nicht bei „STOPP“: das betrifft nur WhatsApp, angerufen werden darf weiter.
  if (conversation.leadId && !isStop) {
    await import("@/lib/anruf-ausloeser-server")
      .then((m) => m.anrufplanBeiAntwortStoppen(conversation.leadId!))
      .catch((e) => console.error("[anrufplan stoppen]", e));
  }
  const pipeline = await nurLeads.istPipelineChat(conversation);
  // Unbekannter Kontakt: Assistent nur mit dem Schalter „Assistent auch für neue Kontakte“ (nie für App-Kontakte)
  if (!pipeline && isNew && (await nurLeads.assistentDarfAntworten(conversation))) {
    await prisma.conversation.update({ where: { id: conversation.id }, data: { botActive: true } });
    conversation.botActive = true;
  }
  let botErlaubt = conversation.botActive && (pipeline || (await nurLeads.assistentDarfAntworten(conversation)));
  // Vermittler telefoniert gerade mit dem Lead (lib/telefonat.ts): Assistent schweigt, die Nachricht wartet auf den Vermittler
  if (botErlaubt && conversation.leadId && (await import("@/lib/telefonat-server").then((m) => m.anrufPausiert(conversation.leadId)))) botErlaubt = false;
  // Produkt ohne automatische Nachrichten (Ole, 20.11.2026: PKV-Tarifoptimierung): der Assistent antwortet nicht, der
  // Vermittler bekommt den Hinweis „braucht dich“ (unten, !botErlaubt)
  if (botErlaubt && conversation.leadId) {
    const quelle = await prisma.lead.findUnique({ where: { id: conversation.leadId }, select: { source: true } });
    if (ohneAutoNachrichten(quelle?.source)) botErlaubt = false;
  }

  // „STOPP“ beendet alle Nachrichten an diese Nummer (lib/whatsapp/stopp.ts). Schreibt der Kontakt nach einem
  // Stopp wieder selbst, ist die Sperre aufgehoben; der Assistent bleibt aus, der Vermittler antwortet.
  const receivedAt = now;
  const optOut = async () => {
    const confirmed = await prisma.message.count({
      where: { conversationId: conversation.id, direction: "outbound", createdAt: { gte: receivedAt }, body: { contains: "keine weiteren Nachrichten" } },
    });
    await stopp.applyOptOut(conversation.id, { confirm: confirmed === 0, now: receivedAt });
  };
  if (!isStop && conversation.optedOutAt) {
    await stopp.liftOptOut(conversation.id);
    conversation.botActive = false;
    botErlaubt = false;
  }

  // Betroffenenrechte (Ole, 18.11.2026, lib/dsgvo): Auskunft, Löschung, Widerspruch gegen Werbung … ohne KI erkennen,
  // vor dem Assistenten. Anfrage anlegen, Eingang im Namen des Vermittlers bestätigen, Widerspruch sofort umsetzen,
  // Vermittler benachrichtigen. Der Assistent antwortet darauf nicht. Nicht bei „STOPP“ (Abmeldung von WhatsApp) und
  // nicht beim Widerruf zu Policen-Unterlagen (erkenneDsgvo grenzt ab).
  if (!isStop && type === "text" && body && (conversation.leadId || pipeline)) {
    const { pruefeDsgvoEingang } = await import("@/lib/dsgvo/server");
    const d = await pruefeDsgvoEingang({ customerId, leadId: conversation.leadId, kanal: "whatsapp", text: body, quelleId: inboundMsg.id, conversationId: conversation.id, now });
    if (d.erkannt) return;
  }

  // Empfehlungen & Bewertungen: Antwort auf die Nachfrage nach dem Abschluss → KI wertet aus
  // (Kritik → Aufgabe „Kunde unzufrieden“), Assistent antwortet dann nicht.
  try {
    const { handleReviewReply } = await import("@/lib/empfehlung/requests");
    if ((await handleReviewReply(conversation.id, from, body)).handled) {
      if (isStop) await optOut();
      return;
    }
  } catch (e) {
    console.error("[whatsapp review-reply]", e);
  }

  // Bestandskunden-Kampagne: Antwort → Lead in der Pipeline; „Stopp“ → Sperre, Assistent schweigt.
  let campaignStop = false;
  try {
    const { handleCampaignReply } = await import("@/lib/bestand/campaigns");
    const r = await handleCampaignReply(conversation.id, from, body);
    campaignStop = r.stop;
    // „Kein Bedarf“ auf eine Kampagne: beantwortet, kein Assistent
    if (r.handled && !isStop) return;
  } catch (e) {
    console.error("[whatsapp campaign-reply]", e);
  }
  if (campaignStop || isStop) {
    // Unbekannter Kontakt (kein Lead, keine Kampagne): keine automatische Bestätigung, keine Sperre. Ein „Stopp“
    // in einem privaten Chat ist meist nicht an uns gerichtet; der Vermittler sieht die Nachricht als „Neuer Kontakt“.
    if (campaignStop || pipeline || botErlaubt) {
      await optOut().catch((e) => console.error("[whatsapp stopp]", e));
      return;
    }
  }

  // CRM: Lead hat geantwortet ⇒ „Im Gespräch" (nur aus Neu/Nicht erreicht).
  const linkedLead = await prisma.conversation.findUnique({
    where: { id: conversation.id },
    select: { leadId: true },
  });
  if (linkedLead?.leadId) {
    const { recordLeadProgress } = await import("@/lib/lead-progress");
    await recordLeadProgress(linkedLead.leadId, "replied");
    // Antwort auf eine Bestandskampagne hat gerade den Lead angelegt: Lead-Chat, der Assistent darf (wie bisher) antworten
    if (!botErlaubt && conversation.botActive && !conversation.leadId) botErlaubt = true;
  }

  // Policen vor dem Termin (Ole, 17.11.2026, lib/policen/server.ts): Fotos/PDFs im Lead-Chat laden und verschlüsselt
  // speichern (Gesundheitsbezug nur mit Einwilligung), Einwilligungs-Knöpfe und „Widerruf“. Auch ohne Assistent.
  if (linkedLead?.leadId) {
    try {
      const policen = await import("@/lib/policen/server");
      const media = type === "image" ? m.image : type === "document" ? m.document : null;
      const nfm = type === "interactive" ? m.interactive?.nfm_reply : null;
      const r = media
        ? await policen.handleInboundMedia({ conversationId: conversation.id, messageId: inboundMsg.id, medium: { type, ...media }, botErlaubt, now })
        : nfm
          ? // Policen-Strecke v2: Formular „Policen senden“ abgeschickt (Einwilligung, Dateien, lib/policen/server.ts)
            await policen.handleFlowAntwort({ conversationId: conversation.id, messageId: inboundMsg.id, responseJson: nfm.response_json ?? null, waMessageId: m.id ?? null, frageWaMessageId: m.context?.id ?? null, botErlaubt, now })
          : await policen.handlePolicenAntwort(conversation.id, { kind: type, text: body, payload: inboundPayload(m), waMessageId: m.id ?? null, frageWaMessageId: m.context?.id ?? null }, now);
      // Policen auslesen (lib/policen/auslesen, eigener KI-Zugang nur für Dokumente): nach Eingang bzw. Einwilligung im
      // Hintergrund; ohne Schlüssel, Einwilligung mit KI oder freigegebene Sparte passiert nichts
      void import("@/lib/policen/auslesen/server")
        .then((x) => x.nachEingang(linkedLead.leadId!, now))
        .catch(() => console.error("[policen-auslesen] nach eingang fehlgeschlagen"));
      if (r.handled) {
        // Termin-Strecke (P2): Antwort auf die Einwilligung zur Policen-Bitte → jetzt der Schluss (Adresse bestätigen)
        // Nur das Stichwort „ohne KI“ (A9, weiter = false): keine Antwort auf die Bitte, die Strecke wartet
        if (!media && botErlaubt && r.weiter !== false) await import("@/lib/whatsapp/termin-strecke").then((x) => x.nachPolicenAntwort(conversation.id, now, r.art)).catch(() => false);
        return;
      }
      if (media && botErlaubt) botErlaubt = false;
    } catch (e) {
      // Keine Inhalte, Dateinamen oder Medien-Adressen ins Protokoll (Rechtsprüfung A7)
      console.error("[whatsapp policen]", e instanceof Error ? e.name : "Fehler");
    }
  }

  // Knopf-Antworten (lib/whatsapp/knopf.ts): „Ja, passt“ bestätigt den Termin, „Kein Bedarf mehr“ schließt den Lead
  // ab (beides ohne Assistent); Terminwahl und Verschieben bekommt der Assistent mit Hinweis.
  let botHint: string | null = null;
  let knopfZeit: string | null = null;
  if (botErlaubt && (type === "button" || type === "interactive")) {
    try {
      const { handleButtonReply } = await import("@/lib/whatsapp/knopf");
      const r = await handleButtonReply(conversation.id, { kind: type, text: body, payload: inboundPayload(m) }, now);
      if (r.handled) return;
      botHint = r.hint ?? null;
      knopfZeit = r.zeit ?? null;
    } catch (e) {
      console.error("[whatsapp knopf]", e);
    }
  }

  // Bedenkzeit zum Angebot (Paket P5, lib/bedenkzeit-server.ts): „ich überlege noch“ → Frage nach dem Datum mit Knöpfen
  if (botErlaubt && type === "text" && linkedLead?.leadId && !botHint) {
    try {
      const { bedenkzeitImChat } = await import("@/lib/bedenkzeit-server");
      const r = await bedenkzeitImChat(conversation.id, body, now);
      if (r.handled) return;
      botHint = r.hint ?? null;
    } catch (e) {
      console.error("[whatsapp bedenkzeit]", e);
    }
  }

  // Übernommener Chat (Assistent pausiert) bzw. neuer Kontakt ohne Lead: Berater muss antworten bzw. entscheiden.
  if (!botErlaubt) {
    const { flagAttention } = await import("@/lib/whatsapp/attention");
    if (!linkedLead?.leadId && !pipeline) {
      // Push nur für wirklich neue Nummern, nicht für Kontakte aus der Business-App (die sieht der Vermittler dort ohnehin)
      const appKontakt = await nurLeads.istAppKontakt(customerId, from);
      await flagAttention(conversation.id, nurLeads.neuerKontaktGrund(body), { push: !appKontakt });
    } else {
      await flagAttention(conversation.id, body ? `Neue Nachricht: „${body.slice(0, 100)}"` : "Neue Nachricht");
    }
  }

  // KI-Bot anstoßen, nur wenn erlaubt (Lead-Chat bzw. Schalter für neue Kontakte). runBotTurn prüft das noch einmal.
  // Dynamischer Import bricht den Zyklus gateway <-> bot; Fehler dürfen die Ingestion nicht scheitern lassen.
  if (botErlaubt) {
    try {
      const { runBotTurn } = await import("@/lib/whatsapp/bot");
      await runBotTurn(conversation.id, { hint: botHint, knopfZeit });
    } catch (e) {
      console.error("[whatsapp bot]", e);
    }
  }
}

/**
 * Echo einer Nachricht, die der Kunde selbst in seiner WhatsApp-Business-App
 * geschrieben hat: als ausgehende Nachricht („Du (App)") speichern und den
 * Assistenten für diesen Chat pausieren — der Mensch hat übernommen.
 */
async function persistEcho(
  customerId: string,
  whatsAppAccountId: string,
  e: MessageEcho,
): Promise<void> {
  const to = e.to;
  if (!to) return;
  // Idempotenz — und von uns per API gesendete Nachrichten (schon mit
  // waMessageId gespeichert) nicht doppelt anlegen/als Übernahme werten.
  if (e.id) {
    const existing = await prisma.message.findUnique({
      where: { waMessageId: e.id },
      select: { id: true },
    });
    if (existing) return;
  }
  const now = new Date();
  // Private Chats bleiben privat: Echo an eine Nummer ohne Chat bei uns und ohne Lead wird nicht gespeichert.
  const known = await prisma.conversation.count({ where: { customerId, contactPhone: to } });
  if (!known) {
    const lead = await prisma.lead.count({ where: { customerId, phone: to, erasedAt: null } });
    if (!lead) return;
  }
  // Der Vermittler schreibt selbst: Assistent in diesem Chat sofort pausieren (wie beim Selbstschreiben im CRM)
  const conversation = await prisma.conversation.upsert({
    where: { customerId_contactPhone: { customerId, contactPhone: to } },
    create: {
      customerId,
      whatsAppAccountId,
      contactPhone: to,
      botActive: false,
      status: "open",
      lastMessageAt: now,
    },
    update: { botActive: false, lastMessageAt: now, needsAttention: false, attentionReason: null, attentionAt: null },
  });
  const type = e.type ?? "text";
  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: "outbound",
      kind: type,
      body: type === "text" ? (e.text?.body ?? null) : `[${type}]`,
      waMessageId: e.id ?? null,
      status: "sent",
      sentBy: "app",
    },
  });
  if (!conversation.leadId) {
    await linkLeadToConversation(conversation.id).catch(() => {});
  }
}

async function applyStatus(s: StatusUpdate): Promise<void> {
  if (!s.id || !s.status) return;
  const pricing =
    s.pricing && typeof s.pricing.billable === "boolean"
      ? { billable: s.pricing.billable, pricingCategory: s.pricing.category?.toLowerCase() ?? null }
      : {};
  await prisma.message.updateMany({
    where: { waMessageId: s.id },
    data: { status: s.status, ...pricing },
  });
  // Nicht zugestellt: Fehlercode speichern; „kein WhatsApp“ → Lead sofort zum Vermittler (Anruf, E-Mail),
  // Kampagnen-Empfänger künftig per E-Mail; andere Fehler → Admin-Alarm (lib/whatsapp/kein-whatsapp.ts)
  if (s.status === "failed") {
    const { handleFailedStatus } = await import("@/lib/whatsapp/kein-whatsapp");
    await handleFailedStatus(s.id, s.errors);
    return;
  }
  // Bestandskampagnen: Zustellung und Lesebestätigung am Empfänger (Statistik je Kampagne)
  const { applyCampaignStatus } = await import("@/lib/bestand/campaigns");
  await applyCampaignStatus(s.id, s.status);
}

/**
 * Ausgehende Nachricht senden (vom Bot oder einem Agenten) und persistieren.
 * Lädt das verbundene WhatsApp-Konto des Kunden, entschlüsselt den API-Key und
 * ruft 360dialog auf. (Freitext — nur innerhalb des 24h-Fensters erlaubt.)
 */
export async function sendWhatsAppMessage(opts: {
  customerId: string;
  to: string;
  body: string;
  sentBy?: "bot" | "agent" | "system";
  sentByUserId?: string | null;
  /**
   * Antwort-Knöpfe (höchstens 3, je 20 Zeichen; id = Payload, lib/whatsapp/knopf.ts), nur im offenen Fenster.
   * Passen sie nicht, geht die Nachricht als reiner Text.
   */
  buttons?: { id: string; title: string }[] | null;
  /** Fußzeile der interaktiven Nachricht (nur mit Knöpfen, höchstens 60 Zeichen; Policen-Einwilligung) */
  footer?: string | null;
  /**
   * Policen-Strecke v2 (lib/policen/flow): interaktive Flow-Nachricht (ein Knopf öffnet das Formular) statt Knöpfen,
   * bzw. eine freigegebene Vorlage mit Flow-Knopf (auch außerhalb des Fensters). body ist dann der gezeigte Text.
   */
  flow?: { flowId: string; token: string; cta: string; screen: string; data: Record<string, string> } | null;
  vorlage?: { name: string; language: string; components: unknown[] } | null;
}): Promise<SendResult> {
  const account = await prisma.whatsAppAccount.findUnique({
    where: { customerId: opts.customerId },
  });
  if (!account || account.status !== "connected" || !account.apiKeyEnc) {
    throw new Error("Kein verbundenes WhatsApp-Konto für diesen Kunden.");
  }

  // „STOPP“: keine Nachrichten mehr an diese Nummer, auch nicht von Hand (lib/whatsapp/stopp.ts)
  const { isOptedOut, WhatsAppOptOutError } = await import("@/lib/whatsapp/stopp");
  if (await isOptedOut(opts.customerId, opts.to)) throw new WhatsAppOptOutError();
  // Festnetznummer ohne eigene Nachricht des Kontakts: nicht senden (lib/whatsapp/festnetz.ts)
  const { pruefeFestnetz } = await import("@/lib/whatsapp/festnetz");
  await pruefeFestnetz({ customerId: opts.customerId, to: opts.to });

  const apiKey = decryptSecret(account.apiKeyEnc);
  // Keine Gedankenstriche an Leads (auch KI-Antworten des Assistenten)
  opts = { ...opts, body: ohneGedankenstriche(opts.body) };
  const knoepfe = opts.buttons?.length && opts.buttons.length <= 3 && opts.buttons.every((b) => b.title.length <= 20) ? opts.buttons : null;
  const footer = (knoepfe || opts.flow || opts.vorlage) && opts.footer ? ohneGedankenstriche(opts.footer) : null;
  const result = opts.vorlage
    ? await sendTemplate(apiKey, opts.to, opts.vorlage.name, opts.vorlage.language, opts.vorlage.components)
    : opts.flow
      ? await sendFlow(apiKey, opts.to, { ...opts.flow, body: opts.body, footer })
      : knoepfe
        ? await sendButtons(apiKey, opts.to, opts.body, knoepfe, footer)
        : await sendText(apiKey, opts.to, opts.body);

  const now = new Date();
  const conversation = await prisma.conversation.upsert({
    where: {
      customerId_contactPhone: {
        customerId: opts.customerId,
        contactPhone: opts.to,
      },
    },
    create: {
      customerId: opts.customerId,
      whatsAppAccountId: account.id,
      contactPhone: opts.to,
      status: "open",
      lastMessageAt: now,
    },
    update: { lastMessageAt: now },
  });

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: "outbound",
      kind: "text",
      body: footer ? `${opts.body}\n\n${footer}` : opts.body,
      waMessageId: result.messageId,
      status: "sent",
      sentBy: opts.sentBy ?? "system",
      sentByUserId: opts.sentByUserId ?? null,
    },
  });

  return result;
}
