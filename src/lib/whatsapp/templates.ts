// System-Nachrichten (Erstanschreiben, Buchungsbestätigung, Erinnerung).
// WhatsApp erlaubt Freitext nur im 24h-Service-Fenster (nach der letzten
// Nachricht des Kontakts). Außerhalb muss eine von Meta freigegebene Vorlage
// verwendet werden. sendWhatsAppNotice wählt automatisch:
//   Fenster offen → Freitext (identischer Inhalt, keine Vorlagenkosten)
//   Fenster zu    → freigegebene Vorlage des Kunden für diesen Zweck
//
// Anrede-Zeile (Ole, 14.11.2026; Regel in lib/ansprache.ts → anredeZeile):
//   Du-Fassung        „Hallo {{1}}, …“             {{1}} = Vorname
//   Sie-Fassung       „Guten Tag {{1}}, …“         {{1}} = „Frau Schneider“ bzw. „Julia Schneider“
//   Sie ohne Namen    „Guten Tag, …“               (kein Namensplatzhalter; die übrigen rücken auf)
// Meta erlaubt keine leeren Parameter und keinen Platzhalter ganz am Anfang oder Ende. Ohne
// Nachnamen gibt es daher keine „Guten Tag {{1}}“-Nachricht mit leerem Wert, sondern die eigene
// Fassung ohne Namen. Weitere Parameter je Zweck (nach dem Namen): siehe REST_PARAMS.

import { decryptSecret } from "@/lib/encryption";
import { prisma } from "@/lib/prisma";
import { anredeName, anredeZeile, asAnsprache, kontaktParts, type Ansprache, type AnredeKontakt } from "@/lib/ansprache";
import { sendTemplate, sendText } from "@/lib/whatsapp/dialog360";

export type NoticePurpose =
  | "outreach"
  | "booking_confirmation"
  | "reminder"
  | "reschedule"
  | "followup"
  | "followup_offer"
  | "followup_noshow"
  | "followup_last"
  | "campaign_cross_sell"
  | "campaign_review"
  | "campaign_birthday"
  | "campaign_renewal"
  | "review_request"
  | "referral_request"
  | "referral_thanks"
  | "referral_update";

export const PURPOSE_LABELS: Record<NoticePurpose, string> = {
  outreach: "Erstanschreiben",
  booking_confirmation: "Buchungsbestätigung",
  reminder: "Termin-Erinnerung",
  reschedule: "Termin verschoben",
  followup: "Nachfassen allgemein (Chat > 24 h still)",
  followup_offer: "Nachfassen nach Angebot",
  followup_noshow: "Nachfassen nach verpasstem Termin",
  followup_last: "Nachfassen: letzte Nachricht (Abfolge)",
  campaign_cross_sell: "Bestandskunden: Lücke schließen",
  campaign_review: "Bestandskunden: Jahresgespräch",
  campaign_birthday: "Bestandskunden: Geburtstag",
  campaign_renewal: "Bestandskunden: Ablauf/Wechsel",
  review_request: "Empfehlungen: Nachfrage + Google-Bewertung",
  referral_request: "Empfehlungen: Bitte um Empfehlung",
  referral_thanks: "Empfehlungen: Dank an den Empfehlenden",
  referral_update: "Empfehlungen: Rückmeldung an den Empfehlenden",
};

/**
 * Version der automatisch eingereichten Texte. v2 (14.11.2026): Anrede „Guten Tag Frau Schneider“
 * bei Sie, eigene Fassung ohne Namen, Firma/Berater getrennt. Freigegebene v1-Vorlagen bleiben
 * im Einsatz, bis die v2-Fassung freigegeben ist.
 */
export const TEMPLATE_VERSION = "v2";

/** Fassung einer Vorlage. Kampagnen und Empfehlungen gibt es nur gesiezt. */
export type TemplateForm = "du" | "sie" | "sie_ohne_name";

/** Weitere Parameter je Zweck (nach dem Namen; Reihenfolge wie im Text). */
export const REST_PARAMS: Record<NoticePurpose, string[]> = {
  outreach: [],
  booking_confirmation: ["Datum/Uhrzeit", "Art", "Link/Hinweis"],
  reminder: ["Datum/Uhrzeit", "Art", "Link/Hinweis"],
  reschedule: ["Datum/Uhrzeit", "Art", "Link/Hinweis"],
  followup: [],
  followup_offer: ["Thema (z. B. Hausrat, Haftpflicht)"],
  followup_noshow: [],
  followup_last: [],
  campaign_cross_sell: ["Thema (z. B. Hausrat)"],
  campaign_review: [],
  campaign_birthday: [],
  campaign_renewal: ["Vertrag (z. B. KFZ)"],
  review_request: ["Google-Link"],
  referral_request: ["Empfehlungslink"],
  referral_thanks: [],
  referral_update: ["Stand der Empfehlung"],
};

