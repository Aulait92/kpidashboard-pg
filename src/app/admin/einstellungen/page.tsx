import Link from "next/link";
import { Activity, Anchor, Bot, Calculator, CalendarDays, Clock, FileBarChart, Layers, ChevronRight, FileUp, Gift, History, KeyRound, Landmark, LifeBuoy, LogIn, Megaphone, MessageCircle, Receipt, Rocket, ShieldCheck, Wallet, Workflow } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { supportConfig } from "@/lib/support";
import { loadTaxNumber, taxNumberWarning } from "@/lib/invoice-footer";
import { requireAuth } from "@/lib/vertrieb/auth";

// Nur Einstellungen (16.11.2026): Arbeitslisten Monatsberichte und Optimierung liegen unter Kunden.
export const metadata = { title: "Einstellungen | performancegrowth Admin" };

// Einstellungen in Gruppen (Ole, 14.11.2026): als lange Liste unübersichtlich.
const GROUPS = [
  {
    title: "Kunden & Leads",
    items: [
      { href: "/admin/lead-eingang", icon: Workflow, color: "bg-blue-500", title: "Lead-Eingang", text: "Meta verbinden, Formulare zuordnen" },
      { href: "/admin/whatsapp/settings", icon: MessageCircle, color: "bg-emerald-500", title: "WhatsApp-Assistent", text: "Nummern, Vorlagen, Erstanschreiben" },
      { href: "/admin/buyers", icon: KeyRound, color: "bg-amber-500", title: "Kunden-Logins", text: "Zugänge, Passwort, Vorschau" },
      { href: "/admin/einstellungen/einrichtung", icon: Rocket, color: "bg-blue-600", title: "Einrichtung neuer Kunden", text: "Meta-Business-ID, Erklärvideos" },
      { href: "/admin/einstellungen/produkte", icon: Layers, color: "bg-orange-500", title: "Produkte", text: "Sparten zum Selbst-Dazubuchen" },
      { href: "/admin/einstellungen/kampagnen-automatik", icon: Bot, color: "bg-fuchsia-500", title: "Kampagnen-Automatik", text: "Budget, neue Kampagnen, Anzeigen auffrischen" },
      // Eintrag zur Optimierung je Werbekonto (Teil B, 18.11.2026): Übersicht, Freigabe, Autopilot
    ],
  },
  {
    title: "Kommunikation mit Kunden",
    items: [
      { href: "/admin/einstellungen/neuigkeiten", icon: Megaphone, color: "bg-violet-500", title: "Neuigkeiten", text: "Einträge für den Kundenbereich" },
      { href: "/admin/einstellungen/monatsberichte", icon: FileBarChart, color: "bg-blue-600", title: "Monatsberichte", text: "Automatischer Versand" },
      { href: "/admin/einstellungen/login", icon: LogIn, color: "bg-indigo-500", title: "Login-Seite", text: "Infokarten neben dem Login" },
      { href: "/admin/einstellungen/status", icon: Activity, color: "bg-emerald-500", title: "Status & Support", text: "Statusseite, Störungen, Support-Kontakt" },
      { href: "/admin/einstellungen/halteangebote", icon: Anchor, color: "bg-rose-500", title: "Halteangebote", text: "Angebote beim Kündigen je Grund" },
    ],
  },
  {
    title: "Vertrieb & Wachstum",
    items: [
      { href: "/admin/vertrieb/buchungsseite", icon: CalendarDays, color: "bg-blue-500", title: "Meine Buchungsseite", text: "Eigene Terminbuchung statt Calendly: Kalender, Zeiten, Termintypen" },
      { href: "/admin/vertrieb/import", icon: FileUp, color: "bg-violet-500", title: "Anbindungen", text: "Instantly, Calendly, Formulare, Import" },
      { href: "/admin/vertrieb/follow-ups#einstellungen", icon: Clock, color: "bg-teal-500", title: "Später-Follow-ups", text: "Automatik, Tageslimit, Buchungslink" },
      { href: "/admin/einstellungen/rechner", icon: Calculator, color: "bg-sky-500", title: "Rechner", text: "Break-even-Rechner für Interessenten" },
      { href: "/admin/einstellungen/empfehlungen", icon: Gift, color: "bg-emerald-600", title: "Kollegen empfehlen", text: "Prämie und Vorteil für Neukunden" },
    ],
  },
  {
    title: "Finanzen",
    items: [
      { href: "/admin/einstellungen/kosten", icon: Wallet, color: "bg-emerald-600", title: "Laufende Kosten", text: "Tools und eigene Werbung" },
      { href: "/admin/einstellungen/bank", icon: Landmark, color: "bg-teal-600", title: "Bank & Karten", text: "Ausgaben holen und zuordnen" },
      { href: "/admin/einstellungen/rechnungsangaben", icon: Receipt, color: "bg-slate-500", title: "Rechnungsangaben", text: "Steuernummer, Pflichtangaben, Stripe" },
    ],
  },
  {
    title: "Sicherheit",
    items: [
      { href: "/admin/einstellungen/sicherheit", icon: ShieldCheck, color: "bg-slate-600", title: "Sicherheit", text: "Zwei-Faktor-Login" },
      { href: "/admin/einstellungen/protokoll", icon: History, color: "bg-slate-400", title: "Änderungsprotokoll", text: "Wer hat wann was geändert" },
    ],
  },
];

