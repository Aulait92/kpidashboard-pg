import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { sendReplyAction, toggleBotAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function AdminWhatsAppThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") redirect("/login");

  const { id } = await params;
  const conv = await prisma.conversation.findUnique({
    where: { id },
    select: {
      id: true,
      contactPhone: true,
      contactName: true,
      botActive: true,
      status: true,
      windowExpiresAt: true,
      customer: { select: { name: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          direction: true,
          kind: true,
          body: true,
          sentBy: true,
          status: true,
          createdAt: true,
        },
      },
    },
  });
  if (!conv) notFound();

  const windowOpen =
    !!conv.windowExpiresAt && conv.windowExpiresAt.getTime() > Date.now();

  return (
    <main className="mx-auto flex h-screen w-full max-w-3xl flex-1 flex-col px-4 py-6 sm:px-6">
      <div className="mb-3">
        <Link
          href="/admin/whatsapp"
          className="text-sm text-[color:var(--brand)] hover:underline"
        >
          ← Alle Konversationen
        </Link>
      </div>

      {/* Kopf */}
      <div className="flex items-center justify-between gap-3 rounded-t-2xl border border-b-0 border-[color:var(--border)] bg-white px-5 py-3">
        <div>
          <div className="font-bold">{conv.contactName ?? conv.contactPhone}</div>
          <div className="text-xs text-[color:var(--muted)]">
            {conv.customer?.name ?? "—"} · {conv.contactPhone}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
              conv.botActive
                ? "bg-emerald-100 text-emerald-800"
                : "bg-zinc-100 text-zinc-600"
            }`}
          >
            {conv.botActive ? "KI-Bot aktiv" : "Mensch übernimmt"}
          </span>
          <form action={toggleBotAction}>
            <input type="hidden" name="conversationId" value={conv.id} />
            <button
              type="submit"
              className="rounded-lg border border-[color:var(--border)] bg-white px-3 py-1.5 text-xs font-semibold hover:border-[color:var(--brand)]"
            >
              {conv.botActive ? "Bot pausieren" : "Bot aktivieren"}
            </button>
          </form>
        </div>
      </div>

      {/* Verlauf */}
      <div className="flex-1 space-y-3 overflow-y-auto border-x border-[color:var(--border)] bg-[color:var(--background)] px-5 py-5">
        {conv.messages.map((m) => {
          if (m.direction === "internal") {
            return (
              <div key={m.id} className="flex justify-center">
                <span className="rounded-full bg-amber-50 px-3 py-1 text-[11px] text-amber-800 ring-1 ring-amber-200">
                  {m.kind === "qualification"
                    ? "Qualifizierung"
                    : m.kind === "appointment_proposal"
                      ? "Terminvorschlag"
                      : m.kind}
                  : {m.body}
                </span>
              </div>
            );
          }
          const outbound = m.direction === "outbound";
          return (
            <div
              key={m.id}
              className={`flex ${outbound ? "justify-end" : "justify-start"}`}
            >
              <div className="max-w-[75%]">
                <div
                  className={`whitespace-pre-wrap break-words px-3.5 py-2 text-sm leading-relaxed ${
                    outbound
                      ? "rounded-[16px_4px_16px_16px] bg-[color:var(--brand)] text-white"
                      : "rounded-[4px_16px_16px_16px] border border-[color:var(--border)] bg-white"
                  }`}
                >
                  {m.body}
                </div>
                <div
                  className={`mt-1 text-[10px] text-[color:var(--muted)] ${outbound ? "text-right" : ""}`}
                >
                  {outbound && m.sentBy ? `${m.sentBy} · ` : ""}
                  {formatDateTime(m.createdAt)}
                  {outbound && m.status ? ` · ${m.status}` : ""}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Eingabe */}
      <form
        action={sendReplyAction}
        className="rounded-b-2xl border border-t-0 border-[color:var(--border)] bg-white px-4 py-3"
      >
        <input type="hidden" name="conversationId" value={conv.id} />
        <textarea
          name="body"
          rows={2}
          placeholder={
            windowOpen
              ? "Als Agent antworten …"
              : "24-Stunden-Fenster geschlossen — freie Antwort evtl. nicht zustellbar."
          }
          className="w-full resize-none rounded-lg border border-[color:var(--border)] px-3 py-2 text-sm focus:border-[color:var(--brand)] focus:outline-none"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[11px] text-[color:var(--muted)]">
            {windowOpen
              ? `24h-Fenster offen bis ${formatDateTime(conv.windowExpiresAt!)}`
              : "24h-Fenster geschlossen"}
          </span>
          <button
            type="submit"
            className="rounded-lg bg-[color:var(--brand)] px-5 py-2 text-sm font-semibold text-white"
          >
            Senden
          </button>
        </div>
      </form>
    </main>
  );
}
