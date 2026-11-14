import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { planAccount, runOptimizationCron, syncOptimizationAccounts } from "@/lib/optimierung/server";
import { prisma } from "@/lib/prisma";

// Optimierung je Werbekonto von außen (SYNC_TOKEN, wie /api/media-buyer):
//   ?dryRun=1&konto=<OptimizationAccount.id | Kunden-ID | act_…>  Trockenlauf eines Kontos:
//        nur lesende Meta-Aufrufe, nichts gespeichert, nichts bei Meta geändert.
//   ?dryRun=1                                                    Trockenlauf aller aktiven Konten.
//   ohne dryRun                                                  wie der Cron (ausführen, planen, Frühwarnung).
// Der zentrale Cron (/api/whatsapp/cron) ruft runOptimizationCron ohnehin alle 5 Minuten auf.
export const dynamic = "force-dynamic";

const LABEL = "optimierung";

async function resolveAccount(ref: string): Promise<string | null> {
  const id = ref.replace(/^act_/, "");
  const a = await prisma.optimizationAccount.findFirst({ where: { OR: [{ id: ref }, { customerId: ref }, { adAccountId: id }] }, select: { id: true } });
  return a?.id ?? null;
}

async function handle(req: Request) {
  if (!isCronAuthorized(req, process.env.SYNC_TOKEN, { label: LABEL })) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const konto = url.searchParams.get("konto");
  try {
    if (!dryRun) {
      if (konto) return NextResponse.json({ ok: false, error: "Einzelnes Konto nur mit dryRun=1 (Planen im Admin: „Lauf jetzt“)." }, { status: 400 });
      return NextResponse.json({ ok: true, ...(await runOptimizationCron()) });
    }
    await syncOptimizationAccounts();
    const ids = konto ? [await resolveAccount(konto)].filter((x): x is string => !!x) : (await prisma.optimizationAccount.findMany({ where: { active: true }, select: { id: true } })).map((a) => a.id);
    if (konto && !ids.length) return NextResponse.json({ ok: false, error: "Konto nicht gefunden." }, { status: 404 });
    const plans = [];
    for (const id of ids) plans.push(await planAccount(id, { dryRun: true }));
    return NextResponse.json({ ok: true, dryRun: true, plans });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