/** Bezeichnung des Namensplatzhalters je Fassung. */
export const NAME_PARAM: Record<"du" | "sie", string> = { du: "Vorname", sie: "Anrede und Nachname" };

/**
 * Text NACH der Anrede-Zeile. {{2}}, {{3}} … = REST_PARAMS. [Firma] = Kundenname („Buchung bei …“,
 * „Assistent von …“), [Berater] = Person („hier ist …“, „Herzliche Grüße, …“).
 * Ohne „du“: nur gesiezt (Bestandskunden, Empfehlungen).
 */
export const TEMPLATE_BODY: Record<NoticePurpose, { du?: string; sie: string }> = {
  outreach: {
    du: "danke für deine Anfrage! Hier ist der digitale Assistent von [Firma]. Hast du kurz Zeit für zwei Fragen, damit wir dir ein passendes Angebot machen können?",
    sie: "vielen Dank für Ihre Anfrage! Hier ist der digitale Assistent von [Firma]. Haben Sie kurz Zeit für zwei Fragen, damit wir Ihnen ein passendes Angebot machen können?",
  },
  booking_confirmation: {
    du: "vielen Dank für deine Buchung bei [Firma]. Dein Termin ist bestätigt: {{2}} ({{3}}). {{4}} Wir freuen uns auf das Gespräch!",
    sie: "vielen Dank für Ihre Buchung bei [Firma]. Ihr Termin ist bestätigt: {{2}} ({{3}}). {{4}} Wir freuen uns auf das Gespräch!",
  },
  reminder: {
    du: "hier ist eine kurze Erinnerung an deinen Termin bei [Firma]: {{2}} ({{3}}). {{4}} Bis dann!",
    sie: "hier ist eine kurze Erinnerung an Ihren Termin bei [Firma]: {{2}} ({{3}}). {{4}} Bis dann!",
  },
  reschedule: {
    du: "dein Termin bei [Firma] musste leider verschoben werden. Die neue Zeit ist {{2}} ({{3}}). {{4}} Vielen Dank für dein Verständnis!",
    sie: "Ihr Termin bei [Firma] musste leider verschoben werden. Die neue Zeit ist {{2}} ({{3}}). {{4}} Vielen Dank für Ihr Verständnis!",
  },
  followup: {
    du: "hier ist nochmal der digitale Assistent von [Firma]. Passt es dir diese Woche noch für ein kurzes Gespräch? Antworte einfach hier, dann schlage ich dir Zeiten vor.",
    sie: "hier ist nochmal der digitale Assistent von [Firma]. Passt es Ihnen diese Woche noch für ein kurzes Gespräch? Antworten Sie einfach hier, dann schlage ich Ihnen Zeiten vor.",
  },
  followup_offer: {
    du: "hier ist der digitale Assistent von [Firma]. Konntest du dir das Angebot zu {{2}} schon anschauen? Wenn du Fragen hast oder etwas anpassen möchtest, antworte einfach hier.",
    sie: "hier ist der digitale Assistent von [Firma]. Konnten Sie sich das Angebot zu {{2}} schon anschauen? Wenn Sie Fragen haben oder etwas anpassen möchten, antworten Sie einfach hier.",
  },
  followup_noshow: {
    du: "schade, dass es mit unserem Termin nicht geklappt hat. Hier ist der digitale Assistent von [Firma]. Sollen wir einen neuen Termin finden? Antworte einfach hier.",
    sie: "schade, dass es mit unserem Termin nicht geklappt hat. Hier ist der digitale Assistent von [Firma]. Sollen wir einen neuen Termin finden? Antworten Sie einfach hier.",
  },
  followup_last: {
    du: "hier ist nochmal der digitale Assistent von [Firma]. Ich melde mich ein letztes Mal: Ist das Thema für dich noch aktuell? Dann antworte einfach hier. Wenn nicht, ist das völlig in Ordnung, dann melden wir uns nicht weiter.",
    sie: "hier ist nochmal der digitale Assistent von [Firma]. Ich melde mich ein letztes Mal: Ist das Thema für Sie noch aktuell? Dann antworten Sie einfach hier. Wenn nicht, ist das völlig in Ordnung, dann melden wir uns nicht weiter.",
  },
  campaign_cross_sell: {
    sie: "hier ist [Berater], Ihr Versicherungsberater. Kurze Frage: Sind Sie beim Thema {{2}} schon gut abgesichert? Wenn Sie möchten, schaue ich mir das gern kostenlos mit Ihnen an. Antworten Sie einfach hier.",
  },
  campaign_review: {
    sie: "hier ist [Berater], Ihr Versicherungsberater. Es ist Zeit für einen kurzen Check Ihrer Verträge: Passt noch alles zu Ihrer Situation? Antworten Sie einfach hier, dann finden wir einen Termin.",
  },
  campaign_birthday: {
    sie: "herzlichen Glückwunsch zum Geburtstag! Alles Gute für das neue Lebensjahr wünscht Ihnen [Berater]. Wenn ich etwas für Sie tun kann, antworten Sie einfach hier.",
  },
  campaign_renewal: {
    sie: "hier ist [Berater], Ihr Versicherungsberater. Bei Ihrem Vertrag ({{2}}) steht bald ein guter Zeitpunkt an, um Beitrag und Leistung zu prüfen. Soll ich mir das kurz für Sie anschauen? Antworten Sie einfach hier.",
  },
  // Alle bekommen dieselbe Nachricht: erst der direkte Draht, dann der Google-Link (kein Gating).
  review_request: {
    sie: "ich hoffe, Sie sind mit Ihrem neuen Vertrag gut versorgt. Wenn irgendetwas nicht gepasst hat, antworten Sie mir einfach direkt hier, ich kümmere mich persönlich darum. Und wenn Sie zufrieden waren, freue ich mich sehr über eine kurze Google-Bewertung: {{2}} Herzliche Grüße, [Berater]",
  },
  referral_request: {
    sie: "hier ist [Berater]. Kennen Sie jemanden, dem ich genauso weiterhelfen kann? Über Ihren persönlichen Link kann die Person ganz einfach selbst Kontakt mit mir aufnehmen: {{2}} Vielen Dank für Ihr Vertrauen!",
  },
  referral_thanks: {
    sie: "ich wollte mich noch einmal herzlich für Ihre Empfehlung bedanken. Ich konnte weiterhelfen. Das ist das schönste Lob für meine Arbeit! Herzliche Grüße, [Berater]",
  },
  // Nur mit Einwilligung der empfohlenen Person (Empfehlungsseite). {{2}} = ein Satz zum Stand.
  referral_update: {
    sie: "kurze Rückmeldung zu Ihrer Empfehlung: {{2}} Vielen Dank, dass Sie an mich gedacht haben! Herzliche Grüße, [Berater]",
  },
};

