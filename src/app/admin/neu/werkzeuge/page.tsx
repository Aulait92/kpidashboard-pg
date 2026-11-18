import Link from "next/link";
import {
  Activity,
  CalendarDays,
  ChevronRight,
  FileSearch,
  FlaskConical,
  History,
  Landmark,
  Layers,
  LifeBuoy,
  LogIn,
  MessageCircle,
  PlugZap,
  Receipt,
  Rocket,
  SlidersHorizontal,
  Smartphone,
  Target,
  type LucideIcon,
} from "lucide-react";
import { Seite } from "@/components/admin-neu/ui/seite";
import { Card, CardHeader } from "@/components/ui";
import { NEU, SEITEN } from "@/lib/admin-neu/navigation";
import { requireAuth } from "@/lib/vertrieb/auth";

export const metadata = { title: "Werkzeuge | performancegrowth Admin" };

// Werkzeuge (Admin v2, Paket A1; Demo docs/ux/admin-v2/demo.html #werkzeuge): Technik und Einrichtung, die man selten
// braucht, an einem Ort statt verteilt über die Rollen. Gruppen wie in der Demo. Die eigenen Seiten des Bereichs kommen
// aus navigation.ts (Feld `gruppe`, Adressen bleiben unter /admin/neu/einstellungen/…); dazu Links auf Werkzeuge, die
// heute in einer Rolle oder in der Kundenakte liegen (Weg dorthin als zweite Zeile). Zusammenlegen folgt in Paket A5.

const GRUPPEN: { titel: string; icon: LucideIcon }[] = [
  { titel: "Zustand", icon: Activity },
  { titel: "Verbindungen & Importe", icon: PlugZap },
  { titel: "Meta & Werbung", icon: Target },
  { titel: "WhatsApp", icon: MessageCircle },
  { titel: "Inhalte & Einrichtung", icon: Rocket },
  { titel: "Protokoll & Testdaten", icon: History },
];

/** Kurzbeschreibung und Symbol der eigenen Seiten (Ansicht aus navigation.ts). */
const INFO: Record<string, { text: string; icon: LucideIcon }> = {
  "w-zustand": { text: "Jobs, Meta, Stripe, Bank, LinkedIn, WhatsApp auf einen Blick", icon: Activity },
  "e-status": { text: "Störung melden, Support-Kontakt", icon: LifeBuoy },
  "e-anbindungen": { text: "Instantly, Meta, LinkedIn, Agenturliste", icon: PlugZap },
  "e-vorlagen": { text: "Support-Nummer, A/B-Tests der Vorlagen", icon: MessageCircle },
  "w-gebuehren": { text: "WhatsApp-Kosten je Kunde, Monat und Vormonat", icon: Receipt },
  "e-login": { text: "Infokarten neben dem Kunden-Login", icon: LogIn },
  "e-einrichtung": { text: "Business-ID, Erklärvideos, Hilfetermin", icon: Rocket },
  "e-protokoll": { text: "Wer hat wann was geändert", icon: History },
};

type Eintrag = { titel: string; href: string; text: string; icon: LucideIcon };

/** Werkzeuge, die in einer Rolle oder Akte liegen (Adresse bleibt, hier nur der Weg dorthin). */
const FREMD: (Eintrag & { gruppe: string })[] = [
  { gruppe: "Verbindungen & Importe", titel: "Bank verbinden", href: `${NEU}/zahlen/kosten`, text: "Geld › Kosten & Bank", icon: Landmark },
  { gruppe: "Verbindungen & Importe", titel: "Vertriebskalender", href: `${NEU}/vertrieb/termine`, text: "Verkaufen › Termine", icon: CalendarDays },
  { gruppe: "Meta & Werbung", titel: "Formular-Zuordnungen", href: `${NEU}/leads`, text: "Liefern › Lead-Eingang", icon: Layers },
  { gruppe: "Meta & Werbung", titel: "Trockenlauf und Optimierung", href: `${NEU}/leads/werbekonten`, text: "Liefern › Werbekonten", icon: FlaskConical },
  { gruppe: "Meta & Werbung", titel: "Werbekonto und CAPI je Kunde", href: `${NEU}/kunden`, text: "Kundenakte › Kampagne & Leads", icon: SlidersHorizontal },
  { gruppe: "WhatsApp", titel: "Nummer und Vorlagen je Kunde", href: `${NEU}/kunden`, text: "Kundenakte › WhatsApp", icon: Smartphone },
  { gruppe: "Inhalte & Einrichtung", titel: "Rechnungsfußzeile, Stripe prüfen", href: `${NEU}/einstellungen/rechnungsangaben`, text: "Einstellungen › Rechnungsangaben", icon: Receipt },
  { gruppe: "Protokoll & Testdaten", titel: "Testdaten und Testkunde", href: `${NEU}/kunden`, text: "Kundenakte › Übersicht", icon: FileSearch },
];

function eintraege(gruppe: string): Eintrag[] {
  const eigene = SEITEN.filter((s) => s.bereich === "werkzeuge" && s.gruppe === gruppe).map((s) => ({
    titel: s.titel,
    href: s.pfad,
    text: INFO[s.view]?.text ?? "",
    icon: INFO[s.view]?.icon ?? PlugZap,
  }));
  return [...eigene, ...FREMD.filter((f) => f.gruppe === gruppe)];
}

export default async function WerkzeugePage() {
  await requireAuth();
  return (
    <Seite titel="Werkzeuge" untertitel="Technik und Einrichtung, selten gebraucht.">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {GRUPPEN.map((g) => (
          <Card key={g.titel}>
            <CardHeader title={g.titel} />
            <ul className="divide-y divide-[color:var(--border)]">
              {eintraege(g.titel).map((e) => (
                <li key={`${e.href}|${e.titel}`}>
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
