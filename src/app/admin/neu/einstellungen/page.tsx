import Link from "next/link";
import {
  Anchor,
  BadgeEuro,
  Bot,
  Calculator,
  CalendarDays,
  ChevronRight,
  Clock,
  CreditCard,
  FileBarChart,
  Gift,
  Landmark,
  Layers,
  LifeBuoy,
  Megaphone,
  Receipt,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Seite } from "@/components/admin-neu/ui/seite";
import { Card, CardHeader } from "@/components/ui";
import { loadTaxNumber, taxNumberWarning } from "@/lib/invoice-footer";
import { NEU, SEITEN } from "@/lib/admin-neu/navigation";
import { prisma } from "@/lib/prisma";
import { supportConfig } from "@/lib/support";
import { requireAuth } from "@/lib/vertrieb/auth";

export const metadata = { title: "Einstellungen | performancegrowth Admin" };

// Einstellungen im neuen Admin: alles, was man einmal einrichtet und selten ändert, in 7 Gruppen wie in der Demo v2
// (docs/ux/admin-v2/demo.html, Konto & Sicherheit, je Rolle, Angebot & Produkte, Werbung, Finanzen). Technik und
// Einrichtung (Anbindungen, Vorlagen, Login-Seite, Status, Protokoll) liegen seit Admin v2 unter Werkzeuge.
// Die Seiten kommen aus navigation.ts (Feld `gruppe`); dazu zwei Seiten anderer Bereiche, die man auch hier sucht
// (Preise & Rechner unter Verkaufen › Marketing, Bank & Karten unter Geld). Oben die Warnhinweise der alten Übersicht.

const GRUPPEN = ["Konto & Sicherheit", "Verkaufen", "Kunden", "Angebot & Produkte", "Werbung", "Marketing", "Finanzen"] as const;

/** Kurzbeschreibung je Seite (Demo) und Symbol. */
const INFO: Record<string, { text: string; icon: LucideIcon }> = {
  "e-produkte": { text: "Sparten zum Selbst-Dazubuchen", icon: Layers },
  "e-tarife": { text: "Gesellschaften, Beitragsrechner", icon: BadgeEuro },
  "e-automatik": { text: "Optimierung, Budget, Anzeigen", icon: Bot },
  "e-followups": { text: "Freigabe, Tageslimit, Signatur", icon: Clock },
  "e-halte": { text: "Angebote beim Kündigen je Grund", icon: Anchor },
  "e-zahlung": { text: "Angenommen, aber nicht bezahlt", icon: CreditCard },
  "e-neuigkeiten": { text: "Einträge für den Kundenbereich", icon: Megaphone },
  "e-berichte": { text: "Einstufung, Versand", icon: FileBarChart },
  "e-buchung": { text: "Kalender, Termintypen, Zeiten", icon: CalendarDays },
  "e-empfehlen": { text: "Prämie und Vorteil für Neukunden", icon: Gift },
  "e-rechnung": { text: "Steuernummer, Stripe-Prüfung", icon: Receipt },
  "e-sicherheit": { text: "Zwei-Faktor-Login, Abmelden", icon: ShieldCheck },
  "e-admins": { text: "Zugänge zum Admin", icon: Users },
};

/** Seiten anderer Bereiche, die hier mit aufgeführt sind (nach `nach` einsortiert). */
const FREMD = [
  { gruppe: "Angebot & Produkte", nach: "e-produkte", titel: "Preise & Rechner", href: `${NEU}/marketing/webseite`, text: "Öffentlicher Rechner", icon: Calculator },
  { gruppe: "Finanzen", nach: "e-rechnung", titel: "Bank & Karten", href: `${NEU}/zahlen/kosten`, text: "Konten, Regeln, laufende Kosten", icon: Landmark },
];

type Eintrag = { titel: string; href: string; text: string; icon: LucideIcon };

function eintraege(gruppe: string): Eintrag[] {
  const out: Eintrag[] = [];
  for (const s of SEITEN.filter((x) => x.bereich === "einstellungen" && x.gruppe === gruppe)) {
    out.push({ titel: s.titel, href: s.pfad, text: INFO[s.view]?.text ?? "", icon: INFO[s.view]?.icon ?? Layers });
    for (const f of FREMD.filter((x) => x.gruppe === gruppe && x.nach === s.view)) out.push(f);
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
    // Status & Support liegt unter Werkzeuge, der Hinweis bleibt hier
    !support.whatsapp && !support.email ? { href: `${NEU}/einstellungen/status`, icon: LifeBuoy, text: "Im Hilfe-Chat fehlt der Support-Kontakt.", knopf: "Ansehen" } : null,
  ].filter((h) => h !== null);

  return (
    <Seite titel="Einstellungen" untertitel="Alles, was man einmal einrichtet und selten ändert.">
      {hinweise.length ? (
        <div className="mb-5 space-y-2" data-funktion="page--warnhinweise-zwei-faktor-aus-steuernummer-fehlt">
          {hinweise.map((h) => (
            <Hinweis key={h.href} {...h} />
          ))}
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2" data-funktion="page--uebersicht-aller-einstellungen-in-gruppen">
        {GRUPPEN.map((g) => (
          <Card key={g}>
            <CardHeader title={g} />
            <ul className="divide-y divide-[color:var(--border)]">
              {eintraege(g).map((e) => (
                <li key={e.href}>
                  <Link href={e.href} className="flex min-h-14 items-center gap-3 px-5 py-2.5 transition hover:bg-[color:var(--surface-sunken)]">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[color:var(--brand-soft)] text-[color:var(--brand)]">
                      <e.icon className="h-[18px] w-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{e.titel}</span>
                      <span className="block truncate text-sm text-[color:var(--muted)]">{e.text}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--border-strong)]" />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </Seite>
  );
}
