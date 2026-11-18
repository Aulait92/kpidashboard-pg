import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, MessageSquareText, Route } from "lucide-react";
import { PageHeader } from "@/components/buyer-shell";
import { getBuyerContext } from "@/lib/buyer-context";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const metadata = { title: "Assistent | performancegrowth" };

// Einstellungen → Assistent (Ole, 17.11.2026): was in Ihrem Namen an Ihre Kunden rausgeht. Unterseiten als Zeilen:
// „Ablauf“ (Paket P6, Zeitleiste der Standard-Abfolge), die WhatsApp-Vorlagen; „E-Mails in Ihrem Namen“ (Paket M9) und
// das Onboarding (P8) kommen als eigene Abschnitte dazu.
export default async function AssistentPage() {
  const ctx = await getBuyerContext();
  if (!ctx) redirect("/login");
  const c = await prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { plan: true } });
  const zeilen = [
    { href: "/buyer/einstellungen/assistent/ablauf", icon: Route, color: "bg-sky-600", title: "Ablauf", text: "Was Ihr Assistent wann schickt, vom ersten Kontakt bis zum Angebot", data: "ablauf" },
    ...(c?.plan !== "service"
      ? [{ href: "/buyer/vorlagen", icon: MessageSquareText, color: "bg-emerald-500", title: "WhatsApp-Vorlagen", text: "Nachrichten, die Ihr Assistent in Ihrem Namen schickt", data: "whatsapp" }]
      : []),
  ];

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-6">
      <PageHeader back="/buyer/einstellungen" title="Assistent" />
      <div className="space-y-6" data-assistent-einstellungen>
        <section>
          <ul className="divide-y divide-[color:var(--border)] overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white shadow-[var(--shadow-sm)]">
            {zeilen.map((i) => (
              <li key={i.href}>
                <Link href={i.href} className="flex min-h-[64px] items-center gap-4 px-5 py-3 transition hover:bg-[color:var(--surface-sunken)]" data-assistent-zeile={i.data}>
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-white ${i.color}`}>
                    <i.icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{i.title}</span>
                    <span className="line-clamp-2 block text-sm text-[color:var(--muted)]">{i.text}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--border-strong)]" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
