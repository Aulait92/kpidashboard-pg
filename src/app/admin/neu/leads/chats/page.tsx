import Link from "next/link";
import { redirect } from "next/navigation";
import { Seite } from "@/components/admin-neu/ui/seite";
import { ChatsAnsicht, type ChatsSuche } from "@/app/admin/whatsapp/chats-ansicht";

export const metadata = { title: "WhatsApp-Chats | performancegrowth Admin" };

// Leads & Kampagnen → WhatsApp-Chats: alle Gespräche gemischt (Leads der Kunden und Support-Nummer), filterbar
// nach Art (Alle, Leads der Kunden, Support-Nummer, Kunden, Interessenten, Unbekannt), Status und Suche.
// Liste, Verlauf und Lead-Seitenleiste wie /admin/whatsapp (chats-ansicht.tsx); ein Chat hat eine eigene Adresse.
const FUNKTIONEN =
  "page-status-tabs--status-reiter-offen-zurueckgestellt-erledigt page-art-filters--filter-alle-leads-der-kunden-support-nummer page-q--chats-durchsuchen-nach-name-oder-nummer page--braucht-aufmerksamkeit-grund-und-nicht";

export default async function Page({ searchParams }: { searchParams: Promise<ChatsSuche> }) {
  const sp = await searchParams;
  // Alte Adressen (Push, Heute-Liste): ?c=<id> öffnet den Chat
  if (sp.c) {
    const { c, ...rest } = sp;
    const qs = new URLSearchParams(Object.entries(rest).filter(([, v]) => v) as [string, string][]).toString();
    redirect(`/admin/neu/leads/chats/${encodeURIComponent(c)}${qs ? `?${qs}` : ""}`);
  }
  return (
    <Seite
      titel="Leads & Kampagnen"
      reiter="leads"
      breit
      aktionen={
        <Link href="/admin/whatsapp/settings" className="inline-flex min-h-10 items-center text-sm font-medium text-[color:var(--brand)] hover:underline">
          Vorlagen
        </Link>
      }
    >
      <div data-funktion={FUNKTIONEN}>
        <ChatsAnsicht sp={sp} basis="/admin/neu/leads/chats" neu />
      </div>
    </Seite>
  );
}
