"use server";

// Rückmeldung mit einem Tipp in der Leadliste (Pay-per-Lead, Ole 25.11.2026): Erreicht, Nicht erreicht (Wiedervorlage am
// nächsten Werktag 9 Uhr), Termin vereinbart. Gleiche Speicherung wie der Link in der Liefer-E-Mail
// (lib/ppl/rueckmeldung-server.ts), dazu ein Schnappschuss für „Rückgängig“ (undoInboxAction).

import { revalidatePath } from "next/cache";
import { getBuyerContext } from "@/lib/buyer-context";
import { writableCustomerId } from "@/lib/buyer-write";
import { prisma } from "@/lib/prisma";
import { recordUsage } from "@/lib/usage";
import { istRueckmeldungArt, RUECKMELDUNG_LABEL, wiedervorlageText } from "@/lib/ppl/rueckmeldung";
import { setzeRueckmeldung } from "@/lib/ppl/rueckmeldung-server";
import type { InboxResult } from "./inbox-actions";

export async function pplRueckmeldungResult(leadId: string, art: string): Promise<InboxResult & { text?: string }> {
  if (!istRueckmeldungArt(art)) return { ok: false, error: "Unbekannte Rückmeldung." };
  const customerId = await writableCustomerId(leadId);
  if (!customerId) return { ok: false, error: "In der Vorschau nur mit Demo-Leads möglich." };
  const l = await prisma.lead.findFirst({
    where: { id: leadId, customerId },
    select: {
      status: true,
      contactAttempts: true,
      callbackSnoozedUntil: true,
      reached: true,
      closedAt: true,
      closeValue: true,
      followUpAt: true,
      followUpNote: true,
      callAttempts: true,
      lastCallAttemptAt: true,
      firstContactAt: true,
      kaeuferRueckmeldung: true,
      kaeuferRueckmeldungAt: true,
      kaeuferRueckmeldungQuelle: true,
    },
  });
  if (!l) return { ok: false, error: "Lead nicht gefunden." };
  const ctx = await getBuyerContext();
  const r = await setzeRueckmeldung({ leadId, customerId, art, quelle: "app", userId: ctx?.userId ?? null });
  if (!r.ok) return r;
  // Erstkontakt bleibt beim Rückgängig stehen (wie bei den übrigen Aktionen auf „Heute“)
  await recordUsage("action", `ppl.rueckmeldung.${art}`);
  revalidatePath("/buyer");
  revalidatePath("/buyer/leads");
  revalidatePath("/buyer/kontakte", "layout");
  revalidatePath("/buyer/zahlen");
  return {
    ok: true,
    text: `${RUECKMELDUNG_LABEL[art]}${r.wiedervorlageAt ? `, Wiedervorlage ${wiedervorlageText(r.wiedervorlageAt)}` : ""}`,
    undo: {
      kind: "lead",
      leadId,
      prev: {
        status: l.status,
        contactAttempts: l.contactAttempts,
        callbackSnoozedUntil: l.callbackSnoozedUntil?.toISOString() ?? null,
        reached: l.reached,
        closedAt: l.closedAt?.toISOString() ?? null,
        closeValue: l.closeValue == null ? null : Number(l.closeValue),
        followUpAt: l.followUpAt?.toISOString() ?? null,
        followUpNote: l.followUpNote,
        callAttempts: l.callAttempts,
        lastCallAttemptAt: l.lastCallAttemptAt?.toISOString() ?? null,
        rueckmeldung: { art: l.kaeuferRueckmeldung, at: l.kaeuferRueckmeldungAt?.toISOString() ?? null, quelle: l.kaeuferRueckmeldungQuelle },
      },
    },
  };
}
