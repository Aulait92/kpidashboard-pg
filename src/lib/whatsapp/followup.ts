// „Nachfassen senden" (Chat > 24 h still → nur freigegebene Vorlage möglich):
// wählt die zur Situation passende Vorlage bzw. blockiert, wenn Nachfassen
// keinen Sinn ergibt. Wird für die Vorschau im Chat UND serverseitig beim
// Senden genutzt (der Client kann den Zweck nicht selbst wählen).

import { prisma } from "@/lib/prisma";
import { anspracheOf } from "@/lib/whatsapp/reminders";
import { displayProduct } from "@/lib/products";
import { firstNameOf, noticeText, pickTemplate, renderTemplate, type NoticePurpose } from "@/lib/whatsapp/templates";
import { ansprechpartner } from "@/lib/lead-anrede";
import { a, type AnredeKontakt } from "@/lib/ansprache";

export type FollowupChoice =
  | { kind: "blocked"; reason: string }
  | {
      kind: "ok";
      purpose: NoticePurpose;
      label: string;
      params: string[];
      /** Name und Anrede des Kontakts (für die Wahl der Vorlage beim Senden). */
      anrede: AnredeKontakt;
      preview: string;
      /** Gibt es eine freigegebene Vorlage? Sonst kann nicht gesendet werden. */
      approved: boolean;
    };

const DONE = new Set(["abschluss", "kein interesse", "disqualifiziert"]);

function interestFrom(formData: unknown, source: string | null, an: "sie" | "du" = "sie"): string {
  if (Array.isArray(formData)) {
    const hit = (formData as { label?: string; value?: string }[]).find(
      (a) => a?.label === "Versicherungsinteresse" && typeof a.value === "string",
    );
    if (hit?.value) return hit.value;
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
      lead: { select: { status: true, formData: true, source: true } },
    },
  });
  if (!conv) return { kind: "blocked", reason: "Chat nicht gefunden." };

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
  const params = [first, ...rest];

  // Vorlage, die tatsächlich gesendet würde (passend zu Ansprache und Anrede); sonst der aktuelle Text
  const pick = await pickTemplate(conv.customerId, purpose, who.kontakt);
  const preview = pick ? renderTemplate(pick.tpl.body, pick.params(rest)) : noticeText(purpose, an, who, who.kontakt, rest);
  const labels: Partial<Record<NoticePurpose, string>> = {
    followup: "Allgemein nachfassen",
    followup_offer: "Angebot nachfassen",
    followup_noshow: "Nach verpasstem Termin",
  };
  return {
    kind: "ok",
    purpose,
    label: labels[purpose] ?? "Nachfassen",
    params,
    anrede: who.kontakt,
    preview,
    approved: !!pick,
  };
}

export type FollowupOption = {
  purpose: NoticePurpose;
  label: string;
  params: string[];
  /** Name und Anrede des Kontakts (für die Wahl der Vorlage beim Senden). */
  anrede: AnredeKontakt;
  preview: string;
  approved: boolean;
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
    followup: "Allgemein nachfassen",
    followup_offer: "Angebot nachfassen",
    followup_noshow: "Nach verpasstem Termin",
    followup_last: "Letzte Nachricht",
  };
  return Promise.all(
    ADMIN_FOLLOWUP_PURPOSES.map(async (purpose) => {
      const rest = purpose === "followup_offer" ? [interestFrom(conv.lead?.formData, conv.lead?.source ?? null, an)] : [];
      const params = [first, ...rest];
      // Vorlage, die tatsächlich gesendet würde (passend zu Ansprache und Anrede); sonst der aktuelle Text
      const pick = await pickTemplate(conv.customerId, purpose, who.kontakt);
      const preview = pick ? renderTemplate(pick.tpl.body, pick.params(rest)) : noticeText(purpose, an, who, who.kontakt, rest);
      return { purpose, label: labels[purpose], params, anrede: who.kontakt, preview, approved: !!pick };
    }),
  );
}
