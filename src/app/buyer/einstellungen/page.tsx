import Link from "next/link";
import { redirect } from "next/navigation";
import { BellRing, CalendarDays, Eye, Image as ImageIcon, ChevronRight, CreditCard, Gift, Mail, MessageSquareText, Percent, Send, ShieldCheck, Sparkles, UsersRound } from "lucide-react";
import { PageHeader } from "@/components/buyer-shell";
import { getBuyerContext } from "@/lib/buyer-context";
import { loadReferralSettings } from "@/lib/kollegen";
import { canOpenReferralPage, referralTileText } from "@/lib/kollegen-shared";
import { prisma } from "@/lib/prisma";
import { AnalyseSchalter } from "@/components/nutzungsanalyse";
import { asAnalyseStatus } from "@/lib/nutzungsanalyse";
import { analysePseudonym } from "@/lib/nutzungsanalyse-server";
import { PolicenFreischaltungKarte } from "@/components/policen-freischaltung-karte";
import { BeratungsdokuSchalter } from "@/components/beratungsdoku-schalter";
import { DATENNUTZUNG_EINTRAG, DATENNUTZUNG_PFAD, eintragText } from "@/lib/datennutzung";
import { ladeStand as ladeDatennutzung } from "@/lib/datennutzung-server";
import { SUPPORT_ZUGRIFFE_PFAD, supportZugriffeFuer } from "@/lib/support-zugriff";

export const dynamic = "force-dynamic";
export const metadata = { title: "Einstellungen | performancegrowth" };

type Item = { href: string; icon: typeof CreditCard; color: string; title: string; text: string; badge?: string };

