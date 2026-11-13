import Link from "next/link";
import { Activity, Bot, Calculator, FileBarChart, Layers, ChevronRight, FileUp, Gift, History, KeyRound, Landmark, LifeBuoy, LogIn, MessageCircle, Rocket, ShieldCheck, Wallet, Workflow } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { supportConfig } from "@/lib/support";
import { requireAuth } from "@/lib/vertrieb/auth";

export const metadata = { title: "Einstellungen | performancegrowth Admin" };

const ITEMS = [
  { href: "/admin/lead-eingang", icon: Workflow, color: "bg-blue-500", title: "Lead-Eingang", text: "Meta-Verbindung und Leadformulare zuordnen" },
  { href: "/admin/whatsapp/settings", icon: MessageCircle, color: "bg-emerald-500", title: "WhatsApp-Assistent", text: "Nummern, Vorlagen, Erstanschreiben je Kunde" },
  { href: "/admin/buyers", icon: KeyRound, color: "bg-amber-500", title: "Kunden-Logins", text: "Zugänge anlegen, Passwort, Vorschau" },
  { href: "/admin/vertrieb/import", icon: FileUp, color: "bg-violet-500", title: "Anbindungen", text: "Instantly, Calendly, Formulare, Import" },
  { href: "/admin/einstellungen/kosten", icon: Wallet, color: "bg-emerald-600", title: "Laufende Kosten", text: "Tools und eigene Werbung für Marge und Kundengewinnung" },
  { href: "/admin/einstellungen/bank", icon: Landmark, color: "bg-teal-600", title: "Bank & Karten", text: "Commerzbank und Amex: Ausgaben holen und als Kosten zuordnen" },
  { href: "/admin/einstellungen/rechner", icon: Calculator, color: "bg-sky-500", title: "Rechner", text: "Break-even-Rechner für Interessenten: Produkte, Quoten, Garantien" },
  { href: "/admin/einstellungen/einrichtung", icon: Rocket, color: "bg-blue-600", title: "Einrichtung neuer Kunden", text: "Business-ID für den Meta-Zugriff, Erklärvideos je Schritt" },
  { href: "/admin/einstellungen/produkte", icon: Layers, color: "bg-orange-500", title: "Produkte", text: "Welche Sparten Kunden selbst dazubuchen können" },
  { href: "/admin/monatsberichte", icon: FileBarChart, color: "bg-blue-600", title: "Monatsberichte", text: "Berichte an Kunden: Entwürfe prüfen, senden oder lieber anrufen" },
  { href: "/admin/einstellungen/kampagnen-automatik", icon: Bot, color: "bg-fuchsia-500", title: "Kampagnen-Automatik", text: "Budget bei Meta umstellen, Kampagne bei Produktbuchung, müde Anzeigen auffrischen" },
  { href: "/admin/einstellungen/empfehlungen", icon: Gift, color: "bg-emerald-600", title: "Kollegen empfehlen", text: "Empfehlungsprogramm: Prämie für Empfehler, Vorteil für Neukunden" },
  { href: "/admin/einstellungen/login", icon: LogIn, color: "bg-indigo-500", title: "Login-Seite", text: "Infokarte neben dem Login: Neuigkeiten und Hinweise für Kunden" },
  { href: "/admin/einstellungen/status", icon: Activity, color: "bg-emerald-500", title: "Status & Support", text: "Öffentliche Statusseite, Störungsmeldungen, Support-Kontakt im Hilfe-Chat" },
  { href: "/admin/einstellungen/sicherheit", icon: ShieldCheck, color: "bg-slate-600", title: "Sicherheit", text: "Zwei-Faktor-Login" },
  { href: "/admin/einstellungen/protokoll", icon: History, color: "bg-slate-400", title: "Änderungsprotokoll", text: "Wer hat wann was geändert" },
];

export default async function EinstellungenPage() {
  const session = await requireAuth();
  const me = await prisma.user.findUnique({ where: { id: session.userId }, select: { totpEnabledAt: true } });
  const support = supportConfig();
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
      {!support.whatsapp && !support.email ? (
        <Link
          href="/admin/einstellungen/status"
          className="mb-4 flex items-center gap-3 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <LifeBuoy className="h-4 w-4 shrink-0" />
          <span className="flex-1">Support-Kontakt fehlt: Im Hilfe-Chat erscheinen keine Knöpfe für WhatsApp oder E-Mail (SUPPORT_WHATSAPP_NUMBER, SUPPORT_EMAIL).</span>
          <span className="font-semibold">Ansehen</span>
        </Link>
      ) : null}
      <ul className="divide-y divide-[color:var(--border)] overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white shadow-[var(--shadow-sm)]">
        {ITEMS.map((i) => (
          <li key={i.href}>
            <Link href={i.href} className="flex min-h-[64px] items-center gap-4 px-5 py-3 transition hover:bg-[color:var(--surface-sunken)]">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-white ${i.color}`}>
                <i.icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{i.title}</span>
                <span className="block truncate text-sm text-[color:var(--muted)]">{i.text}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--border-strong)]" />
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
