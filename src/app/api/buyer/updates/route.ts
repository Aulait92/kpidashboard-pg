import { getBuyerContext } from "@/lib/buyer-context";
import { loadFingerprint } from "@/lib/live";

// Live-Aktualisierung im Kundenbereich.
//   Accept: text/event-stream → Server-Sent Events: prüft alle 2 s, sendet nur bei
//                               Änderung, Lebenszeichen alle 25 s, endet nach ~5 Min.
//                               (EventSource verbindet sich selbst neu).
//   sonst                    → JSON { v } für den Abfrage-Fallback.
export const dynamic = "force-dynamic";

const CHECK_MS = 2_000;
const HEARTBEAT_MS = 25_000;
const MAX_MS = 5 * 60_000;

export async function GET(req: Request): Promise<Response> {
  const ctx = await getBuyerContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const team = { customerId: ctx.customerId, userId: ctx.userId, teamRole: ctx.teamRole };

  if (!(req.headers.get("accept") ?? "").includes("text/event-stream")) {
    const v = await loadFingerprint(team);
    return Response.json({ v }, { headers: { "Cache-Control": "no-store" } });
  }

  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const started = Date.now();
      let last: string | null = null;
      let lastSent = Date.now();
      let busy = false;

      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
          lastSent = Date.now();
        } catch {
          stop();
        }
      };
      const stop = () => {
        if (closed) return;
        closed = true;
        if (timer) clearInterval(timer);
        try {
          controller.close();
        } catch {
          /* schon zu */
        }
      };
      const check = async () => {
        if (closed || busy) return;
        busy = true;
        try {
          const v = await loadFingerprint(team);
          if (v !== last) {
            last = v;
            send(`data: ${v}\n\n`);
          } else if (Date.now() - lastSent >= HEARTBEAT_MS) {
            send(`: ping\n\n`);
          }
        } catch {
          // DB kurz weg: still weitermachen, der Client lädt notfalls über das Sicherheits-Intervall.
        } finally {
          busy = false;
        }
        if (Date.now() - started >= MAX_MS) stop();
      };

      // Wiederverbindung nach 2 s; Puffer-Füllung für Proxys, die erst ab einigen Bytes weiterleiten.
      send(`retry: 2000\n: ${" ".repeat(2048)}\n\n`);
      await check();
      timer = setInterval(() => void check(), CHECK_MS);
      req.signal.addEventListener("abort", stop);
    },
    cancel() {
      closed = true;
      if (timer) clearInterval(timer);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
