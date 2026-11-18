// Admin → Zahlen → WhatsApp-Zustellung (Ole, 15.11.2026): Anteil der Leads ohne WhatsApp (gesamt und je Kunde)
// und die Zustellfehler-Alarme der letzten 14 Tage (lib/whatsapp/kein-whatsapp.ts).

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { keinWhatsAppJeKunde, keinWhatsAppQuote } from "@/lib/whatsapp/kein-whatsapp";
import { ART_LABEL, artOf, NO_WHATSAPP_CODES } from "@/lib/whatsapp/zustellfehler";
import { NOCH_KEINE_DATEN } from "@/lib/platzhalter";

const DAY = 86_400_000;
const pct = (r: number | null) => (r == null ? NOCH_KEINE_DATEN : `${(Math.round(r * 1000) / 10).toLocaleString("de-DE")} %`);

export async function WhatsAppZustellung() {
  const now = new Date();
  const from30 = new Date(now.getTime() - 30 * DAY);
  const [gesamt, letzte30, kunden, alarme] = await Promise.all([
    keinWhatsAppQuote(),
    keinWhatsAppQuote({ from: from30 }),
    keinWhatsAppJeKunde(),
    prisma.whatsAppErrorAlert.findMany({
      where: { createdAt: { gte: new Date(now.getTime() - 14 * DAY) } },
      orderBy: [{ day: "desc" }, { count: "desc" }],
      take: 100,
      select: { id: true, customerId: true, code: true, day: true, title: true, count: true, customer: { select: { name: true } } },
    }),
  ]);
  return (
    <div className="mt-6 space-y-6" data-admin-kein-whatsapp>
      <section className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-4 shadow-[var(--shadow-sm)]">
        <h2 className="text-[15px] font-semibold">Leads ohne WhatsApp</h2>
        <p className="mt-0.5 text-xs text-[color:var(--muted)]">
          Anteil der per WhatsApp angeschriebenen Leads, deren Nachricht mit „nicht per WhatsApp erreichbar“ zurückkam (Meta{" "}
          {[...NO_WHATSAPP_CODES].join(", ")}). Diese Leads gehen sofort zum Vermittler (Anruf, E-Mail mit Terminlink).
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-[var(--radius-md)] border border-[color:var(--border)] px-3 py-2">
            <div className="text-xs text-[color:var(--muted)]">Letzte 30 Tage</div>
            <div className="text-xl font-semibold tabular-nums" data-kein-wa-30>
              {pct(letzte30.share)}
            </div>
            <div className="text-xs tabular-nums text-[color:var(--muted)]">
              {letzte30.noWhatsApp} von {letzte30.attempted} Leads
            </div>
          </div>
          <div className="rounded-[var(--radius-md)] border border-[color:var(--border)] px-3 py-2">
            <div className="text-xs text-[color:var(--muted)]">Gesamt</div>
            <div className="text-xl font-semibold tabular-nums">{pct(gesamt.share)}</div>
            <div className="text-xs tabular-nums text-[color:var(--muted)]">
              {gesamt.noWhatsApp} von {gesamt.attempted} Leads
            </div>
          </div>
        </div>
        {kunden.length ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[color:var(--border)] text-left text-xs text-[color:var(--muted)]">
                <tr>
                  <th className="py-1.5 pr-3">Kunde</th>
                  <th className="px-3 py-1.5 text-right">angeschrieben</th>
                  <th className="px-3 py-1.5 text-right">ohne WhatsApp</th>
                  <th className="py-1.5 pl-3 text-right">Anteil</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--border)] tabular-nums">
                {kunden.slice(0, 50).map((k) => (
                  <tr key={k.customerId}>
                    <td className="py-1.5 pr-3">
                      <Link href={`/admin/kunden/${k.customerId}`} className="hover:text-[color:var(--brand)] hover:underline">
                        {k.name}
                      </Link>
                    </td>
                    <td className="px-3 py-1.5 text-right">{k.attempted}</td>
                    <td className="px-3 py-1.5 text-right">{k.noWhatsApp}</td>
                    <td className="py-1.5 pl-3 text-right font-semibold">{pct(k.share)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 text-sm text-[color:var(--muted)]">Noch keine per WhatsApp angeschriebenen Leads.</p>
        )}
      </section>

      <section className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-4 shadow-[var(--shadow-sm)]">
        <h2 className="text-[15px] font-semibold">Zustellfehler (letzte 14 Tage)</h2>
        <p className="mt-0.5 text-xs text-[color:var(--muted)]">
          Fehler, die nicht „kein WhatsApp“ bedeuten (Zahlung, Vorlage, Limits …). Je Kunde, Code und Tag ein Alarm (Push und Aufgabe), weitere zählen hoch.
        </p>
        {alarme.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[color:var(--border)] text-left text-xs text-[color:var(--muted)]">
                <tr>
                  <th className="py-1.5 pr-3">Tag</th>
                  <th className="px-3 py-1.5">Kunde</th>
                  <th className="px-3 py-1.5">Code</th>
                  <th className="px-3 py-1.5">Art</th>
                  <th className="py-1.5 pl-3 text-right">Anzahl</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--border)] tabular-nums">
                {alarme.map((a) => (
                  <tr key={a.id} data-wa-alarm={a.code}>
                    <td className="whitespace-nowrap py-1.5 pr-3">{a.day}</td>
                    <td className="px-3 py-1.5">
                      <Link href={`/admin/kunden/${a.customerId}`} className="hover:text-[color:var(--brand)] hover:underline">
                        {a.customer.name}
                      </Link>
                    </td>
                    <td className="px-3 py-1.5">
                      {a.code >= 0 ? a.code : "ohne Code"}
                      {a.title ? <span className="ml-1 text-xs text-[color:var(--muted)]">{a.title}</span> : null}
                    </td>
                    <td className="px-3 py-1.5 text-xs">{ART_LABEL[artOf(a.code >= 0 ? a.code : null)]}</td>
                    <td className="py-1.5 pl-3 text-right font-semibold">{a.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 text-sm text-[color:var(--muted)]">Keine Zustellfehler.</p>
        )}
      </section>
    </div>
  );
}
