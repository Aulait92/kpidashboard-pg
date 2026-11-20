// Diagnose (Ole, 20.11.2026: „Pay-per-Lead-Ausgaben stimmen nicht mit dem Werbekonto überein“):
// Meta-Kosten der letzten Tage, wie sie in der Auswertung landen, je Tag, Konto und Kampagne; dazu die Kampagnen
// ohne Produktzuordnung (fallen raus), die als Kundenkonto übersprungenen Konten und die Akquise-Stichworte.
import { prisma } from "@/lib/prisma";
import { loadKpiSettings } from "@/lib/zahlen";

export async function pplKostenDiagnose(p: URLSearchParams) {
  const tage = Math.min(31, Math.max(1, Math.round(Number(p.get("tage") ?? 7)) || 7));
  const since = new Date(Date.now() - tage * 86_400_000);
  const [costs, unmatched, owned, settings] = await Promise.all([
    prisma.cost.findMany({ where: { kind: "LEAD", occurredAt: { gte: since } }, select: { occurredAt: true, product: true, amount: true, note: true }, orderBy: { occurredAt: "asc" } }),
    prisma.unmatchedCampaign.findMany({ where: { channel: "Meta" }, select: { campaign: true, spend: true, syncedAt: true } }),
    prisma.customer.findMany({ where: { metaAdAccountId: { not: null } }, select: { name: true, metaAdAccountId: true } }),
    loadKpiSettings(),
  ]);
  const acq = settings.acquisitionCampaigns.map((c) => c.toLowerCase());
  const tag: Record<string, Record<string, number>> = {};
  for (const c of costs) {
    const day = c.occurredAt.toISOString().slice(0, 10);
    const m = /^Meta:\s+(.+?)\s+\(\d{4}-\d{2}-\d{2}\)\s+\[act_(\d+)\]/.exec(c.note ?? "");
    const akquise = acq.some((a) => (c.note ?? "").toLowerCase().includes(a));
    const key = `${m ? `act_${m[2]} · ${m[1]}` : c.note ?? "?"} → ${c.product ?? "-"}${akquise ? " (Akquise, nicht in PPL)" : ""}`;
    (tag[day] ??= {})[key] = Math.round(((tag[day][key] ?? 0) + Number(c.amount)) * 100) / 100;
  }
  const konten = (process.env.META_AD_ACCOUNT_IDS ?? "").split(",").map((s) => s.trim().replace(/^act_/, "")).filter(Boolean);
  return {
    tage,
    konten: konten.map((k) => `act_${k}`),
    kundenkontenUebersprungen: owned.filter((o) => konten.includes(o.metaAdAccountId!.replace(/^act_/, ""))).map((o) => `${o.name}: act_${o.metaAdAccountId!.replace(/^act_/, "")}`),
    akquiseStichworte: settings.acquisitionCampaigns,
    ohneProdukt: unmatched.map((u) => ({ kampagne: u.campaign, ausgaben: Number(u.spend), stand: u.syncedAt })),
    jeTag: tag,
  };
}