export default async function EinstellungenPage() {
  const session = await requireAuth();
  const [me, taxNumber] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.userId }, select: { totpEnabledAt: true } }),
    loadTaxNumber(),
  ]);
  const support = supportConfig();
  const taxWarning = taxNumberWarning(taxNumber);
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6">
      <h1 className="mb-5 text-2xl font-semibold tracking-tight">Einstellungen</h1>
      {!me?.totpEnabledAt ? (
        <Link
          href="/admin/einstellungen/sicherheit"
          className="mb-4 flex items-center gap-3 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <ShieldCheck className="h-4 w-4 shrink-0" />
          <span className="flex-1">Zwei-Faktor-Login ist noch nicht eingerichtet.</span>
          <span className="font-semibold">Einrichten</span>
        </Link>
      ) : null}
      {taxWarning ? (
        <Link
          href="/admin/einstellungen/rechnungsangaben"
          className="mb-4 flex items-center gap-3 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <Receipt className="h-4 w-4 shrink-0" />
          <span className="flex-1">Auf Stripe-Rechnungen fehlt die Steuernummer.</span>
          <span className="font-semibold">Eintragen</span>
        </Link>
      ) : null}
      {!support.whatsapp && !support.email ? (
        <Link
          href="/admin/einstellungen/status"
          className="mb-4 flex items-center gap-3 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <LifeBuoy className="h-4 w-4 shrink-0" />
          <span className="flex-1">Im Hilfe-Chat fehlt der Support-Kontakt (WhatsApp, E-Mail).</span>
          <span className="font-semibold">Ansehen</span>
        </Link>
      ) : null}
      <div className="space-y-7">
        {GROUPS.map((g, gi) => (
          <section key={g.title} aria-labelledby={`gruppe-${gi}`}>
            <h2 id={`gruppe-${gi}`} className="mb-2 text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">
              {g.title}
            </h2>
            
            <ul className="divide-y divide-[color:var(--border)] overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white shadow-[var(--shadow-sm)]">
              {g.items.map((i) => (
                <li key={i.href}>
                  <Link href={i.href} className="flex min-h-[64px] items-center gap-4 px-5 py-3 transition hover:bg-[color:var(--surface-sunken)]">
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-white ${i.color}`}>
                      <i.icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{i.title}</span>
                      <span className="block text-sm text-[color:var(--muted)]">{i.text}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--border-strong)]" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