const ALL_PURPOSES = Object.keys(TEMPLATE_BODY) as NoticePurpose[];

/** Gibt es eine Du-Fassung? (Assistent, Termine, Nachfassen; Kampagnen und Empfehlungen siezen immer) */
export function hasDuVariant(purpose: NoticePurpose): boolean {
  return !!TEMPLATE_BODY[purpose].du;
}

/** Gibt es für diesen Zweck getrennte Du- und Sie-Fassungen? */
export function hasSieVariant(purpose: NoticePurpose): boolean {
  return hasDuVariant(purpose);
}

/** Ansprache, die für diesen Zweck tatsächlich gilt (Kampagnen/Empfehlungen: immer Sie). */
export function effectiveAnsprache(purpose: NoticePurpose, an: Ansprache): Ansprache {
  return an === "du" && hasDuVariant(purpose) ? "du" : "sie";
}

/** Alle Fassungen, die je Zweck bei Meta eingereicht werden. */
export function formsFor(purpose: NoticePurpose): TemplateForm[] {
  return hasDuVariant(purpose) ? ["du", "sie", "sie_ohne_name"] : ["sie", "sie_ohne_name"];
}

/** {{n}} → {{n+by}} */
function shiftVars(text: string, by: number): string {
  return text.replace(/\{\{(\d+)\}\}/g, (_, n: string) => `{{${Number(n) + by}}}`);
}

