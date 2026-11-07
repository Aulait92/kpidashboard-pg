import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminTabs } from "@/components/admin-tabs";
import { getCurrentSession } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata = { title: "WhatsApp-Inbox | KPI-Dashboard" };

export default async function AdminWhatsAppPage() {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") redirect("/login");

  const conversations = await prisma.conversation.findMany({
    orderBy: { lastMessageAt: "desc" },
    take: 100,
    select: {
      id: true,
      contactPhone: true,
      contactName: true,
      botActive: true,
      status: true,
      lastMessageAt: true,
      customer: { select: { name: true } },
      messages: {
        where: { direction: { in: ["inbound", "outbound"] } },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { body: true, direction: true },
      },
    },
  });

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
        WhatsApp-Inbox
      </h1>
      <p className="mt-1 text-sm text-[color:var(--muted)]">
        Alle WhatsApp-Konversationen. Öffne einen Chat, um den KI-Bot zu
        pausieren oder selbst zu antworten.
      </p>

      <AdminTabs />

      <div className="mt-6 overflow-hidden rounded-2xl border border-[color:var(--border)] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(37,99,235,0.12)]">
        {conversations.length === 0 ? (
          <div className="p-6 text-sm text-[color:var(--muted)]">
            Noch keine Konversationen. Sobald ein Lead schreibt, erscheint der
            Chat hier.
          </div>
        ) : (
          <ul className="divide-y divide-[color:var(--border)]">
            {conversations.map((c) => {
              const last = c.messages[0];
              return (
                <li key={c.id}>
                  <Link
                    href={`/admin/whatsapp/${c.id}`}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-[color:var(--brand-soft)]/30"
                  >
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color:var(--brand-soft)] text-xs font-bold text-[color:var(--brand-dark)]">
                      {(c.contactName ?? c.contactPhone).slice(0, 2).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-sm font-semibold">
                          {c.contactName ?? c.contactPhone}
                        </span>
                        <span className="shrink-0 text-[11px] text-[color:var(--muted)]">
                          {c.lastMessageAt ? formatDateTime(c.lastMessageAt) : ""}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-[color:var(--muted)]">
                          {c.customer?.name ?? "—"}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            c.botActive
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-zinc-100 text-zinc-600"
                          }`}
                        >
                          {c.botActive ? "KI-Bot" : "Mensch"}
                        </span>
                      </div>
                      <p className="truncate text-xs text-[color:var(--muted)]">
                        {last
                          ? `${last.direction === "outbound" ? "Du: " : ""}${last.body ?? ""}`
                          : ""}
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
