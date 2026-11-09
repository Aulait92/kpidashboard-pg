import { handleLinkedInMessage } from "@/lib/vertrieb/linkedin-inbound";

// Eingehende LinkedIn-Nachrichten, z.B. über Zapier: Gmail "New Email Matching Search"
// (from:linkedin.com Nachricht) → Webhooks by Zapier POST an:
// https://<deine-domain>/api/vertrieb/linkedin/message?token=<WEBHOOK_TOKEN>
// Felder: subject, from_name, body_plain (oder: name, profile_url, message)
export async function POST(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? req.headers.get("x-webhook-token");
  if (!process.env.VERTRIEB_WEBHOOK_TOKEN || token !== process.env.VERTRIEB_WEBHOOK_TOKEN) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const type = req.headers.get("content-type") ?? "";
  let body: unknown;
  try {
    body = type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data")
      ? Object.fromEntries((await req.formData()).entries())
      : await req.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  return Response.json(await handleLinkedInMessage(body));
}
