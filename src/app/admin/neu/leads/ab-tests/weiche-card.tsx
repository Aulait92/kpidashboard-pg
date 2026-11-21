// Karte „Eigener Funnel gegen Perspective“ (Ole, 21.11.2026): Weiche auf start.pkv-tarife.com, je Seite Besucher, Leads,
// erreicht, Termin, Abschluss, dazu die Entscheidung nach der A/B-Regel. Zahlen aus lib/funnel/weiche-auswertung.ts.
import { weichenAuswertung, WEICHE_MIN_BESUCHER, type WeichenSeite } from "@/lib/funnel/weiche-auswertung";

const pct = (z: number, n: number) => (n > 0 ? `${Math.round((z / n) * 1000) / 10} %` : "–");
const datum = (d: Date) => d.toLocaleString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

const ZEILEN: { name: string; key: keyof WeichenSeite; haupt?: boolean }[] = [
  { name: "Besucher", key: "besucher" },
  { name: "Leads", key: "leads" },
  { name: "Erreicht", key: "erreicht", haupt: true },
  { name: "Termin", key: "termin" },
  { name: "Abschluss", key: "abschluss" },
];

export async function WeicheCard() {
  const w = await weichenAuswertung().catch(() => null);
  if (!w) return null;
  const e = w.entscheidung;
  const urteil =
    e.reason === "entschieden"
      ? e.winner === "b"
        ? "Entschieden: Der eigene Funnel ist besser. Weiche auf 100 % stellen, Perspective abschalten."
        : "Entschieden: Perspective ist besser. Eigenen Funnel überarbeiten."
      : e.reason === "kein_unterschied"
        ? `Noch kein signifikanter Unterschied (p = ${e.p.toFixed(3)}). Weiterlaufen lassen.`
        : `Noch zu wenig Daten: je Seite mindestens ${WEICHE_MIN_BESUCHER} Besucher und 10 erreichte Leads.`;
  return (
    <section id="weiche" className="rounded-xl border border-[color:var(--border)] bg-white p-5 text-sm" data-weiche-auswertung>
      <h2 className="text-base font-semibold">Eigener Funnel gegen Perspective</h2>
      <p className="mt-1 text-[color:var(--muted)]">
        PKV-Anzeigen 50/50 seit {datum(w.seit)} Uhr. Hauptkennzahl: erreichte Leads je Besucher. HvK läuft getrennt ({w.hvk} Besucher).
      </p>
      <table className="mt-3 w-full text-sm">
        <thead>
          <tr className="text-xs text-[color:var(--muted)]">
            <th className="py-1 text-left font-medium" />
            <th className="py-1 text-right font-medium">Eigener Funnel</th>
            <th className="py-1 text-right font-medium">Perspective</th>
          </tr>
        </thead>
        <tbody>
          {ZEILEN.map((z) => (
            <tr key={z.key} className={z.haupt ? "font-semibold" : undefined}>
              <td className="py-1 pr-2">{z.name}</td>
              {[w.eigen, w.perspective].map((s, i) => (
                <td key={i} className="py-1 text-right tabular-nums">
                  {s[z.key]}
                  {z.key !== "besucher" ? <span className="ml-1 text-xs text-[color:var(--muted)]">{pct(s[z.key], s.besucher)}</span> : null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className={`mt-3 rounded-lg px-3 py-2 ${e.reason === "entschieden" ? "bg-emerald-50 text-emerald-900" : "bg-[color:var(--surface-sunken)]"}`} data-weiche-urteil>
        {urteil}
      </p>
    </section>
  );
}
