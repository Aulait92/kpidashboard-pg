import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, ChevronRight, Contact, CreditCard, Gift, Mail, Megaphone, MessageSquareText, Percent, ShieldCheck, UsersRound } from "lucide-react";
import { PageHeader } from "@/components/buyer-shell";
import { getBuyerContext } from "@/lib/buyer-context";
import { unreadUpdates } from "@/lib/neuigkeiten";

export const dynamic = "force-dynamic";
export const metadata = { title: "Einstellungen | performancegrowth" };

type Item = { href: string; icon: typeof CreditCard; color: string; title: string; text: string; badge?: string };

// Einstellungen gebündelt statt langer Liste im Profilmenü (Ole, 13.11.2026) – wie im Admin-Bereich.
export default async function EinstellungenPage() {
  const ctx = await getBuyerContext();
  if (!ctx) redirect("/login");
  const owner = ctx.teamRole !== "advisor";
  const unread = ctx.userId && !ctx.preview ? (await unreadUpdates(ctx.userId, ctx.customerId).catch(() => [])).length : 0;

  const groups: { title: string; items: Item[] }[] = [
    {
      title: "Mein Konto",
      items: [
        ...(owner
          ? [
              { href: "/buyer/konto", icon: CreditCard, color: "bg-blue-600", title: "Konto & Rechnungen", text: "Paket, Werbebudget, Produkte, Zusatzmodule, Rechnungen" },
              { href: "/buyer/team", icon: UsersRound, color: "bg-violet-500", title: "Team", text: "Berater einladen und Leads verteilen" },
            ]
          : []),
        { href: "/buyer/konto/sicherheit", icon: ShieldCheck, color: "bg-slate-600", title: "Anmeldung & Sicherheit", text: "Passwort und Anmeldung" },
      ],
    },
    {
      title: "Arbeiten",
      items: [
        { href: "/buyer/kalender", icon: CalendarDays, color: "bg-emerald-600", title: "Mein Kalender", text: "Kalender verbinden und Zeiten für Termine festlegen" },
        { href: "/buyer/provisionen", icon: Percent, color: "bg-amber-500", title: "Meine Provisionen", text: "Ihre Sätze – daraus rechnet die App Provision und Zahlen" },
        { href: "/buyer/postfach", icon: Mail, color: "bg-blue-500", title: "E-Mail-Postfach", text: "Eigenes Postfach verbinden, Signatur, E-Mail-Vorlagen" },
        { href: "/buyer/vorlagen", icon: MessageSquareText, color: "bg-emerald-500", title: "WhatsApp-Vorlagen", text: "Nachrichten, die Ihr Assistent in Ihrem Namen schickt" },
        ...(owner ? [{ href: "/buyer/bestand", icon: Contact, color: "bg-sky-500", title: "Bestandskunden", text: "Kundenliste, Lücken und Anlässe, Kampagnen" }] : []),
      ],
    },
    {
      title: "Mehr",
      items: [
        ...(owner ? [{ href: "/buyer/empfehlen", icon: Gift, color: "bg-rose-500", title: "Kollegen empfehlen", text: "Kollegen empfehlen und Vorteil sichern" }] : []),
        { href: "/buyer/neuigkeiten", icon: Megaphone, color: "bg-violet-500", title: "Neuigkeiten", text: "Was wir zuletzt verbessert haben", ...(unread ? { badge: String(unread) } : {}) },
      ],
    },
  ];

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-6">
      <PageHeader title="Einstellungen" />
      <div className="space-y-6" data-einstellungen>
        {groups
          .filter((g) => g.items.length)
          .map((g) => (
            <section key={g.title}>
              <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">{g.title}</h2>
              <ul className="divide-y divide-[color:var(--border)] overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white shadow-[var(--shadow-sm)]">
                {g.items.map((i) => (
                  <li key={i.href}>
                    <Link href={i.href} className="flex min-h-[64px] items-center gap-4 px-5 py-3 transition hover:bg-[color:var(--surface-sunken)]">
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-white ${i.color}`}>
                        <i.icon className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{i.title}</span>
                        <span className="line-clamp-2 block text-sm text-[color:var(--muted)]">{i.text}</span>
                      </span>
                      {i.badge ? (
                        <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">{i.badge}</span>
                      ) : null}
                      <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--border-strong)]" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        <p className="flex flex-wrap gap-x-4 gap-y-1 px-1 text-sm text-[color:var(--muted)]">
          <a href="https://performancegrowth.de/impressum" target="_blank" rel="noopener noreferrer" className="hover:underline">Impressum</a>
          <a href="https://performancegrowth.de/datenschutz" target="_blank" rel="noopener noreferrer" className="hover:underline">Datenschutz</a>
          <a href="/sicherheit" target="_blank" rel="noopener" className="hover:underline">Sicherheit &amp; Datenschutz</a>
        </p>
      </div>
    </main>
  );
}
