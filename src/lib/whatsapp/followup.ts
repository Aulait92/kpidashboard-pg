// „Nachfassen senden" (Chat > 24 h still → nur freigegebene Vorlage möglich):
// wählt die zur Situation passende Vorlage bzw. blockiert, wenn Nachfassen
// keinen Sinn ergibt. Wird für die Vorschau im Chat UND serverseitig beim
// Senden genutzt (der Client kann den Zweck nicht selbst wählen).

import { prisma } from "@/lib/prisma";
import { anspracheOf } from "@/lib/whatsapp/reminders";
import { displayProduct } from "@/lib/products";
import { firstNameOf, noticeText, pickTemplate, renderTemplate, type NoticePurpose } from "@/lib/whatsapp/templates";
import { ansprechpartner } from "@/lib/lead-anrede";
import { zweiTerminvorschlaege } from "@/lib/whatsapp/termin-vorschlaege";
import { a, type AnredeKontakt } from "@/lib/ansprache";
import { interesseAusFormular } from "@/lib/interesse-formular";

export type FollowupChoice =
  | { kind: "blocked"; reason: string }
  | (FollowupSend & {
      kind: "ok";
      label: string;
      /** Name und Anrede des Kontakts (für die Wahl der Vorlage beim Senden). */
      anrede: AnredeKontakt;
    });

const DONE = new Set(["abschluss", "kein interesse", "disqualifiziert"]);

function interestFrom(formData: unknown, source: string | null, an: "sie" | "du" = "sie"): string {
  if (Array.isArray(formData)) {
    const interesse = interesseAusFormular(formData as { label?: string | null; value?: string | null }[]);
    if (interesse) return interesse;
  }
  return source ? displayProduct(source) : a(an, "deiner Anfrage", "Ihrer Anfrage");
}