/**
 * Vorlagentext einer Fassung (mit [Firma]/[Berater]). Statt einer Fassung geht auch die Ansprache:
 * „du“ → Du-Fassung (bzw. Sie, wenn es keine gibt), „sie“ → Sie-Fassung mit Namen.
 */
export function templateTextFor(purpose: NoticePurpose, form: TemplateForm | Ansprache = "du"): string {
  const b = TEMPLATE_BODY[purpose];
  if (form === "du" && b.du) return `Hallo {{1}}, ${b.du}`;
  if (form === "sie_ohne_name") return `Guten Tag, ${shiftVars(b.sie, -1)}`;
  return `Guten Tag {{1}}, ${b.sie}`;
}

/** Platzhalter-Bezeichnungen einer Fassung (Reihenfolge {{1}}, {{2}} …). */
export function paramLabelsFor(purpose: NoticePurpose, form: TemplateForm | Ansprache = "du"): string[] {
  const rest = REST_PARAMS[purpose];
  if (form === "sie_ohne_name") return [...rest];
  return [NAME_PARAM[form === "du" && hasDuVariant(purpose) ? "du" : "sie"], ...rest];
}

/** Standardtexte (Du-Fassung, sonst Sie-Fassung) – z. B. als Vorschlag beim Anlegen von Hand. */
export const SUGGESTED_TEMPLATE_TEXT = Object.fromEntries(ALL_PURPOSES.map((p) => [p, templateTextFor(p, "du")])) as Record<NoticePurpose, string>;

/** Platzhalter der Standardtexte. */
export const PURPOSE_PARAMS = Object.fromEntries(ALL_PURPOSES.map((p) => [p, paramLabelsFor(p, "du")])) as Record<NoticePurpose, string[]>;

/** Sie-Fassungen (mit Namen) der Zwecke, die auch eine Du-Fassung haben. */
export const SIE_TEMPLATE_TEXT: Partial<Record<NoticePurpose, string>> = Object.fromEntries(
  ALL_PURPOSES.filter(hasDuVariant).map((p) => [p, templateTextFor(p, "sie")]),
);

/** Ist dieser (automatisch eingereichte) Vorlagenname eine Sie-Fassung? pg_outreach_v1_sie, …_sie_ohne_name_r2 */
export function isSieTemplateName(name: string): boolean {
  return /_sie(_ohne_name)?(_r\d+)?$/.test(name);
}

/** [Firma] und [Berater] einsetzen. Ein einzelner Name gilt für beide. */
export type TemplateNames = { firm: string; advisor: string };
export function fillNames(text: string, names: TemplateNames | string): string {
  const n = typeof names === "string" ? { firm: names, advisor: names } : names;
  return text.split("[Firma]").join(n.firm).split("[Berater]").join(n.advisor);
}

/**
 * Welcher Wert gehört in {{1}}? Erkannt am Text, damit es auch für ältere und von Hand angelegte
 * Vorlagen stimmt: „Guten Tag {{1}}“ → Anrede und Nachname, „Guten Tag,“ ohne {{1}} am Anfang →
 * kein Namensplatzhalter, sonst (z. B. „Hallo {{1}}“) → Vorname.
 */
export type NameSlot = "vorname" | "anrede" | "ohne";
export function nameSlotOf(body: string): NameSlot {
  const t = body.trim();
  if (/^Guten Tag \{\{1\}\}/.test(t)) return "anrede";
  if (/^Guten Tag\s*[,!.]/.test(t)) return "ohne";
  return "vorname";
}

/**
 * Parameter für eine Vorlage: rest = Werte nach dem Namen (REST_PARAMS). null, wenn die Vorlage
 * einen Nachnamen braucht, der fehlt.
 */
export function templateParams(body: string, an: Ansprache, kontakt: AnredeKontakt | null | undefined, rest: string[]): string[] | null {
  const slot = nameSlotOf(body);
  if (slot === "ohne") return [...rest];
  if (slot === "anrede") {
    const name = anredeName("sie", kontakt);
    return name ? [name, ...rest] : null;
  }
  const first = kontaktParts(kontakt).first;
  return [first || (an === "du" ? "du" : "zusammen"), ...rest];
}

type Candidate = { name: string; body: string; auto?: boolean | null };

/**
 * Beste freigegebene Vorlage für Ansprache und Kontakt (rein, testbar). Liste: neueste zuerst.
 * Reihenfolge Sie: aktuelle Sie-Fassung mit Namen (nur mit Nachnamen) → Sie ohne Namen → ältere
 * Sie-Fassung → irgendeine. Du: aktuelle Du-Fassung → ältere Du-Fassung → irgendeine.
 * So bleibt bis zur Freigabe der neuen Fassung die bisherige freigegebene im Einsatz.
 */
