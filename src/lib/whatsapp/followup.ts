// „Nachfassen senden" (Chat > 24 h still → nur freigegebene Vorlage möglich):
// wählt die zur Situation passende Vorlage bzw. blockiert, wenn Nachfassen
// keinen Sinn ergibt. Wird für die Vorschau im Chat UND serverseitig beim
// Senden genutzt (der Client kann den Zweck nicht selbst wählen).

import { prisma } from "@/lib/prisma";
import { displayProduct } from "@/lib/products";
import {
  firstNameOf,
  renderTemplate,
  SUGGESTED_TEMPLATE_TEXT,
  type NoticePurpose,
} from "@/lib/whatsapp/templates";

export type FollowupChoice =
  | { kind: "blocked"; reason: string }
  | {
      kind: "ok";
      purpose: NoticePurpose;
      label: string;
      params: string[];
      preview: string;
      /** Gibt es eine freigegebene Vorlage? Sonst kann nicht gesendet werden. */
      approved: boolean;
    };

const DONE = new Set(["abschluss", "kein interesse", "disqualifiziert"]);

function interestFrom(formData: unknown, source: string | null): string {
  if (Array.isArray(formData)) {
    const hit = (formData as { label?: string; value?: string }[]).find(
      (a) => a?.label === "Versicherungsinteresse" && typeof a.value === "string",
    );
    if (hit?.value) return hit.value;
  }
  return source ? displayProduct(source) : "deiner Anfrage";
}

export async function chooseFollowup(conversationId: string): Promise<FollowupChoice> {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      customerId: true,
      contactName: true,
      leadId: true,
      customer: { select: { name: true } },
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

  const first = firstNameOf(conv.contactName);
  let purpose: NoticePurpose = "followup";
  let params = [first];
  if (appts[0]?.status === "no_show") {
    purpose = "followup_noshow";
  } else if (status === "angebot gesendet") {
    purpose = "followup_offer";
    params = [first, interestFrom(conv.lead?.formData, conv.lead?.source ?? null)];
  }

  const tpl = await prisma.messageTemplate.findFirst({
    where: { customerId: conv.customerId, purpose, status: "approved" },
    orderBy: { updatedAt: "desc" },
    select: { body: true },
  });
  const advisor = (conv.customer.name ?? "").replace(/^Allianz\s+/i, "");
  const body = tpl?.body ?? SUGGESTED_TEMPLATE_TEXT[purpose].replace("[Berater]", advisor);
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
    preview: renderTemplate(body, params),
    approved: !!tpl,
  };
}
