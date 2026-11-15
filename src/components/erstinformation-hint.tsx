import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { erstinfoRelevant, loadErstinfo } from "@/lib/erstinformation";

// Warnung auf „Heute“: ohne Erstinformation (§ 15 VersVermV) fehlt im ersten WhatsApp-Kontakt eine Pflichtangabe.
export async function ErstinfoHeuteHint({ customerId, owner }: { customerId: string; owner: boolean }) {
  if (!(await erstinfoRelevant(customerId).catch(() => false))) return null;
  const e = await loadErstinfo(customerId).catch(() => null);
  if (!e || e.vollstaendig) return null;
  return (
    <div className="mb-5 flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" data-erstinfo-heute>
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1">
        <b>Erstinformation unvollständig:</b> es fehlt {e.fehlt.join(", ")}.
        {owner ? null : " Bitte den Inhaber des Kontos bitten, sie zu ergänzen."}
      </span>
      {owner ? (
        <Link href="/buyer/einrichtung?schritt=erstinfo#erstinfo" className="font-semibold underline">
          Jetzt ergänzen
        </Link>
      ) : null}
    </div>
  );
}