export function rankTemplates<T extends Candidate>(
  list: T[],
  purpose: NoticePurpose,
  ansprache: Ansprache,
  kontakt: AnredeKontakt | null | undefined,
): { tpl: T; params: (rest: string[]) => string[] } | null {
  const an = effectiveAnsprache(purpose, ansprache);
  const hasName = !!anredeName("sie", kontakt);
  const current = (n: string) => n.startsWith(`pg_${purpose}_${TEMPLATE_VERSION}`);
  const score = (t: T): number | null => {
    const slot = nameSlotOf(t.body);
    if (slot === "anrede" && !hasName) return null; // bräuchte einen Nachnamen
    const sieWording = slot !== "vorname" || isSieTemplateName(t.name) || !hasDuVariant(purpose);
    const cur = current(t.name) ? 0 : 0.5;
    if (an === "du") {
      if (slot === "vorname" && !sieWording) return 0 + cur;
      if (slot !== "vorname") return 2 + cur;
      return 3 + cur;
    }
    if (slot === "anrede") return 0 + cur;
    if (slot === "ohne") return 1 + cur;
    if (sieWording) return 2 + cur;
    return 3 + cur;
  };
  let best: { tpl: T; s: number } | null = null;
  for (const t of list) {
    const s = score(t);
    if (s !== null && (!best || s < best.s)) best = { tpl: t, s };
  }
  if (!best) return null;
  const tpl = best.tpl;
  return { tpl, params: (rest) => templateParams(tpl.body, an, kontakt, rest) ?? [...rest] };
}

/**
 * Schnellantwort-Knopf für Direktwerbung (Kampagnen an Bestandskunden): Hinweis auf das
 * Widerspruchsrecht (Art. 21 Abs. 4 DSGVO). Ein Klick kommt als Antwort mit diesem Text
 * zurück und wird wie „STOPP“ behandelt (lib/bestand/campaigns.ts → handleCampaignReply).
 * Statische Quick-Reply-Knöpfe brauchen beim Senden keine Parameter.
 */
export const OPT_OUT_BUTTON = "Keine Nachrichten mehr";
export const TEMPLATE_BUTTONS: Partial<Record<NoticePurpose, string[]>> = {
  campaign_cross_sell: [OPT_OUT_BUTTON],
  campaign_review: [OPT_OUT_BUTTON],
  campaign_birthday: [OPT_OUT_BUTTON],
  campaign_renewal: [OPT_OUT_BUTTON],
  referral_request: [OPT_OUT_BUTTON],
};

export class NoTemplateError extends Error {
  constructor(purpose: string) {
    super(`Keine freigegebene WhatsApp-Vorlage für „${purpose}".`);
  }
}

/** Freigegebene Vorlage für Kunde, Zweck und Kontakt samt Parametern (siehe rankTemplates). */
export async function pickTemplate(customerId: string, purpose: NoticePurpose, kontakt?: AnredeKontakt | null) {
  const [customer, approved] = await Promise.all([
    prisma.customer.findUnique({ where: { id: customerId }, select: { leadAddress: true } }),
    prisma.messageTemplate.findMany({ where: { customerId, purpose, status: "approved" }, orderBy: { updatedAt: "desc" } }),
  ]);
  return rankTemplates(approved, purpose, asAnsprache(customer?.leadAddress), kontakt ?? null);
}

/**
 * Freigegebene Vorlage für den Versand: passend zur Ansprache des Kunden und zum Kontakt (mit
 * Nachnamen „Guten Tag Frau Schneider“, sonst „Guten Tag“). Der Erstkontakt wird nie blockiert,
 * solange irgendeine freigegeben ist.
 */
export async function pickApprovedTemplate(customerId: string, purpose: NoticePurpose, kontakt?: AnredeKontakt | null) {
  return (await pickTemplate(customerId, purpose, kontakt))?.tpl ?? null;
}

/** {{1}}, {{2}} … durch Parameter ersetzen. */
export function renderTemplate(body: string, params: string[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (_, n: string) => params[Number(n) - 1] ?? "");
}

/**
 * Freitext für das offene 24-h-Fenster: Anrede-Zeile nach Regel plus Text der aktuellen Fassung.
 * rest = Werte nach dem Namen (REST_PARAMS).
 */
