import { ingestPoolLead } from "@/lib/ppl/engine";
import { prisma } from "@/lib/prisma";
import { isPerspectivePayload, translatePerspective } from "@/lib/ppl/perspective";
import { reportError } from "@/lib/monitoring";

// Pay-per-Lead-Eingang (eigene Funnels, z. B. Perspective „PKV-Tarifoptimierung“):
// POST https://<domain>/api/leads/pool?token=<LEAD_WEBHOOK_TOKEN>&produkt=<Produkt>
// Body: flaches JSON (Formularfelder) oder Liste davon. Optional: id/lead_id
// (gegen Doppel-Eingang), sms_verifiziert=true, score.
// Prüft Dubletten (Telefon oder E-Mail, 30 Tage) und verteilt an die Bezüge.
export const dynamic = "force-dynamic";

const META = new Set(["id", "lead_id", "leadgen_id", "produkt", "product", "sms_verifiziert", "sms_verified", "score", "token"]);

export async function POST(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? req.headers.get("x-webhook-token");
  if (!process.env.LEAD_WEBHOOK_TOKEN || token !== process.env.LEAD_WEBHOOK_TOKEN) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const type = req.headers.get("content-type") ?? "";
  let body: unknown;
  try {
    body = type.includes("form") ? Object.fromEntries((await req.formData()).entries()) : await req.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const items = (Array.isArray(body) ? body : [body]).filter((x): x is Record<string, unknown> => !!x && typeof x === "object");
  const results = [];
  for (const item of items) {
    const rawProduct = String(url.searchParams.get("produkt") ?? item.produkt ?? item.product ?? "").trim();
    if (!rawProduct) return Response.json({ error: "produkt fehlt" }, { status: 400 });
    // Produkt per Name oder Slug (z. B. „pkv-tarifoptimierung“ wie im bisherigen Funnel)
    const known = await prisma.product.findFirst({
      where: { OR: [{ name: { equals: rawProduct, mode: "insensitive" } }, { slug: { equals: rawProduct, mode: "insensitive" } }] },
      select: { name: true },
    });
    const productKey = known?.name ?? rawProduct;
    const slug = (await prisma.product.findFirst({ where: { name: productKey }, select: { slug: true } }))?.slug ?? rawProduct;
    let fields: Record<string, string> = {};
    let externalId: string | null = null;
    if (isPerspectivePayload(item)) {
      ({ fields, externalId } = translatePerspective(item, slug));
    } else {
      for (const [k, v] of Object.entries(item)) {
        if (META.has(k.toLowerCase()) || v == null || typeof v === "object") continue;
        const s = String(v).trim();
        if (s) fields[k] = s;
      }
    }
    const sms = String(item.sms_verifiziert ?? item.sms_verified ?? "").toLowerCase();
    try {
      const r = await ingestPoolLead({
        externalId: externalId ?? (String(item.id ?? item.lead_id ?? item.leadgen_id ?? "") || null),
        productKey,
        via: url.searchParams.get("quelle") ?? "webhook",
        fields,
        smsVerified: sms === "true" || sms === "1" || sms === "ja" || sms === "sms",
        score: item.score != null && item.score !== "" ? Number(item.score) : null,
      });
      results.push({ status: r.status, reason: r.reason });
    } catch (err) {
      reportError(err, "ppl-webhook", { product: productKey });
      return Response.json({ error: "Lead konnte nicht gespeichert werden." }, { status: 500 });
    }
  }
  return Response.json({ ok: true, results });
}
