import { redirect } from "next/navigation";
import { PageHeader } from "@/components/buyer-shell";
import { TodayInbox } from "@/components/today-inbox";
import { AutoRefresh } from "@/components/auto-refresh";
import { getBuyerContext } from "@/lib/buyer-context";
import { loadInbox } from "@/lib/inbox";
import { prisma } from "@/lib/prisma";
import { hasWhatsAppInbox } from "@/lib/whatsapp/access";
import ZahlenPage from "./zahlen/page";

// Startseite des Kundenbereichs. WhatsApp-Kunden: „Heute" – eine
// Aufgabenliste (Termine, Ergebnisse, Chats, Rückrufe), die man leer
// arbeitet. Alle anderen Kunden: die Zahlen (KPIs) wie bisher.
export const dynamic = "force-dynamic";
export const metadata = { title: "Heute | performancegrowth" };

type SearchParams = Promise<{ range?: string; from?: string; to?: string }>;

export default async function BuyerHomePage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await getBuyerContext();
  if (!ctx) redirect("/login");
  if (!(await hasWhatsAppInbox(ctx.customerId))) {
    return <ZahlenPage searchParams={searchParams} />;
  }
  const [data, customer, me] = await Promise.all([
    loadInbox(ctx),
    prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { name: true } }),
    ctx.teamRole === "advisor" && ctx.userId ? prisma.user.findUnique({ where: { id: ctx.userId }, select: { displayName: true } }) : null,
  ]);
  const first = (me?.displayName ?? (customer?.name ?? "").replace(/^Allianz\s+/i, "")).split(" ")[0];
  const hour = Number(
    new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", hourCycle: "h23" }).format(new Date()),
  );
  const greet = hour < 11 ? "Guten Morgen" : hour < 18 ? "Hallo" : "Guten Abend";
  const today = new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <AutoRefresh intervalMs={60_000} />
      <PageHeader title={`${greet}${first ? `, ${first}` : ""}`} subtitle={`Heute ist ${today}. Das steht an:`} />
      <TodayInbox data={data} />
    </main>
  );
}