// Einstellungen gebündelt statt langer Liste im Profilmenü (Ole, 13.11.2026) – wie im Admin-Bereich.
export default async function EinstellungenPage() {
  const ctx = await getBuyerContext();
  if (!ctx) redirect("/login");
  const owner = ctx.teamRole !== "advisor";
  // Kachel „Kollegen empfehlen“: gleiche Bedingung wie die Seite selbst, Untertitel aus der eingestellten Prämie
  const referralText = canOpenReferralPage(ctx) ? referralTileText(await loadReferralSettings()) : null;
  // Beratungsdokumentation (Paket B): Schalter nur für Inhaber mit Software-Paket
  const kunde = owner ? await prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { plan: true, beratungsdokuAn: true } }) : null;
  const bdSchalter = kunde && kunde.plan !== "service" ? { an: kunde.beratungsdokuAn } : null;
  const analyse = ctx.userId && !ctx.preview ? asAnalyseStatus((await prisma.user.findUnique({ where: { id: ctx.userId }, select: { analyseEinwilligung: true } }))?.analyseEinwilligung) : null;
  // „KI-Hilfe und Anzeigenlernen“ (lib/datennutzung.ts): nur Inhaber von Software-Kunden; führt zur Detailseite mit
  // dem ganzen Text, „Widersprechen“ und „Widerspruch zurücknehmen“
  const datennutzung = await ladeDatennutzung(ctx).catch(() => null);
  // Support-Zugriffe (lib/support-zugriff.ts): Protokoll, wann unser Support ein Dokument im Chat geöffnet hat
  const zugriffe = ctx.userId && !ctx.preview ? await supportZugriffeFuer(ctx, 1).catch(() => []) : [];
  const zugriffText = zugriffe[0]
    ? `Zuletzt am ${new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(zugriffe[0].createdAt)}`
    : "Bisher kein Zugriff auf Ihre Dokumente";
  const groups: { title: string; items: Item[] }[] = [
    {
      title: "Mein Konto",
      items: [
        ...(owner
          ? [
              { href: "/buyer/konto", icon: CreditCard, color: "bg-blue-600", title: "Konto & Rechnungen", text: "Vertrag, Zahlung, Rechnungen und Ihre Daten" },
              { href: "/buyer/team", icon: UsersRound, color: "bg-violet-500", title: "Team", text: "Berater einladen und Leads verteilen" },
            ]
          : []),
        { href: "/buyer/konto/sicherheit", icon: ShieldCheck, color: "bg-slate-600", title: "Anmeldung & Sicherheit", text: "Passwort und Anmeldung" },
      ],
    },
    // UX-Runde 19.11.2026: „Arbeiten“ (7 Zeilen) in zwei Gruppen nach Aufgabe, Häufiges zuerst; „Mehr“ steht ganz unten
    {
      title: "Kunden ansprechen",
      items: [
        // Assistent (Ole, 17.11.2026, Paket M9): E-Mails in Ihrem Namen und die WhatsApp-Vorlagen an einer Stelle
        { href: "/buyer/einstellungen/assistent", icon: MessageSquareText, color: "bg-emerald-500", title: "Assistent", text: "WhatsApp-Nachrichten und E-Mails, die in Ihrem Namen rausgehen" },
        { href: "/buyer/einstellungen/erinnerungen", icon: BellRing, color: "bg-orange-500", title: "Erinnerungen & Aufgaben", text: "E-Mail bei neuen Leads, tägliche Erinnerung, Aufgaben nach dem Abschluss" },
        { href: "/buyer/postfach", icon: Mail, color: "bg-blue-500", title: "E-Mail-Postfach", text: "Eigenes Postfach verbinden, Signatur, E-Mail-Vorlagen" },
      ],
    },
    {
      title: "Termine und Zahlen",
      items: [
        { href: "/buyer/kalender", icon: CalendarDays, color: "bg-emerald-600", title: "Mein Kalender", text: "Kalender verbinden und Zeiten für Termine festlegen" },
        ...(owner ? [{ href: "/buyer/einstellungen/branding", icon: ImageIcon, color: "bg-teal-500", title: "Präsentation", text: "Ihr Logo auf der Beratungspräsentation, als Makler der Hinweis zur Marktauswahl" }] : []),
        { href: "/buyer/provisionen", icon: Percent, color: "bg-amber-500", title: "Meine Provisionen", text: "Ihre Sätze, daraus rechnet die App Provision und Zahlen" },
        { href: "/buyer/einstellungen/meta", icon: Send, color: "bg-indigo-500", title: "Rückmeldung an Meta", text: "Meta lernt aus Ihren Ergebnissen, welche Leads abschließen" },
      ],
    },
    {
      title: "Mehr",
      items: [
        ...(referralText ? [{ href: "/buyer/empfehlen", icon: Gift, color: "bg-rose-500", title: "Kollegen empfehlen", text: referralText }] : []),
      ],
    },
  ];

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-6">
      <PageHeader back="/buyer" title="Einstellungen" />
      <div className="space-y-6" data-einstellungen>
        {groups
          .filter((g) => g.items.length && g.title !== "Mehr")
          .map((g) => (
            <section key={g.title}>
              <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">{g.title}</h2>
              <ul className="divide-y divide-[color:var(--border)] overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white shadow-[var(--shadow-sm)]">
                {g.items.map((i) => (
                  <li key={i.href}>
                    <Zeile i={i} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        {bdSchalter ? (
          <section>
            <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">Beratung</h2>
            <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white shadow-[var(--shadow-sm)]" id="beratungsdoku">
              <BeratungsdokuSchalter an={bdSchalter.an} darf={!ctx.preview} />
            </div>
          </section>
        ) : null}
        {ctx.userId && !ctx.preview ? (
          <section>
            <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">Datenschutz</h2>
            {datennutzung?.darf ? (
              <div className="mb-3 overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white shadow-[var(--shadow-sm)]" data-einstellungen-datennutzung>
                <Zeile i={{ href: DATENNUTZUNG_PFAD, icon: Sparkles, color: "bg-sky-600", title: DATENNUTZUNG_EINTRAG, text: eintragText(datennutzung.widerspruch) }} />
              </div>
            ) : null}
            <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white shadow-[var(--shadow-sm)]">
              <AnalyseSchalter status={analyse} pseudonym={ctx.userId ? analysePseudonym(ctx.userId) : null} />
            </div>
            <div className="mt-3 overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white shadow-[var(--shadow-sm)]" data-einstellungen-support-zugriffe>
              <Zeile i={{ href: SUPPORT_ZUGRIFFE_PFAD, icon: Eye, color: "bg-slate-500", title: "Support-Zugriffe", text: zugriffText }} />
            </div>
            <PolicenFreischaltungKarte ctx={ctx} ort="einstellungen" className="mt-3 overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white shadow-[var(--shadow-sm)]" />
          </section>
        ) : null}
        {groups
          .filter((g) => g.items.length && g.title === "Mehr")
          .map((g) => (
            <section key={g.title}>
              <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">{g.title}</h2>
              <ul className="divide-y divide-[color:var(--border)] overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white shadow-[var(--shadow-sm)]">
                {g.items.map((i) => (
                  <li key={i.href}>
                    <Zeile i={i} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        <p className="flex flex-wrap gap-x-4 px-1 text-sm text-[color:var(--muted)] [&>a]:inline-flex [&>a]:min-h-10 [&>a]:items-center">
          <a href="https://performancegrowth.de/impressum" target="_blank" rel="noopener noreferrer" className="hover:underline">Impressum</a>
          <a href="https://performancegrowth.de/datenschutz" target="_blank" rel="noopener noreferrer" className="hover:underline">Datenschutz</a>
          <a href="/sicherheit" target="_blank" rel="noopener" className="hover:underline">Sicherheit</a>
        </p>
      </div>
    </main>
  );
}

/** Eine Zeile der Einstellungen: Symbol, Titel, ein Satz, Pfeil. */
function Zeile({ i }: { i: Item }) {
  return (
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
  );
}