export async function chooseFollowup(conversationId: string): Promise<FollowupChoice> {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      customerId: true,
      contactName: true,
      contactPhone: true,
      leadId: true,
      optedOutAt: true,
      lead: { select: { status: true, formData: true, source: true, waConsent: true } },
      _count: { select: { messages: { where: { direction: "inbound" } } } },
    },
  });
  if (!conv) return { kind: "blocked", reason: "Chat nicht gefunden." };
  // „STOPP“ bzw. keine Einwilligung im Leadformular (lib/whatsapp/stopp.ts, lib/einwilligung-leadformular.ts)
  if (conv.optedOutAt) return { kind: "blocked", reason: "Der Kontakt hat „STOPP“ geschrieben und bekommt keine WhatsApp-Nachrichten mehr." };
  if (conv.lead?.waConsent === "nein" && conv._count.messages === 0) {
    return { kind: "blocked", reason: "Der Lead hat im Formular nicht in WhatsApp eingewilligt. Bitte anrufen oder per E-Mail melden." };
  }

  const status = (conv.lead?.status ?? "").trim().toLowerCase();
  if (DONE.has(status)) {
    return {
      kind: "blocked",
      reason:
        status === "abschluss"
          ? "Lead ist abgeschlossen, kein Nachfassen nötig."
          : "Lead hat kein Interesse. Bitte nicht erneut anschreiben.",
    };
  }

  const appts = await prisma.appointment.findMany({
    where: { OR: [{ conversationId }, ...(conv.leadId ? [{ leadId: conv.leadId }] : [])] },
    orderBy: { startsAt: "desc" },
    take: 5,
    select: { status: true, startsAt: true },
  });
  const upcoming = appts.find((a) => a.status === "booked" && a.startsAt.getTime() > Date.now());
  if (upcoming) {
    const when = new Intl.DateTimeFormat("de-DE", {
      timeZone: "Europe/Berlin",
      weekday: "short",
      day: "numeric",
      month: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(upcoming.startsAt);
    return {
      kind: "blocked",
      reason: `Termin am ${when} Uhr steht, die Erinnerung kommt automatisch.`,
    };
  }

  const an = await anspracheOf(conv.customerId);
  const who = await ansprechpartner({ customerId: conv.customerId, leadId: conv.leadId, phone: conv.contactPhone, name: conv.contactName });
  const first = firstNameOf(conv.contactName);
  let purpose: NoticePurpose = "followup";
  let rest: string[] = [];
  if (appts[0]?.status === "no_show") {
    purpose = "followup_noshow";
  } else if (status === "angebot gesendet") {
    purpose = "followup_offer";
    rest = [interestFrom(conv.lead?.formData, conv.lead?.source ?? null, an)];
  }
  const send = await prepareFollowup({ customerId: conv.customerId, leadId: conv.leadId, purpose, first, rest, an, who });
  const labels: Partial<Record<NoticePurpose, string>> = {
    followup: "Zwei Terminvorschläge",
    followup_nudge: "Kurz nachfragen",
    followup_offer: "Angebot nachfassen",
    followup_noshow: "Nach verpasstem Termin",
  };
  return { kind: "ok", label: labels[send.purpose] ?? "Nachfassen", anrede: who.kontakt, ...send };
}

/** Was zum Senden gehört (Zweck, Parameter, Knopf-Payloads, Vorschau) – für Vorschau und Versand gleich. */
export type FollowupSend = {
  purpose: NoticePurpose;
  params: string[];
  /** Für ältere freigegebene Fassungen mit anderer Belegung (z. B. „followup“ v3 ohne Zeiten). */
  legacyParams?: string[];
  /** Payloads der Knöpfe „Erste Zeit passt“/„Zweite Zeit passt“ (Startzeiten). */
  buttonPayloads?: string[];
  preview: string;
  /** Gibt es eine freigegebene Vorlage? Sonst kann nicht gesendet werden. */
  approved: boolean;
};

/**
 * Nachfassen vorbereiten. „followup“ bekommt zwei freie Zeiten aus dem Kalender (lib/whatsapp/termin-vorschlaege.ts);
 * ohne Kalender bzw. freie Zeiten wird daraus die kurze Nachfrage „followup_nudge“.
 */
async function prepareFollowup(o: {
  customerId: string;
  leadId: string | null;
  purpose: NoticePurpose;
  first: string;
  rest: string[];
  an: "sie" | "du";
  who: Awaited<ReturnType<typeof ansprechpartner>>;
}): Promise<FollowupSend> {
  let purpose = o.purpose;
  let rest = o.rest;
  let extra: Pick<FollowupSend, "legacyParams" | "buttonPayloads"> = {};
  if (purpose === "followup") {
    const zeiten = await zweiTerminvorschlaege(o.customerId, o.leadId);
    if (zeiten) {
      rest = zeiten.labels;
      extra = { legacyParams: [o.first], buttonPayloads: zeiten.payloads };
    } else {
      purpose = "followup_nudge";
    }
  }
  const params = [o.first, ...rest];
  // Vorlage, die tatsächlich gesendet würde (passend zu Ansprache und Anrede); sonst der aktuelle Text
  const pick = await pickTemplate(o.customerId, purpose, o.who.kontakt);
  const restFor = pick && !pick.current && extra.legacyParams ? extra.legacyParams.slice(1) : rest;
  const preview = pick ? renderTemplate(pick.tpl.body, pick.params(restFor)) : noticeText(purpose, o.an, o.who, o.who.kontakt, rest);
  return { purpose, params, ...extra, preview, approved: !!pick };
}

export type FollowupOption = FollowupSend & {
  /** Auswahl im Admin-Chat (bleibt „followup“, auch wenn ohne Kalender die kurze Nachfrage gesendet wird). */
  key: (typeof ADMIN_FOLLOWUP_PURPOSES)[number];
  label: string;
  /** Name und Anrede des Kontakts (für die Wahl der Vorlage beim Senden). */
  anrede: AnredeKontakt;
};

/** Nachfass-Vorlagen, die der Admin bei geschlossenem Fenster wählen kann. */
export const ADMIN_FOLLOWUP_PURPOSES = ["followup", "followup_offer", "followup_noshow", "followup_last"] as const satisfies readonly NoticePurpose[];

/**
 * Admin-Chat: alle Nachfass-Vorlagen zur Auswahl (vorgeschlagen ist die zur
 * Situation passende aus chooseFollowup). Parameter und Vorschau entstehen
 * serverseitig, der Client wählt nur den Zweck.
 */
export async function followupOptions(conversationId: string): Promise<FollowupOption[]> {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      customerId: true,
      leadId: true,
      contactName: true,
      contactPhone: true,
      lead: { select: { formData: true, source: true } },
    },
  });
  if (!conv) return [];
  const first = firstNameOf(conv.contactName);
  const an = await anspracheOf(conv.customerId);
  const who = await ansprechpartner({ customerId: conv.customerId, leadId: conv.leadId, phone: conv.contactPhone, name: conv.contactName });
  const labels: Record<(typeof ADMIN_FOLLOWUP_PURPOSES)[number], string> = {
    followup: "Zwei Terminvorschläge",
    followup_offer: "Angebot nachfassen",
    followup_noshow: "Nach verpasstem Termin",
    followup_last: "Letzte Nachricht",
  };
  return Promise.all(
    ADMIN_FOLLOWUP_PURPOSES.map(async (key) => {
      const rest = key === "followup_offer" ? [interestFrom(conv.lead?.formData, conv.lead?.source ?? null, an)] : [];
      const send = await prepareFollowup({ customerId: conv.customerId, leadId: conv.leadId, purpose: key, first, rest, an, who });
      return { key, label: send.purpose === "followup_nudge" ? "Kurz nachfragen" : labels[key], anrede: who.kontakt, ...send };
    }),
  );
}


/**
 * Auswahl im Kundenbereich (Ole, 19.11.2026): freigegebene Nachfass-Vorlagen, die zur Situation passende zuerst und als
 * „Empfohlen“ markiert (aus chooseFollowup; „Kurz nachfragen“ gehört zu „Zwei Terminvorschläge“). Leer = keine freigegeben.
 */
export async function nachfassOptionen(conversationId: string, choice: FollowupChoice): Promise<(FollowupOption & { empfohlen: boolean })[]> {
  if (choice.kind !== "ok") return [];
  const empfohlen = choice.purpose === "followup_nudge" ? "followup" : choice.purpose;
  const alle = (await followupOptions(conversationId)).filter((o) => o.approved);
  return alle
    .map((o) => ({ ...o, empfohlen: o.key === empfohlen }))
    .sort((a, b) => Number(b.empfohlen) - Number(a.empfohlen));
}
