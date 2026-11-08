// Nutzungsmessung (serverseitig). Pseudonym: nur Kunde/Nutzer-ID, Seite,
// Aktionsname – keine Lead-Namen, Telefonnummern oder Nachrichteninhalte.
// Fehler beim Schreiben dürfen nie eine Nutzeraktion scheitern lassen.

import { getCurrentSession } from "@/lib/auth";
import { getBuyerContext } from "@/lib/buyer-context";
import { prisma } from "@/lib/prisma";

export type UsageType = "page" | "action" | "error" | "feedback";

export async function recordUsage(
  type: UsageType,
  name: string,
  opts: { path?: string | null; meta?: Record<string, unknown> } = {},
): Promise<void> {
  try {
    const ctx = await getBuyerContext();
    if (!ctx) return;
    const session = await getCurrentSession();
    await prisma.usageEvent.create({
      data: {
        customerId: ctx.customerId,
        userId: session?.userId ?? null,
        preview: ctx.preview,
        type,
        name: name.slice(0, 120),
        path: opts.path?.slice(0, 200) ?? null,
        meta: (opts.meta ?? undefined) as never,
      },
    });
  } catch (e) {
    console.error("[usage]", e instanceof Error ? e.message : e);
  }
}

/** Alte Nutzungsdaten löschen (Datensparsamkeit). */
export async function pruneUsage(days = 180): Promise<number> {
  const r = await prisma.usageEvent.deleteMany({
    where: { at: { lt: new Date(Date.now() - days * 24 * 60 * 60 * 1000) } },
  });
  return r.count;
}
