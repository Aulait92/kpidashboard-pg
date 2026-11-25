// „Nicht zugestellt, erneut gesendet“ im Chatverlauf (Ole, 25.11.2026, Fall Rasema Zukanovic 24.11.: Erstinformation
// 18:43 „nicht zugestellt“, 18:45 noch einmal). Kam eine Nachricht nicht an (Status „failed“) und ging dieselbe Nachricht
// danach noch einmal raus (Erstinformation als PDF bzw. im Kopf des Erstanschreibens, oder derselbe Zweck, z. B. das
// Erstanschreiben nach „Hat doch WhatsApp“), zeigt der Verlauf die fehlgeschlagene als „nicht zugestellt, erneut gesendet“.
// Rein, getestet (tests/unit/chat-zustellung.test.ts).

import { ERSTINFO_KOPF } from "@/lib/whatsapp/ki-hinweis";

export type ZustellNachricht = { id: string; direction: string; kind: string | null; body: string | null; status: string | null; purpose?: string | null; createdAt: Date };

/** Ist das die Erstinformation als PDF (eigenes Dokument oder im Kopf des Erstanschreibens)? */
export function istErstinfoNachricht(m: Pick<ZustellNachricht, "direction" | "kind" | "body">): boolean {
  if (m.direction !== "outbound") return false;
  return (m.kind === "document" && /Erstinformation/.test(m.body ?? "")) || (m.kind === "template" && (m.body ?? "").startsWith(ERSTINFO_KOPF));
}

/** Schlüssel, unter denen zwei Nachrichten „dieselbe“ sind. */
function schluessel(m: ZustellNachricht): string[] {
  const out: string[] = [];
  if (istErstinfoNachricht(m)) out.push("erstinfo");
  // Erstanschreiben (outreach, outreach_kfz …) zählen zusammen, sonst gleicher Zweck
  if (m.purpose) out.push(m.purpose.startsWith("outreach") ? "outreach" : `zweck:${m.purpose}`);
  return out;
}

/** IDs der nicht zugestellten Nachrichten, die danach erneut (nicht fehlgeschlagen) gesendet wurden. */
export function erneutGesendet(messages: ZustellNachricht[]): Set<string> {
  const out = new Set<string>();
  const sortiert = [...messages].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  for (let i = 0; i < sortiert.length; i++) {
    const m = sortiert[i];
    if (m.direction !== "outbound" || m.status !== "failed") continue;
    const s = schluessel(m);
    if (!s.length) continue;
    const spaeter = sortiert.slice(i + 1).some((n) => n.direction === "outbound" && n.status !== "failed" && schluessel(n).some((k) => s.includes(k)));
    if (spaeter) out.add(m.id);
  }
  return out;
}
