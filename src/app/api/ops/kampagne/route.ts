import { after } from "next/server";
import { audit } from "@/lib/audit";
import { checkLimit } from "@/lib/rate-limit";
import { uploadAuthorized } from "@/lib/ops-upload";
import { aktionAuthorized } from "@/lib/ops-aktionen";
import { prisma } from "@/lib/prisma";
import { buildCampaignRun, processCampaignRun, startCampaignRun } from "@/lib/kampagnen/run";
import { ACTIVE_STATUSES } from "@/lib/kampagnen/types";
import { findCustomer, katalogAliase, produktZeilen, resolveProduct, runOverview } from "@/lib/kampagnen/ops";

// Kampagnen-Assistent ohne Admin-Login (Ole, 21.11.2026): Claude startet Läufe und sieht ihren Stand.
// Schlüssel wie /api/ops/unterlagen (OPS_UPLOAD_TOKEN) oder der Aktions-Schlüssel (OPS_ACTION_TOKEN), im Header
// X-Ops-Token bzw. Bearer. Ohne gesetzten Schlüssel ist die Route aus. Alles wird bei Meta PAUSED angelegt.
//   GET  /api/ops/kampagne?kunde=<id|Name>      → Produkte (Budget-Zeilen) und Läufe (Status, Schritte, Fehler, Meta-IDs, Links)
//   POST /api/ops/kampagne  { kunde, produkt, wunsch?, autoBuild? (Standard true), budget? }  (auch als Query)
//        → { ok, runId } | { ok:false, problems } ; läuft schon ein Lauf: 409 { error: "läuft schon", runId } (später erneut)
export const dynamic = "force-dynamic";

const authorized = (req: Request) => uploadAuthorized(req) || aktionAuthorized(req);
const noStore = { "Cache-Control": "no-store" };

export async function GET(req: Request): Promise<Response> {
  if (!authorized(req)) return Response.json({ error: "Nicht erlaubt." }, { status: 403 });
  const c = await findCustomer(new URL(req.url).searchParams.get("kunde") ?? "");
  if (!c.ok) return Response.json({ error: c.error }, { status: 404, headers: noStore });
  const [produkte, laeufe] = await Promise.all([produktZeilen(c.id), runOverview(c.id)]);
  return Response.json({ kunde: { id: c.id, name: c.name }, produkte, laeufe }, { headers: noStore });
}

async function aktiverLauf(customerId: string) {
  const r = await prisma.campaignRun.findFirst({ where: { customerId, status: { in: ACTIVE_STATUSES } }, select: { id: true, product: true, status: true }, orderBy: { createdAt: "desc" } });
  return r ? { runId: r.id, product: r.product, status: r.status } : null;
}

const bool = (v: unknown, fallback: boolean) => (v === undefined || v === null || v === "" ? fallback : !(v === false || /^(false|0|nein|no|off)$/i.test(String(v))));

