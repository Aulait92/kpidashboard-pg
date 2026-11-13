import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/vertrieb/auth";
import { offerAdminHref } from "@/lib/offer-links";
import { Badge } from "@/components/ui";

export const metadata = { title: "Angebote | Vertrieb" };
export const dynamic = "force-dynamic";

const eur = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
const date = (d: Date | null) =>
  d ? new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "2-digit" }).format(d) : "–";

type Zustand = "angenommen" | "geoeffnet" | "offen" | "abgelaufen" | "abgelehnt" | "entwurf";
const ZUSTAND: Record<Zustand, { label: string; tone: "success" | "info" | "neutral" | "warning" | "danger" }> = {
  angenommen: { label: "Angenommen", tone: "success" },
  geoeffnet: { label: "Geöffnet", tone: "info" },
  offen: { label: "Verschickt, ungeöffnet", tone: "neutral" },
  abgelaufen: { label: "Abgelaufen", tone: "warning" },
  abgelehnt: { label: "Abgelehnt", tone: "danger" },
  entwurf: { label: "Entwurf", tone: "neutral" },
};

function zustand(o: { status: string; acceptedAt: Date | null; viewedAt: Date | null; validUntil: Date; sentAt: Date | null }, now: Date): Zustand {
  if (o.status === "accepted" || o.acceptedAt) return "angenommen";
  if (o.status === "declined") return "abgelehnt";
  if (o.status === "draft" && !o.sentAt) return "entwurf";
  if (o.validUntil < now) return "abgelaufen";
  return o.viewedAt ? "geoeffnet" : "offen";
}

const FILTER: { key: string; label: string; match: (z: Zustand) => boolean }[] = [
  { key: "alle", label: "Alle verschickten", match: (z) => z !== "entwurf" },
  { key: "offen", label: "Offen", match: (z) => z === "offen" || z === "geoeffnet" },
  { key: "angenommen", label: "Angenommen", match: (z) => z === "angenommen" },
  { key: "abgelaufen", label: "Abgelaufen / abgelehnt", match: (z) => z === "abgelaufen" || z === "abgelehnt" },
  { key: "entwurf", label: "Entwürfe", match: (z) => z === "entwurf" },
];

// Übersicht aller Angebote (Ole, 13.11.2026): je Angebotsnummer die aktuelle Version.
export default async function AngebotePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAuth();
  const sp = await searchParams;
  const filter = FILTER.find((f) => f.key === sp.f) ?? FILTER[0];
  const now = new Date();
  const offers = await prisma.offer.findMany({
    where: { status: { not: "superseded" } },
    orderBy: [{ sentAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    take: 500,
    select: {
      id: true, number: true, version: true, status: true, contactName: true, company: true, email: true,
      setupFee: true, monthlyFee: true, sentAt: true, viewedAt: true, acceptedAt: true, validUntil: true, createdAt: true,
      salesContactId: true, dealId: true,
    },
  });
  const rows = offers.map((o) => ({ ...o, z: zustand(o, now) }));
  const sent = rows.filter((r) => r.z !== "entwurf");
  const angenommen = sent.filter((r) => r.z === "angenommen");
  const offen = sent.filter((r) => r.z === "offen" || r.z === "geoeffnet");
  const geoeffnet = sent.filter((r) => r.viewedAt);
  const shown = rows.filter((r) => filter.match(r.z));
  const count = (f: (typeof FILTER)[number]) => rows.filter((r) => f.match(r.z)).length;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Angebote</h1>
        <p className="text-sm text-[color:var(--muted)]">Alle Angebote mit Stand: verschickt, geöffnet, angenommen. Je Angebot die aktuelle Version.</p>
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

      <div className="flex flex-wrap gap-1.5" data-angebote-filter>
        {FILTER.map((f) => (
          <Link
            key={f.key}
            href={f.key === "alle" ? "/admin/vertrieb/angebote" : `/admin/vertrieb/angebote?f=${f.key}`}
            className={`rounded-full border px-3 py-1 text-sm font-medium ${
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
                  <td className={`px-4 py-2.5 tabular-nums ${o.z === "abgelaufen" ? "text-amber-700" : ""}`}>{date(o.validUntil)}</td>
                  <td className="px-4 py-2.5">
                    <Badge tone={ZUSTAND[o.z].tone}>{o.z === "angenommen" ? `Angenommen ${date(o.acceptedAt)}` : ZUSTAND[o.z].label}</Badge>
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
