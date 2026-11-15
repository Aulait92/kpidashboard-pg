// Kleine Zeile „Leads ohne WhatsApp“ auf /buyer/zahlen (Ole, 15.11.2026): Anteil der per WhatsApp angeschriebenen
// Leads im Zeitraum, deren Nummer nicht per WhatsApp erreichbar war. Rechnung: lib/whatsapp/kein-whatsapp.ts.

import { PhoneCall } from "lucide-react";
import { formatNumber } from "@/lib/format";
import { keinWhatsAppQuote } from "@/lib/whatsapp/kein-whatsapp";

export async function KeinWhatsAppKpi({ customerId, range }: { customerId: string; range: { from: Date; to: Date } }) {
  const q = await keinWhatsAppQuote({ customerId, from: range.from, to: range.to });
  if (q.attempted === 0) return null;
  const pct = q.share == null ? 0 : Math.round(q.share * 100);
  return (
    <p
      className="flex flex-wrap items-center gap-1.5 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white px-4 py-2.5 text-sm text-[color:var(--muted)]"
      data-kein-whatsapp-kpi
    >
      <PhoneCall className="h-4 w-4 shrink-0" />
      <span>
        <b className="text-[color:var(--foreground)]">Leads ohne WhatsApp: {pct} %</b> ({formatNumber(q.noWhatsApp)} von {formatNumber(q.attempted)} per WhatsApp
        angeschriebenen Leads). Der Assistent arbeitet nur über WhatsApp. Diese Leads stehen sofort oben auf Ihrer Anrufliste und bekommen, wenn eine
        E-Mail-Adresse da ist, eine kurze E-Mail mit Ihrem Terminlink.
      </span>
    </p>
  );
}
