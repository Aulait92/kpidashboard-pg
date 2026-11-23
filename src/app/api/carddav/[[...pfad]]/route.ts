// CardDAV-Adressbuch „Vertrieb performancegrowth“ fürs iPhone (nur lesend, lib/carddav/dav.ts).
// PROPFIND und REPORT kommen über die Middleware als POST mit Kopf `x-carddav-methode` an (lib/carddav/tunnel.ts),
// GET, HEAD, OPTIONS, PUT, DELETE direkt. Ein POST ohne diesen Kopf ist ein Schreibversuch (403).

import { carddavAntwort } from "@/lib/carddav/dav";
import { ladeAdressbuch } from "@/lib/carddav/server";
import { METHODE_HEADER } from "@/lib/carddav/tunnel";

export const dynamic = "force-dynamic";

const MAX_BODY = 2 * 1024 * 1024;

async function handle(req: Request): Promise<Response> {
  const tunnel = req.method === "POST" ? req.headers.get(METHODE_HEADER)?.trim().toUpperCase() : undefined;
  const method = tunnel && /^[A-Z][A-Z-]{1,19}$/.test(tunnel) ? tunnel : req.method;
  const laenge = Number(req.headers.get("content-length") ?? 0);
  if (laenge > MAX_BODY) return new Response("Anfrage zu groß", { status: 413 });
  const body = req.method === "GET" || req.method === "HEAD" ? "" : await req.text();
  if (body.length > MAX_BODY) return new Response("Anfrage zu groß", { status: 413 });
  const a = await carddavAntwort({ method, pfad: new URL(req.url).pathname, headers: req.headers, body }, { laden: () => ladeAdressbuch() });
  const leer = method === "HEAD" || a.status === 304 || req.method === "HEAD";
  return new Response(leer ? null : a.body, { status: a.status, headers: a.headers });
}

export const GET = handle;
export const HEAD = handle;
export const OPTIONS = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
