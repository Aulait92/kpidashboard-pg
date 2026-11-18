// Stufe eines Vertriebskontakts setzen (gemeinsam für „Stufe ändern“ in der Akte und „Angebot ablehnen → Kontakt auch
// als verloren markieren“): Verlustgrund nur bei Verloren, Verlaufseintrag bei Wechsel, Herkunft bei Gewonnen,
// Später-Follow-up endet bei Termin/Gewonnen/Verloren/Ungültig.

import { prisma } from "@/lib/prisma";
import type { SalesLossReason as LossReason, SalesStage as Stage } from "@/generated/prisma/enums";
import { STAGE_LABEL } from "@/lib/vertrieb/crm";
import { ensureSource } from "@/lib/vertrieb/source";
import { stopFollowupOnStage } from "@/lib/vertrieb/followup";

/** competitor: undefined = unverändert, null = leeren. Gibt die Stufe davor zurück. */
export async function setzeStufe(contactId: string, stage: Stage, opts: { lossReason?: LossReason | null; competitor?: string | null } = {}): Promise<Stage> {
  const before = await prisma.salesContact.findUniqueOrThrow({ where: { id: contactId }, select: { stage: true, customerStage: true } });
  await prisma.salesContact.update({
    where: { id: contactId },
    data: {
      stage,
      lossReason: stage === "VERLOREN" ? (opts.lossReason ?? "SONSTIGES") : null,
      competitor: opts.competitor,
      customerStage: stage === "GEWONNEN" && !before.customerStage ? "VERTRAG" : undefined,
    },
  });
  if (before.stage !== stage) {
    await prisma.salesActivity.create({
      data: { contactId, type: "STATUS", outcome: `${STAGE_LABEL[before.stage]} → ${STAGE_LABEL[stage]}` },
    });
  }
  if (stage === "GEWONNEN") await ensureSource(contactId);
  await stopFollowupOnStage(contactId, stage);
  return before.stage;
}
