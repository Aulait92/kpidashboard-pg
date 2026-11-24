// Gewünschten Umfang der Tierkrankenversicherung am Lead speichern (lib/tkv-umfang.ts). Fehler nur ins Log: die
// Angabe steht ohnehin in angaben.tarifwunsch.

import { prisma } from "@/lib/prisma";
import type { TkvUmfang } from "@/lib/tkv-umfang";

export async function tkvUmfangMerken(leadId: string | null | undefined, umfang: TkvUmfang | null): Promise<void> {
  if (!leadId || !umfang) return;
  await prisma.lead.update({ where: { id: leadId }, data: { tkvUmfang: umfang } }).catch((e) => console.error("[tkv-umfang]", e instanceof Error ? e.message : e));
}
