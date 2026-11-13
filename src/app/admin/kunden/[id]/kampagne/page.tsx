import { connection } from "next/server";
import { Card, CardHeader } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { campaignProducts, loadCampaignContext } from "@/lib/kampagnen/context";
import { getRunView } from "@/lib/kampagnen/run";
import { STEPS } from "@/lib/kampagnen/types";
import { KampagnenAgenten } from "./kampagne-client";

const fmt = (d: Date) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d);

const STATUS: Record<string, string> = {
  queued: "wartet",
  running: "läuft",
  review: "wartet auf Freigabe",
  building: "wird angelegt",
  built: "angelegt (pausiert)",
  blocked: "Prüfung rot",
  failed: "Fehler",
  cancelled: "aufgeräumt",
};

// Reiter „Kampagne (KI)“: KI-Agenten-Team erstellt eine komplette Meta-Lead-
// Kampagne und legt sie pausiert an. Veröffentlicht wird von Hand.
export default async function KundenKampagne({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const [products, runs] = await Promise.all([
    campaignProducts(id),
    prisma.campaignRun.findMany({ where: { customerId: id }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, product: true, status: true, createdAt: true, costCents: true, kind: true, trigger: true } }),
  ]);
  const defaults = products[0] ? await loadCampaignContext(id, products[0].product).catch(() => null) : null;
  const latest = runs[0] ? await getRunView(runs[0].id) : null;

  return (
    <div className="mt-5 grid gap-5 xl:grid-cols-[3fr_1fr]">
      <KampagnenAgenten
        customerId={id}
        products={products}
        defaults={{ pageId: defaults?.pageId ?? "", privacyUrl: defaults?.privacyUrl ?? "", adAccountId: defaults?.adAccountId ?? null, place: [defaults?.zip, defaults?.city].filter(Boolean).join(" ") || defaults?.region || null }}
        initialRun={latest}
        steps={STEPS.map((s) => ({ key: s.key, label: s.label, doing: s.doing }))}
      />
      <Card>
        <CardHeader title="Verlauf" count={runs.length} />
        <ul className="divide-y divide-[color:var(--border)] px-5 pb-4 text-sm">
          {runs.map((r) => (
            <li key={r.id} className="py-2">
              <div className="font-medium">
                {r.product}
                {r.kind === "auffrischung" ? " · Auffrischung" : r.trigger === "produkt" ? " · automatisch" : ""}
              </div>
              <div className="text-[color:var(--muted)]">
                {fmt(r.createdAt)} · {STATUS[r.status] ?? r.status} · KI ≈ ${(r.costCents / 100).toFixed(2)}
              </div>
            </li>
          ))}
          {!runs.length ? <li className="py-2 text-[color:var(--muted)]">Noch keine Läufe.</li> : null}
        </ul>
      </Card>
    </div>
  );
}
