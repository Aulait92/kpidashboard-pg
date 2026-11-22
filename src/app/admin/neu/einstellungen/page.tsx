import Link from "next/link";
import {
  Activity,
  Anchor,
  BadgeEuro,
  Bot,
  Calculator,
  CalendarDays,
  Clock,
  CreditCard,
  FileBarChart,
  Gift,
  History,
  Landmark,
  Layers,
  LifeBuoy,
  LogIn,
  Mail,
  Megaphone,
  MessageCircle,
  PlugZap,
  Receipt,
  Rocket,
  Share2,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { LinkZeile } from "@/components/admin-neu/einstellungen/rahmen";
import { Seite } from "@/components/admin-neu/ui/seite";
import { loadTaxNumber, taxNumberWarning } from "@/lib/invoice-footer";
import { NEU, SEITEN } from "@/lib/admin-neu/navigation";
import { prisma } from "@/lib/prisma";
import { supportConfig } from "@/lib/support";
import { requireAuth } from "@/lib/vertrieb/auth";

export const metadata = { title: "Einstellungen | performancegrowth Admin" };

// Einstellungen (UX-Umbau 20.11.2026): EINE Seite für alles, was man einrichtet und selten ändert. Werkzeuge ist hier als
// Gruppe „Technik“ aufgegangen. Aufbau wie /buyer/einstellungen: Gruppen mit kleiner Überschrift, je Seite eine Zeile
// (Symbol, Titel, ein Satz, Pfeil), keine Hauptaktion. Gruppen heißen wie die Rollen der Seitenleiste, damit man die
// Einstellung dort sucht, wo man sonst arbeitet. Seiten aus navigation.ts (Feld `gruppe`); dazu Einstellungen, die auf
// Alltagsseiten anderer Rollen eingeklappt liegen (LinkedIn, Rechner, Bank-Regeln). Oben nur Warnhinweise, wenn nötig.

const GRUPPEN = ["Konto & Sicherheit", "Verkaufen", "Angebot & Produkte", "Betreuen", "Liefern", "Geld", "Technik"] as const;

/** Ein Satz und Symbol je Seite (Ansicht aus navigation.ts). */
const INFO: Record<string, { text: string; icon: LucideIcon }> = {
  "e-sicherheit": { text: "Zwei-Faktor-Login, überall abmelden", icon: ShieldCheck },
  "e-admins": { text: "Wer Zugang zum Admin hat", icon: Users },
  "e-buchung": { text: "Kalender, Termintypen, Zeiten", icon: CalendarDays },
  "e-followups": { text: "Freigabe, Tageslimit, Signatur", icon: Clock },
  "e-nachrichten": { text: "Vorschau aller automatischen Nachrichten", icon: Mail },
  "e-empfehlen": { text: "Prämie und Vorteil für Neukunden", icon: Gift },
  "e-produkte": { text: "Sparten zum Selbst-Dazubuchen", icon: Layers },
  "e-tarife": { text: "Gesellschaften, Beitragsrechner", icon: BadgeEuro },
  "e-neuigkeiten": { text: "Einträge für den Kundenbereich", icon: Megaphone },
  "e-berichte": { text: "Einstufung, Versand", icon: FileBarChart },
  "e-halte": { text: "Angebote beim Kündigen je Grund", icon: Anchor },
  "e-einrichtung": { text: "Business-ID, Erklärvideos, Hilfetermine", icon: Rocket },
  "e-login": { text: "Infokarten neben dem Kunden-Login", icon: LogIn },
  "e-automatik": { text: "Optimierung, Budget, müde Anzeigen", icon: Bot },
  "e-rechnung": { text: "Steuernummer, Stripe-Prüfung", icon: Receipt },
  "e-zahlung": { text: "Angenommen, aber nicht bezahlt", icon: CreditCard },
  "w-zustand": { text: "Prüfungen, Statusseite", icon: Activity },
  "e-anbindungen": { text: "Instantly, Meta, LinkedIn, CSV", icon: PlugZap },
  "e-vorlagen": { text: "Support-Nummer, Meta-Gebühren", icon: MessageCircle },
  "e-protokoll": { text: "Wer hat wann was geändert", icon: History },
};

type Eintrag = { titel: string; href: string; text: string; icon: LucideIcon };

/** Einstellungen, die auf Alltagsseiten anderer Rollen eingeklappt liegen (nach `nach` einsortiert). */
const FREMD: (Eintrag & { nach: string })[] = [
  { nach: "e-empfehlen", titel: "LinkedIn", href: `${NEU}/marketing`, text: "Themen, Zielgruppe, Uhrzeiten", icon: Share2 },
  { nach: "e-tarife", titel: "Preise & Rechner", href: `${NEU}/marketing/webseite`, text: "Öffentlicher Rechner auf der Webseite", icon: Calculator },
  { nach: "e-zahlung", titel: "Bank & Regeln", href: `${NEU}/zahlen/kosten`, text: "Konten, Regeln für Ausgaben", icon: Landmark },
];

function eintraege(gruppe: string): Eintrag[] {
  const out: Eintrag[] = [];
  for (const s of SEITEN.filter((x) => x.bereich === "einstellungen" && x.gruppe === gruppe)) {
    out.push({ titel: s.titel, href: s.pfad, text: INFO[s.view]?.text ?? s.untertitel ?? "", icon: INFO[s.view]?.icon ?? Layers });
    out.push(...FREMD.filter((f) => f.nach === s.view));
  }
  return out;
}

function Hinweis({ href, icon: Icon, text, knopf }: { href: string; icon: LucideIcon; text: string; knopf: string }) {
  return (
    <Link href={href} className="flex min-h-12 items-center gap-3 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 hover:bg-amber-100">
      <Icon className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1">{text}</span>
      <span className="shrink-0 font-semibold">{knopf}</span>
    </Link>
  );
}

export default async function EinstellungenPage() {
  const session = await requireAuth();
  const [me, taxNumber] = await Promise.all([prisma.user.findUnique({ where: { id: session.userId }, select: { totpEnabledAt: true } }), loadTaxNumber()]);
  const support = supportConfig();
  const hinweise = [
    !me?.totpEnabledAt ? { href: `${NEU}/einstellungen/sicherheit`, icon: ShieldCheck, text: "Zwei-Faktor-Login ist noch nicht eingerichtet.", knopf: "Einrichten" } : null,
    taxNumberWarning(taxNumber) ? { href: `${NEU}/einstellungen/rechnungsangaben`, icon: Receipt, text: "Auf Stripe-Rechnungen fehlt die Steuernummer.", knopf: "Eintragen" } : null,
    !support.whatsapp && !support.email ? { href: `${NEU}/einstellungen/status`, icon: LifeBuoy, text: "Im Hilfe-Chat fehlt der Support-Kontakt.", knopf: "Ansehen" } : null,
  ].filter((h) => h !== null);

  return (
    <Seite titel="Einstellungen">
      <div className="mx-auto max-w-2xl lg:max-w-none">
        {hinweise.length ? (
          <div className="mb-6 space-y-2 lg:max-w-2xl" data-funktion="page--warnhinweise-zwei-faktor-aus-steuernummer-fehlt">
            {hinweise.map((h) => (
              <Hinweis key={h.href} {...h} />
            ))}
          </div>
        ) : null}
        <div className="gap-6 lg:columns-2" data-funktion="page--uebersicht-aller-einstellungen-in-gruppen" data-einstellungen="">
          {GRUPPEN.map((g) => (
            <section key={g} id={g === "Technik" ? "technik" : undefined} className="mb-6 break-inside-avoid scroll-mt-20" data-gruppe={g}>
              <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">{g}</h2>
              <ul className="divide-y divide-[color:var(--border)] overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white shadow-[var(--shadow-sm)]">
                {eintraege(g).map((e) => (
                  <LinkZeile key={e.href} href={e.href} icon={e.icon} titel={e.titel} text={e.text} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </Seite>
  );
}
