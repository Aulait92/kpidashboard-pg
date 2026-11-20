import Link from "next/link";
import { ChevronRight, Landmark } from "lucide-react";
import { MahnstufeBadge } from "@/components/admin/offene-posten";
import type { OffenePosten } from "@/lib/mahnwesen-server";
import { ART_LABEL, type MahnArt } from "@/lib/mahnwesen";
import { vorschlagAction } from "@/app/admin/neu/zahlen/offene-posten/actions";

// Geld › Offene Posten (Umbau 19.11.2026): eine Zeile je offener Rechnung mit genau einer Handlung. Liegt ein passender
// Zahlungseingang auf dem Geschäftskonto vor, steht er direkt in der Zeile („Zahlung zuordnen“ bzw. „Passt nicht“);
// sonst führt die Zeile in die Kundenakte unter Abrechnung (Rechnung, Mahnstopp, Kontakt).

const eur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
const fmt = (iso: string) => iso.split("-").reverse().join(".");

type Vorschlag = OffenePosten["vorschlaege"][number];

function Treffer({ v }: { v: Vorschlag }) {
  return (
    <div className="mt-2 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-3 py-2.5" data-funktion="offene-posten--zahlungseingang-bestaetigen-oder-verwerfen">
      <p className="flex items-start gap-2 text-sm text-amber-950">
        <Landmark className="mt-0.5 h-4 w-4 shrink-0" />
        <span className="min-w-0">
          <b>Zahlung gefunden:</b> {eur(v.eingang)} am {fmt(v.datum)} von {v.von ?? "unbekannt"}
          <span className="block truncate text-xs text-amber-900/80">{v.zweck ?? "ohne Verwendungszweck"} · {v.grund}</span>
        </span>
      </p>
      <form action={vorschlagAction} className="mt-2 flex flex-wrap gap-2">
        <input type="hidden" name="id" value={v.id} />
        <button name="entscheidung" value="ja" className="h-10 rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-3 text-sm font-semibold text-white sm:h-9">
          Zahlung zuordnen
        </button>
        <button name="entscheidung" value="nein" className="h-10 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-sm font-semibold sm:h-9">
          Passt nicht
        </button>
      </form>
    </div>
  );
}

export function GeldOffenePostenListe({ d }: { d: OffenePosten }) {
  const zuOrdnen = new Set<string>();
  return (
    <ul className="divide-y divide-[color:var(--border)]" data-offene-posten>
      {d.posten.map((p) => {
        const v = d.vorschlaege.find((x) => x.nummer === p.nummer && !zuOrdnen.has(x.id));
        if (v) zuOrdnen.add(v.id);
        const kopf = (
          <>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{p.kunde}</div>
              <div className="text-xs text-[color:var(--muted)]">
                {p.nummer}
                {ART_LABEL[p.art as MahnArt] ? ` · ${ART_LABEL[p.art as MahnArt]}` : ""} · fällig {fmt(p.faellig)}
                {p.tage > 0 ? <span className="font-medium text-rose-700"> · {p.tage} Tage drüber</span> : p.tage === 0 ? " · heute" : ""}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <MahnstufeBadge p={p} />
                <span className="text-xs text-[color:var(--muted)]">{p.gestoppt ? p.gestoppt : p.naechste ? `Nächste: ${p.naechste.label}, ${fmt(p.naechste.tag)}` : "Alle Stufen erledigt"}</span>
                {p.fehler ? <span className="text-xs text-rose-700">{p.fehler}</span> : null}
              </div>
            </div>
            <div className="shrink-0 text-right font-semibold tabular-nums">{eur(p.betrag)}</div>
          </>
        );
        return (
          <li key={p.id} className="text-sm">
            {v || !p.customerId ? (
              <div className="px-5 py-3">
                <div className="flex items-start gap-3">{kopf}</div>
                {v ? <Treffer v={v} /> : null}
              </div>
            ) : (
              <Link href={`/admin/neu/kunden/${p.customerId}/abrechnung`} className="flex items-start gap-3 px-5 py-3 hover:bg-[color:var(--surface-sunken)]">
                {kopf}
                <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--muted)]" />
              </Link>
            )}
          </li>
        );
      })}
      {/* Eingänge ohne passende Zeile (sollte nicht vorkommen): trotzdem entscheidbar */}
      {d.vorschlaege
        .filter((v) => !zuOrdnen.has(v.id))
        .map((v) => (
          <li key={v.id} className="px-5 py-3 text-sm">
            <div className="font-semibold">
              {v.kunde} · {v.nummer} ({eur(v.betrag)})
            </div>
            <Treffer v={v} />
          </li>
        ))}
    </ul>
  );
}