export async function POST(req: Request): Promise<Response> {
  if (!authorized(req)) return Response.json({ error: "Nicht erlaubt." }, { status: 403 });
  const q = new URL(req.url).searchParams;
  const body = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const get = (k: string) => body[k] ?? q.get(k) ?? undefined;

  const c = await findCustomer(String(get("kunde") ?? ""));
  if (!c.ok) return Response.json({ error: c.error }, { status: 404, headers: noStore });
  // Neues Formular statt eines bestehenden zuordnen (Ole, 21.11.2026: Formular korrigiert, Meta-Formulare sind nicht
  // änderbar): { kunde, formId, ersetzt: <altes formId>, produkt? } übernimmt Produkt, Fragen-Beschriftungen und
  // Einwilligungsnachweis vom alten Formular, legt die Zuordnung an und schaltet das alte ab.
  const neuForm = get("formId");
  const altForm = get("ersetzt");
  if (neuForm && altForm) {
    const alt = await prisma.leadSource.findFirst({ where: { formId: String(altForm), customerId: c.id } });
    if (!alt) return Response.json({ error: "Altes Formular gehört nicht zu diesem Kunden." }, { status: 404, headers: noStore });
    const productKey = String(get("produkt") ?? "").trim() || alt.productKey;
    const labels = get("labels");
    const neu = await prisma.leadSource.upsert({
      where: { formId: String(neuForm) },
      create: {
        formId: String(neuForm),
        pageId: alt.pageId,
        formName: String(get("formName") ?? alt.formName ?? ""),
        customerId: c.id,
        productKey,
        questionLabels: (labels as object) ?? alt.questionLabels ?? undefined,
        consentText: String(get("consentText") ?? alt.consentText ?? "") || null,
        consentVersion: alt.consentVersion,
      },
      update: { customerId: c.id, productKey, active: true },
    });
    await prisma.leadSource.update({ where: { id: alt.id }, data: { active: false } });
    await audit("leadsource.ersetzt", { entity: "LeadSource", entityId: neu.formId, customerId: c.id, details: { ersetzt: alt.formId, productKey } }).catch(() => undefined);
    return Response.json({ ok: true, formId: neu.formId, productKey, ersetzt: alt.formId }, { headers: noStore });
  }
  // Fortsetzen (Ole, 21.11.2026): gescheiterten Lauf an der Fehlerstelle neu anlegen lassen (z. B. nach dem Eintrag von
  // Begünstigtem und Zahler im Werbekonto), Texte, Bilder und Formular bleiben. { kunde, weiter: <runId> }
  const weiter = get("weiter");
  if (weiter) {
    const run = await prisma.campaignRun.findFirst({ where: { id: String(weiter), customerId: c.id }, select: { id: true, status: true } });
    if (!run) return Response.json({ error: "Lauf nicht gefunden." }, { status: 404, headers: noStore });
    if (!["failed", "review"].includes(run.status)) return Response.json({ error: `Lauf hat Status ${run.status}.` }, { status: 409, headers: noStore });
    await audit("kampagne.weiter", { entity: "CampaignRun", entityId: run.id, customerId: c.id, details: { via: "ops" } }).catch(() => undefined);
    after(() => buildCampaignRun(run.id).then(() => undefined));
    return Response.json({ ok: true, runId: run.id, weiter: true }, { headers: noStore });
  }
  // Warteschlange: ein aktiver Lauf je Kunde, nichts abbrechen; der Aufrufer fragt später erneut (zählt nicht ins Limit)
  const laeuft = await aktiverLauf(c.id);
  if (laeuft) return Response.json({ ok: false, error: "läuft schon", ...laeuft }, { status: 409, headers: noStore });
  if (!checkLimit("opsKampagne", "ops").ok) return Response.json({ error: "Zu viele Starts, bitte später." }, { status: 429 });
  const eingabe = String(get("produkt") ?? "");
  const zeilen = await produktZeilen(c.id);
  const p = resolveProduct(eingabe, zeilen, await katalogAliase(eingabe));
  if (!p.ok) return Response.json({ error: p.error, produkte: zeilen }, { status: 400, headers: noStore });
  const budgetRaw = get("budget");
  const budget = budgetRaw === undefined ? null : Number(String(budgetRaw).replace(",", "."));
  if (budget !== null && !(Number.isFinite(budget) && budget > 0 && budget <= 1000)) {
    return Response.json({ error: "budget: Tagesbudget in Euro (größer 0, höchstens 1000)." }, { status: 400, headers: noStore });
  }
  const wunsch = get("wunsch");

  const r = await startCampaignRun({
    customerId: c.id,
    product: p.product,
    wish: wunsch ? String(wunsch).slice(0, 500) : null,
    autoBuild: bool(get("autoBuild"), true),
    dailyBudgetEur: budget,
    createdBy: "ops",
    trigger: "manuell",
  });
  if (!r.ok) {
    if (r.problems.some((x) => x.key === "running")) {
      return Response.json({ ok: false, error: "läuft schon", ...((await aktiverLauf(c.id)) ?? {}) }, { status: 409, headers: noStore });
    }
    return Response.json({ ok: false, product: p.product, problems: r.problems }, { status: 422, headers: noStore });
  }
  after(() => processCampaignRun(r.runId).then(() => undefined));
  await audit("kampagne.ops-start", { entity: "CampaignRun", entityId: r.runId, customerId: c.id, details: { product: p.product, via: "ops" }, actor: { role: "system", email: "ops" } }).catch(() => undefined);
  return Response.json({ ok: true, runId: r.runId, kunde: c.name, product: p.product, produktBekannt: p.matched }, { headers: noStore });
}
