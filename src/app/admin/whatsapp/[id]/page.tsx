import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "WhatsApp-Conversation | KPI-Dashboard",
};

export default async function WhatsappConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") {
    redirect("/login");
  }

  const { id } = await params;
  const conv = await prisma.whatsappConversation.findUnique({
    where: { id },
    include: {
      lead: {
        select: {
          name: true,
          source: true,
          status: true,
          customer: { select: { name: true } },
        },
      },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!conv) notFound();

  const qualification = (conv.qualification ?? null) as Record<string, unknown> | null;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <Link
          href="/admin/whatsapp"
          className="text-xs text-[color:var(--brand)] hover:underline"
        >
          ← zur Übersicht
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
          {conv.lead?.name ?? conv.phone}
        </h1>
        <p className="mt-1 text-sm text-[color:var(--muted)]">
          {conv.product ?? "Produkt unbekannt"} · {conv.lead?.customer?.name ?? "Kunde unbekannt"} ·
          Status: <span className="font-medium">{conv.state}</span>
        </p>
        <p className="mt-1 font-mono text-xs text-[color:var(--muted)]">
          {conv.phone} · gestartet {formatDate(conv.startedAt)}
          {conv.completedAt ? ` · abgeschlossen ${formatDate(conv.completedAt)}` : null}
        </p>
        {conv.lastError ? (
          <p className="mt-2 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-900">
            Fehler: {conv.lastError}
          </p>
        ) : null}
      </header>

      {qualification ? (
        <section className="mb-6 rounded-2xl border border-[color:var(--border)] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(37,99,235,0.12)]">
          <h2 className="text-base font-semibold">Vorqualifizierung</h2>
          <dl className="mt-3 space-y-2 text-sm">
            {Object.entries(qualification).map(([k, v]) => (
              <div key={k} className="flex gap-3">
                <dt className="w-40 shrink-0 text-[color:var(--muted)]">{k}</dt>
                <dd className="flex-1 font-medium">{String(v)}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      <section className="rounded-2xl border border-[color:var(--border)] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(37,99,235,0.12)]">
        <h2 className="text-base font-semibold">Transcript</h2>
        {conv.messages.length === 0 ? (
          <p className="mt-2 text-sm text-[color:var(--muted)]">
            Noch keine Nachrichten in dieser Conversation.
          </p>
        ) : (
          <ol className="mt-4 space-y-3">
            {conv.messages.map((m) => {
              const isOut = m.direction === "out";
              return (
                <li
                  key={m.id}
                  className={`flex ${isOut ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                      isOut
                        ? "bg-emerald-100 text-emerald-950"
                        : "bg-slate-100 text-slate-900"
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{m.body}</div>
                    <div className="mt-1 text-[10px] uppercase tracking-wide opacity-60">
                      {isOut ? "Bot" : "Lead"} · {formatDate(m.createdAt)}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </main>
  );
}
