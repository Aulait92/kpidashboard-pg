import Link from "next/link";
import { Card } from "@/components/ui";
import { AUDIT_LABEL } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/vertrieb/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Änderungsprotokoll | performancegrowth Admin" };

const PAGE = 100;
const input = "h-9 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-2.5 text-sm";
const fmt = (d: Date) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d);
const ROLE: Record<string, string> = { ADMIN: "Admin", BUYER: "Kunde", kunde: "Kunde (Angebot)", system: "System" };

function detailText(d: unknown): string {
  if (!d || typeof d !== "object") return "";
  return Object.entries(d as Record<string, unknown>)
    .filter(([k, v]) => v != null && v !== "" && k !== "filter")
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" · ");
}

export default async function ProtokollPage({ searchParams }: { searchParams: Promise<{ kunde?: string; art?: string; seite?: string }> }) {
  await requireAuth();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.seite) || 1);
  const where = { ...(sp.kunde ? { customerId: sp.kunde } : {}), ...(sp.art ? { action: sp.art } : {}) };
  const [rows, total, customers] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { at: "desc" }, skip: (page - 1) * PAGE, take: PAGE }),
    prisma.auditLog.count({ where }),
    prisma.customer.findMany({ where: { plan: { not: "internal" } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const names = new Map(customers.map((c) => [c.id, c.name.replace(/^Allianz\s+/i, "")]));
  const qs = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "seite") as [string, string][]).toString();

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 space-y-5 px-4 py-8 sm:px-6">
      <div>
        <Link href="/admin/einstellungen" className="text-xs text-[color:var(--brand)] hover:underline">
          ← Einstellungen
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Änderungsprotokoll</h1>
        <p className="mt-1 text-sm text-[color:var(--muted)]">Wer hat wann was geändert. Einträge bleiben 1 Jahr.</p>
      </div>
      <form className="flex flex-wrap gap-2">
        <select name="kunde" defaultValue={sp.kunde ?? ""} className={input}>
          <option value="">Alle Kunden</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {names.get(c.id)}
            </option>
          ))}
        </select>
        <select name="art" defaultValue={sp.art ?? ""} className={input}>
          <option value="">Alle Arten</option>
          {Object.entries(AUDIT_LABEL).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
        <button className="h-9 rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-4 text-sm font-semibold text-white">Filtern</button>
      </form>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-[color:var(--border)] text-left text-xs text-[color:var(--muted)]">
              <tr>
                <th className="px-4 py-2.5">Zeit</th>
                <th className="px-3 py-2.5">Was</th>
                <th className="px-3 py-2.5">Wer</th>
                <th className="px-3 py-2.5">Kunde</th>
                <th className="px-3 py-2.5">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--border)]">
              {rows.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="whitespace-nowrap px-4 py-2 text-[color:var(--muted)]">{fmt(r.at)}</td>
                  <td className="px-3 py-2 font-medium">{AUDIT_LABEL[r.action] ?? r.action}</td>
                  <td className="px-3 py-2">
                    {r.actorEmail ?? "-"}
                    <span className="block text-sm text-[color:var(--muted)]">{ROLE[r.actorRole ?? ""] ?? r.actorRole ?? ""}</span>
                  </td>
                  <td className="px-3 py-2">{r.customerId ? (names.get(r.customerId) ?? "-") : "-"}</td>
                  <td className="max-w-md px-3 py-2 text-sm text-[color:var(--muted)]">{detailText(r.details)}</td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-[color:var(--muted)]">
                    Noch keine Einträge.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
      {total > PAGE ? (
        <div className="flex justify-center gap-4 text-sm">
          {page > 1 ? <Link href={`?${qs}&seite=${page - 1}`} className="underline">zurück</Link> : null}
          <span className="text-[color:var(--muted)]">Seite {page} von {Math.ceil(total / PAGE)}</span>
          {page * PAGE < total ? <Link href={`?${qs}&seite=${page + 1}`} className="underline">weiter</Link> : null}
        </div>
      ) : null}
    </main>
  );
}