export function noticeText(purpose: NoticePurpose, an: Ansprache, names: TemplateNames | string, kontakt: AnredeKontakt | null | undefined, rest: string[]): string {
  const eff = effectiveAnsprache(purpose, an);
  const b = TEMPLATE_BODY[purpose];
  const body = fillNames(eff === "du" && b.du ? b.du : b.sie, names);
  return `${anredeZeile(eff, kontakt)} ${renderTemplate(body, ["", ...rest])}`;
}

/** Vorname aus „Vorname Nachname" (Fallback neutral). */
export function firstNameOf(name: string | null | undefined): string {
  const first = (name ?? "").trim().split(/\s+/)[0];
  return first || "du";
}

/**
 * System-Nachricht senden und als Outbound-Message persistieren (damit Inbox
 * und Bot-Verlauf sie sehen). Verknüpft die Konversation optional mit dem Lead.
 */
export async function sendWhatsAppNotice(opts: {
  customerId: string;
  to: string;
  purpose: NoticePurpose;
  /**
   * Parameter wie in PURPOSE_PARAMS: [Vorname, …weitere]. Der Namensplatzhalter wird je nach
   * gewählter Vorlage ersetzt (Vorname, „Frau Schneider“ oder entfällt), siehe rankTemplates.
   */
  params: string[];
  /** Freitext für das offene 24h-Fenster (und Fallback-Inhalt der Inbox). */
  text: string;
  leadId?: string | null;
  contactName?: string | null;
  /** Name und Anrede des Kontakts (sonst nur contactName, Anrede unbekannt). */
  anrede?: AnredeKontakt | null;
}): Promise<{ mode: "text" | "template"; conversationId: string; messageId?: string | null }> {
  const account = await prisma.whatsAppAccount.findUnique({
    where: { customerId: opts.customerId },
  });
  if (!account || account.status !== "connected" || !account.apiKeyEnc) {
    throw new Error("Kein verbundenes WhatsApp-Konto für diesen Kunden.");
  }

  const existing = await prisma.conversation.findUnique({
    where: {
      customerId_contactPhone: {
        customerId: opts.customerId,
        contactPhone: opts.to,
      },
    },
    select: { windowExpiresAt: true },
  });
  const windowOpen =
    !!existing?.windowExpiresAt && existing.windowExpiresAt.getTime() > Date.now();

  const apiKey = decryptSecret(account.apiKeyEnc);
  let mode: "text" | "template";
  let body: string;
  let messageId: string | null;
  let pricingCategory: string | null = null;

  if (windowOpen) {
    mode = "text";
    body = opts.text;
    messageId = (await sendText(apiKey, opts.to, opts.text)).messageId;
  } else {
    const kontakt: AnredeKontakt = opts.anrede ?? { fullName: opts.contactName ?? null };
    const pick = await pickTemplate(opts.customerId, opts.purpose, kontakt);
    if (!pick) throw new NoTemplateError(opts.purpose);
    const { tpl } = pick;
    const params = pick.params(opts.params.slice(1));
    mode = "template";
    pricingCategory = tpl.category.toLowerCase();
    body = renderTemplate(tpl.body, params);
    // Meta lehnt leere Parameter ab
    const components = params.length
      ? [
          {
            type: "body",
            parameters: params.map((p) => ({ type: "text", text: p.trim() || "-" })),
          },
        ]
      : undefined;
    messageId = (await sendTemplate(apiKey, opts.to, tpl.name, tpl.language, components))
      .messageId;
  }

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
      contactName: opts.contactName ?? null,
      leadId: opts.leadId ?? null,
      status: "open",
      lastMessageAt: now,
    },
    update: {
      lastMessageAt: now,
      ...(opts.leadId ? { leadId: opts.leadId } : {}),
    },
    select: { id: true },
  });

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: "outbound",
      kind: mode === "template" ? "template" : "text",
      body,
      waMessageId: messageId,
      status: "sent",
      sentBy: "system",
      // Vorlagen kosten (vorläufig); der Status-Webhook liefert Metas endgültige Angabe.
      ...(pricingCategory ? { pricingCategory, billable: true } : {}),
    },
  });

  // messageId: für den Zustellstatus am Kampagnen-Empfänger (delivered/read aus dem Webhook)
  return { mode, conversationId: conversation.id, messageId };
}
