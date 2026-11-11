import { parseCspReport } from "@/lib/csp-report";
import { checkLimit, clientIp } from "@/lib/rate-limit";
import { CSP_REPORT_PATH } from "@/lib/security-headers";

// Empfängt CSP-Verstöße (Content-Security-Policy-Report-Only, siehe
// src/lib/security-headers.ts). Nur zählen und gedrosselt loggen – nichts
// speichern (Berichte können URLs mit Tokens enthalten → nur Herkunft + Pfad).
export const dynamic = "force-dynamic";

const counts = new Map<string, number>();
let lastFlush = Date.now();
const FLUSH_MS = 10 * 60_000;

export async function POST(req: Request): Promise<Response> {
  if (!checkLimit("cspReport", clientIp(req.headers)).ok) return new Response(null, { status: 429 });
  const text = (await req.text().catch(() => "")).slice(0, 20_000);
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    return new Response(null, { status: 204 });
  }
  for (const v of parseCspReport(body)) {
    const key = `${v.directive} ${v.blocked} ${v.page}`;
    const n = (counts.get(key) ?? 0) + 1;
    counts.set(key, n);
    // Erster Fund sofort, danach gesammelt alle 10 Minuten
    if (n === 1) console.warn(`[csp] Verstoß: ${key}`);
  }
  if (Date.now() - lastFlush > FLUSH_MS && counts.size) {
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    console.warn(`[csp] ${CSP_REPORT_PATH} letzte 10 Min: ${top.map(([k, n]) => `${n}× ${k}`).join(" | ")}`);
    counts.clear();
    lastFlush = Date.now();
  }
  return new Response(null, { status: 204 });
}
