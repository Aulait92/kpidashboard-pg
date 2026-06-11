import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "WhatsApp-Vorqualifizierung | KPI-Dashboard",
};

const STATE_LABEL: Record<string, string> = {
  pending_template: "Template gesendet",
  qualifying: "Bot stellt Fragen",
  done: "Abgeschlossen",
  opted_out: "Abgelehnt",
  failed: "Fehler",
};

const STATE_TONE: Record<string, string> = {
  pending_template: "bg-amber-100 text-amber-900",
  qualifying: "bg-blue-100 text-blue-900",
  done: "bg-emerald-100 text-emerald-900",
  opted_out: "bg-slate-200 text-slate-700",
  failed: "bg-rose-100 text-rose-900",
};

export default async function AdminWhatsappPage() {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") {
    redirect("/login");
  }

  const conversations = await prisma.whatsappConversation.findMany({
    orderBy: { startedAt: "desc" },
    take: 200,
    include: {
      lead: {
        select: {
          name: true,
          source: true,
          customer: { select: { name: true } },
        },
      },
      _count: { select: { messages: true } },
    },
  });

  const totals = {
    total: conversations.length,
    qualifying: conversations.filter((c) => c.state === "qualifying").length,
    done: conversations.filter((c) => c.state === "done").length,
    failed: conversations.filter((c) => c.state === "failed").length,
  };

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <Link
            href="/"
            className="text-xs text-[color:var(--brand)] hover:underline"
          >
            ← zum Dashboard
          </Link>
          <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
            WhatsApp-Vorqualifizierung
          </h1>
          <p className="mt-1 text-sm text-[color:var(--muted)]">
            Der Bot schreibt jeden neuen Lead mit Telefonnummer an und
            sammelt 4-6 Datenpunkte, bevor der Berater anruft.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <Stat label="Gesamt" value={totals.total} />
          <Stat label="Aktiv" value={totals.qualifying} tone="blue" />
          <Stat label="Abgeschlossen" value={totals.done} tone="emerald" />
          <Stat label="Fehler" value={totals.failed} tone="rose" />
        </div>
      </header>

      {conversations.length === 0 ? (
        <section className="rounded-2xl border border-[color:var(--border)] bg-white p-8 text-center text-sm text-[color:var(--muted)]">
          Noch keine WhatsApp-Conversations. Sobald der nächste Lead-Sync läuft
          und ein Lead mit Telefonnummer eingeht, wird hier eine Conversation
          angelegt.
        </section>
      ) : (
        <section className="rounded-2xl border border-[color:var(--border)] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(37,99,235,0.12)]">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted)]">
                <tr>
                  <th className="border-b border-[color:var(--border)] py-2 pr-3 text-left">
                    Status
                  </th>
                  <th className="border-b border-[color:var(--border)] py-2 pr-3 text-left">
                    Lead
                  </th>
                  <th className="border-b border-[color:var(--border)] py-2 pr-3 text-left">
                    Telefon
                  </th>
                  <th className="border-b border-[color:var(--border)] py-2 pr-3 text-left">
                    Produkt
                  </th>
                  <th className="border-b border-[color:var(--border)] py-2 pr-3 text-left">
                    Kunde
                  </th>
                  <th className="border-b border-[color:var(--border)] py-2 pr-3 text-right">
                    Nachrichten
                  </th>
                  <th className="border-b border-[color:var(--border)] py-2 pr-3 text-left">
                    Start
                  </th>
                  <th className="border-b border-[color:var(--border)] py-2 pr-3"></th>
                </tr>
              </thead>
              <tbody>
                {conversations.map((c) => (
                  <tr key={c.id} className="border-b border-[color:var(--border)] last:border-b-0">
                    <td className="py-2 pr-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATE_TONE[c.state] ?? "bg-slate-100 text-slate-700"}`}
                      >
                        {STATE_LABEL[c.state] ?? c.state}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      {c.lead?.name ?? <span className="text-[color:var(--muted)]">–</span>}
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">{c.phone}</td>
                    <td className="py-2 pr-3">{c.product ?? "–"}</td>
                    <td className="py-2 pr-3">
                      {c.lead?.customer?.name ?? <span className="text-[color:var(--muted)]">–</span>}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{c._count.messages}</td>
                    <td className="py-2 pr-3 text-xs text-[color:var(--muted)]">
                      {formatDate(c.startedAt)}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <Link
                        href={`/admin/whatsapp/${c.id}`}
                        className="text-xs font-semibold text-[color:var(--brand)] hover:underline"
                      >
                        Öffnen →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "blue" | "emerald" | "rose";
}) {
  const cls =
    tone === "blue"
      ? "bg-blue-50 text-blue-900"
      : tone === "emerald"
        ? "bg-emerald-50 text-emerald-900"
        : tone === "rose"
          ? "bg-rose-50 text-rose-900"
          : "bg-slate-100 text-slate-700";
  return (
    <div className={`flex items-baseline gap-1 rounded-md px-2 py-1 ${cls}`}>
      <span className="font-semibold tabular-nums">{value}</span>
      <span className="text-[10px] uppercase tracking-wide opacity-70">{label}</span>
    </div>
  );
}
