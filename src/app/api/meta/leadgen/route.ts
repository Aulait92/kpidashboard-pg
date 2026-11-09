import { fetchMetaLead, verifyMetaSignature } from "@/lib/meta-leads";
import { fromMetaLead, ingestLead } from "@/lib/lead-intake";
import { reportError } from "@/lib/monitoring";

// Meta-Webhook „leadgen“ (Seiten-Abo der Meta-App).
// GET  = Bestätigung beim Einrichten (hub.challenge zurückgeben)
// POST = neuer Lead → per Graph API abrufen → in die App übernehmen
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const expected = process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (
    expected &&
    url.searchParams.get("hub.mode") === "subscribe" &&
    url.searchParams.get("hub.verify_token") === expected
  ) {
    return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("forbidden", { status: 403 });
}

type LeadgenChange = { field?: string; value?: { leadgen_id?: string; page_id?: string; form_id?: string } };

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyMetaSignature(raw, req.headers.get("x-hub-signature-256"))) {
    return Response.json({ error: "invalid signature" }, { status: 401 });
  }
  let body: { object?: string; entry?: { id?: string; changes?: LeadgenChange[] }[] };
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  let failed = 0;
  const results: string[] = [];
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "leadgen" || !change.value?.leadgen_id) continue;
      try {
        const lead = await fetchMetaLead(change.value.leadgen_id);
        if (!lead.form_id && change.value.form_id) lead.form_id = change.value.form_id;
        const res = await ingestLead(fromMetaLead(lead, change.value.page_id ?? entry.id ?? null), "meta");
        results.push(res.status);
      } catch (err) {
        failed++;
        reportError(err, "meta-leadgen", { leadgen: change.value.leadgen_id });
      }
    }
  }
  // Fehler → 500, damit Meta erneut zustellt (Dubletten fängt die Lead-ID ab).
  return Response.json({ ok: failed === 0, results }, { status: failed ? 500 : 200 });
}
