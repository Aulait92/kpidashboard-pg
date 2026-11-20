// Support-WhatsApp von performancegrowth (lib/whatsapp/support-inbox.ts): Status und Verbinden über 360dialog.
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { partnerConfig } from "@/lib/whatsapp/dialog360-partner";
import { SUPPORT_CUSTOMER_ID } from "@/lib/whatsapp/support-inbox";
import { supportConfig } from "@/lib/support";

const STATUS: Record<string, string> = {
  ok: "Verbunden. Nachrichten an die Support-Nummer erscheinen jetzt unter WhatsApp-Chats.",
  pending: "360dialog richtet die Nummer noch ein. Der Schlüssel wird automatisch nachgeholt, meist innerhalb weniger Minuten.",
  error: "Das Verbinden hat nicht geklappt. Details stehen in den Aufgaben, sonst im 360dialog Partner Hub prüfen.",
};

export async function SupportInboxCard({ status }: { status: string | null }) {
  const acc = await prisma.whatsAppAccount.findUnique({
    where: { customerId: SUPPORT_CUSTOMER_ID },
    select: { status: true, phoneNumber: true, displayName: true, updatedAt: true },
  });
  const conversations = acc ? await prisma.conversation.count({ where: { customerId: SUPPORT_CUSTOMER_ID } }) : 0;
  const shown = supportConfig().whatsapp;
  return (
    <section id="support" className="mt-4 rounded-xl border border-[color:var(--border)] bg-white p-5 text-sm" data-support-inbox>
      <h2 className="text-base font-semibold">Support-WhatsApp (performancegrowth)</h2>
      <p className="mt-1 text-[color:var(--muted)]">
        Eigene Nummer für Kundenanfragen. Nachrichten landen unter WhatsApp-Chats (Kunde „performancegrowth Support“), ohne Assistent, mit Push an alle Admins.
      </p>
      {status && STATUS[status] ? <p className="mt-3 rounded-lg bg-[color:var(--surface-sunken)] px-3 py-2">{STATUS[status]}</p> : null}
      <ul className="mt-3 space-y-1">
        <li>
          Nummer:{" "}
          {acc?.status === "connected" ? (
            <span className="font-medium text-emerald-700">
              +{acc.phoneNumber?.replace(/^\+/, "")} verbunden{acc.displayName ? ` (${acc.displayName})` : ""}
            </span>
          ) : acc ? (
            <span className="font-medium text-amber-700">{acc.status === "pending" ? "wird eingerichtet" : "Fehler beim Verbinden"}</span>
          ) : (
            <span className="text-[color:var(--muted)]">noch nicht verbunden</span>
          )}
        </li>
        <li>Chats bisher: {conversations}</li>
        <li>
          Knopf im Kundenbereich (SUPPORT_WHATSAPP_NUMBER):{" "}
          {shown ? <span className="font-medium">+{shown} sichtbar</span> : <span className="text-[color:var(--muted)]">ausgeblendet</span>}
        </li>
      </ul>
      <div className="mt-4 flex flex-wrap gap-2">
        {partnerConfig() ? (
          <a href="/admin/whatsapp/support-verbinden" className="rounded-lg bg-[color:var(--brand)] px-4 py-2 font-semibold text-white">
            {acc?.status === "connected" ? "Neu verbinden" : "Nummer über 360dialog verbinden"}
          </a>
        ) : (
          <span className="text-amber-700">360dialog-Partnerzugang fehlt (DIALOG360_PARTNER_ID / DIALOG360_PARTNER_API_KEY).</span>
        )}
        {acc ? (
          <Link href="/admin/neu/leads/chats" className="rounded-lg border border-[color:var(--border)] px-4 py-2 font-medium">
            Zu den Chats
          </Link>
        ) : null}
      </div>
    </section>
  );
}
