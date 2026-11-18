import Link from "next/link";
import { requireAuth } from "@/lib/vertrieb/auth";
import { offerAdminHref } from "@/lib/offer-links";
import { Badge } from "@/components/ui";
import { fmtTag, tagIso } from "@/lib/angebot-zahlungserinnerung";
import { BonusHinweis } from "@/components/vertrieb/bonus-hinweis";
import { ANGEBOT_FILTER, ANGEBOT_ZUSTAND, ladeAngebote } from "@/lib/vertrieb/angebote-uebersicht";
import { ablehnGruendeText } from "@/lib/vertrieb/angebot-ablehnen";

export const metadata = { title: "Angebote | Vertrieb" };
export const dynamic = "force-dynamic";

const eur = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
const date = (d: Date | null) =>
  d ? new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "2-digit" }).format(d) : "–";

const ZUSTAND = ANGEBOT_ZUSTAND;
const FILTER = ANGEBOT_FILTER;

// Übersicht aller Angebote (Ole, 13.11.2026): je Angebotsnummer die aktuelle Version.
// Laden, Zustand und Filter: lib/vertrieb/angebote-uebersicht.ts (gemeinsam mit dem neuen Admin)
export default async function AngebotePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAuth();
  const sp = await searchParams;
  const { filter, shown, count, kennzahlen, ablehnGruende } = await ladeAngebote(sp.f);
  const { sent, angenommen, offen, geoeffnet } = kennzahlen;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Angebote</h1>
        <p className="text-sm text-[color:var(--muted)]">Je Angebot die aktuelle Version mit Stand.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { l: "Verschickt", v: String(sent.length) },
          { l: "Geöffnet", v: sent.length ? `${Math.round((geoeffnet.length / sent.length) * 100)} %` : "–", s: `${geoeffnet.length} von ${sent.length}` },
          { l: "Angenommen", v: String(angenommen.length), s: sent.length ? `${Math.round((angenommen.length / sent.length) * 100)} % Annahmequote` : undefined },
          { l: "Offen (monatlich)", v: eur(offen.reduce((s, r) => s + Number(r.monthlyFee), 0)), s: `${offen.length} offene Angebote` },
        ].map((k) => (
          <div key={k.l} className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-4">
            <div className="text-xs text-[color:var(--muted)]">{k.l}</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{k.v}</div>
            {k.s ? <div className="text-xs text-[color:var(--muted)]">{k.s}</div> : null}
          </div>
        ))}
      </div>

      {ablehnGruende.length ? (
        <p className="text-sm" data-ablehngruende>
          <span className="font-medium">Abgelehnt:</span> {ablehnGruendeText(ablehnGruende)}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-1.5" data-angebote-filter>
        {FILTER.map((f) => (
          <Link
            key={f.key}
            href={f.key === "alle" ? "/admin/vertrieb/angebote" : `/admin/vertrieb/angebote?f=${f.key}`}
            className={`inline-flex min-h-10 items-center rounded-full border px-3 text-sm font-medium sm:min-h-8 ${
              f.key === filter.key
                ? "border-[color:var(--brand)] bg-[color:var(--brand)] text-white"
                : "border-[color:var(--border)] bg-white text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
            }`}
          >
            {f.label} <span className="tabular-nums opacity-80">{count(f)}</span>
          </Link>
        ))}
      </div>

      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white">
        <table className="w-full min-w-[760px] text-sm" data-angebote>
          <thead className="bg-[color:var(--surface-sunken)] text-left text-xs text-[color:var(--muted)]">
            <tr>
              <th className="px-4 py-2 font-medium">Angebot</th>
              <th className="px-4 py-2 font-medium">Kunde</th>
              <th className="px-4 py-2 text-right font-medium">Monatlich</th>
              <th className="px-4 py-2 text-right font-medium">Setup</th>
              <th className="px-4 py-2 font-medium">Verschickt</th>
              <th className="px-4 py-2 font-medium">Geöffnet</th>
              <th className="px-4 py-2 font-medium">Gültig bis</th>
              <th className="px-4 py-2 font-medium">Stand</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-[color:var(--muted)]">Keine Angebote in dieser Ansicht.</td>
              </tr>
            ) : (
              shown.map((o) => (
                <tr key={o.id} className="border-t border-[color:var(--border)] hover:bg-slate-50">
                  <td className="px-4 py-2.5">
                    <Link href={o.salesContactId ? `${offerAdminHref(o)}#angebot` : offerAdminHref(o)} className="font-medium text-[color:var(--brand)] hover:underline">{o.number}</Link>
                    {o.version > 1 ? <span className="ml-1 text-xs text-[color:var(--muted)]">V{o.version}</span> : null}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{o.company || o.contactName}</div>
                    {o.company ? <div className="text-xs text-[color:var(--muted)]">{o.contactName}</div> : null}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{eur(Number(o.monthlyFee))}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{eur(Number(o.setupFee))}</td>
                  <td className="px-4 py-2.5 tabular-nums">{date(o.sentAt)}</td>
                  <td className="px-4 py-2.5 tabular-nums">{date(o.viewedAt)}</td>
                  <td className={`px-4 py-2.5 tabular-nums ${o.z === "abgelaufen" ? "text-amber-700" : ""}`}>
                    {date(o.validUntil)}
                    {o.bonus ? <BonusHinweis b={o.bonus} /> : null}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tone={ZUSTAND[o.z].tone}>{o.z === "angenommen" ? `Angenommen ${date(o.acceptedAt)}` : ZUSTAND[o.z].label}</Badge>
                    {o.grund ? <div className="mt-1 text-xs text-[color:var(--muted)]">{o.grund}</div> : null}
                    {o.zahlungOffen ? (
                      <div className="mt-1 text-xs text-amber-700" data-zahlung-offen>
                        Zahlung offen
                        {o.paymentReminderAt ? ` · erinnern am ${fmtTag(tagIso(o.paymentReminderAt)!)}` : o.naechste ? ` · Erinnerung ${fmtTag(o.naechste)}` : ""}
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
