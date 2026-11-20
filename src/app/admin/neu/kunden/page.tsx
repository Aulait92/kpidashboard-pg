import Link from "next/link";
import { connection } from "next/server";
import { ChevronRight, Users } from "lucide-react";
import { Badge, ButtonLink, Card, EmptyState } from "@/components/ui";
import { Seite } from "@/components/admin-neu/ui/seite";
import { Aufmerksamkeit } from "@/components/admin-neu/ui/aufmerksamkeit";
import { punkteDerRolle } from "@/lib/admin-neu/rollen-server";
import { Chips } from "@/components/admin-neu/kunden/chips";
import { naechsterSchrittWarnung, packageLabel, testKennung } from "@/lib/customer-package";
import { prisma } from "@/lib/prisma";
import { nowMs } from "@/lib/now";
import { onboardingProgressFor } from "@/lib/onboarding";
import { CUSTOMER_LABEL } from "@/lib/vertrieb/crm";
import { ensureSource } from "@/lib/vertrieb/source";
import { nextStepRatesByCustomer, type NextStepRate } from "@/lib/lead-next-step-server";
import { requireAuth } from "@/lib/vertrieb/auth";
import type { Prisma } from "@/generated/prisma/client";

export const metadata = { title: "Kunden | performancegrowth Admin" };

const eur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const tag = (d: Date) => d.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "2-digit" });
const AUFBEWAHRUNG: Record<string, string> = { "24m": "24 Monate", "3m": "3 Monate", sofort: "sofort" };

// Status-Filter (Umbau 20.11.2026): vier Chips, Standard „Aktiv“ (inkl. Testphase und Einrichtung), Seltenes unter „Mehr“.
// Ersetzen die frühere Kunden-Pipeline (Vertrag, Onboarding, Test, Aktiv, Pausiert, Gekündigt) und die Filter der alten
// Liste (Zahlung offen, Onboarding, Pausiert, Ruhend). Ruhende, interne und Test-Konten stehen nur in ihrem Filter.
const FILTER = [
  { key: "", label: "Aktiv" },
  // Zahlung offen, Einrichtung wartet auf uns, Nächster Schritt zu selten, Kündigung läuft
  { key: "hilfe", label: "Braucht Hilfe" },
  { key: "pausiert", label: "Pausiert" },
  { key: "alle", label: "Alle" },
] as const;
const MEHR = [
  { key: "einrichtung", label: "In Einrichtung" },
  { key: "test", label: "Testphase" },
  { key: "zahlung", label: "Zahlung offen" },
  { key: "gekuendigt", label: "Gekündigt" },
  { key: "ruhend", label: "Ruhend" },
  // Interne Konten (plan „internal“, z. B. Oles Testkunde) und Testkunden; sonst ausgeblendet (Ole, 17.11.2026)
  { key: "intern", label: "Intern/Test" },
] as const;
type FilterKey = (typeof FILTER)[number]["key"] | (typeof MEHR)[number]["key"];
const ALLE_FILTER: readonly { key: FilterKey; label: string }[] = [...FILTER, ...MEHR];
const INTERN_ODER_TEST: Prisma.CustomerWhereInput = { OR: [{ plan: "internal" }, { isTest: true }], dataDeletedAt: null };

type Zeile = {
  key: string;
  href: string;
  name: string;
  /** Genau ein Abzeichen je Zeile: Zahlung offen, Pausiert, Endet, Einrichtung, Nächster Schritt, Test, Testphase */
  badge: { label: string; tone: "success" | "warning" | "danger" | "brand" | "neutral" } | null;
  /** Zeile 2: Paket · Monatsbetrag (höchstens zwei Angaben) */
  unter: string;
  /** Rechts: Leads der letzten 30 Tage (null bei Kontakten ohne Konto und ruhenden Konten) */
  leads: number | null;
  passt: (k: FilterKey) => boolean;
};

// Betreuen › Kunden: alle Kunden mit einem Status-Abzeichen und Paket, Betrag, Leads; Klick öffnet die Kundenakte.
export default async function KundenListe({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  await connection();
  const session = await requireAuth();
  // Startseite der Rolle Betreuen (Admin v2): oben „Braucht Aufmerksamkeit“, parallel zur Kundenliste geladen
  const punkteLaden = punkteDerRolle(session.userId, "betreuen");
  const roh = (await searchParams).filter ?? "";
  const filter: FilterKey = ALLE_FILTER.some((f) => f.key === roh) ? (roh as FilterKey) : "";

  // Wie die frühere Kunden-Pipeline: gewonnene Kontakte ohne Kunden-Stufe übernehmen, Kanal vorschlagen
  await prisma.salesContact.updateMany({ where: { stage: "GEWONNEN", customerStage: null }, data: { customerStage: "VERTRAG" } });
  for (const { id } of await prisma.salesContact.findMany({ where: { customerStage: { not: null }, customerSource: null }, select: { id: true } })) {
    await ensureSource(id);
  }

  const jetzt = nowMs();
  const seit = new Date(jetzt - 30 * 24 * 60 * 60 * 1000);
  const auswahl = {
    id: true,
    name: true,
    isTest: true,
    plan: true,
    retainerMonthly: true,
    paymentOverdueSince: true,
    cancelEffectiveAt: true,
    onboarding: { select: { id: true } },
    salesContact: { select: { customerStage: true, monthlyValue: true } },
    pauses: { where: { status: "active" }, select: { kind: true, endsAt: true }, take: 1 },
    _count: { select: { leads: { where: { createdAt: { gte: seit } } } } },
  } satisfies Prisma.CustomerSelect;
  const [kunden, interne, ruhende, ohneKonto] = await Promise.all([
    prisma.customer.findMany({
      where: { plan: { not: "internal" }, isTest: false, archived: false, OR: [{ dormantSince: null }, { dataDeletedAt: { not: null } }] },
      orderBy: { name: "asc" },
      select: auswahl,
    }),
    prisma.customer.findMany({ where: INTERN_ODER_TEST, orderBy: { name: "asc" }, select: auswahl }),
    prisma.customer.findMany({
      where: { plan: { not: "internal" }, dormantSince: { not: null }, dataDeletedAt: null },
      orderBy: { dormantSince: "desc" },
      select: { id: true, name: true, isTest: true, dormantSince: true, deleteAfter: true, retentionChoice: true },
    }),
    // Kontakte mit Kunden-Stufe, aber noch ohne Kundenkonto (z. B. Vertrag versendet)
    prisma.salesContact.findMany({
      where: { customerStage: { not: null }, customerId: null },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, customerStage: true, monthlyValue: true },
    }),
  ]);
  const alle = [...new Map([...kunden, ...interne].map((c) => [c.id, c])).values()];
  const [fortschritt, schritte] = await Promise.all([
    onboardingProgressFor(alle.filter((c) => c.onboarding).map((c) => c.id)),
    nextStepRatesByCustomer(alle.map((c) => c.id)).catch(() => new Map<string, NextStepRate>()),
  ]);

  // Zeile eines Kundenkontos; Intern/Test-Konten erscheinen nur im Filter „Intern/Test“
  const kundeZeile = (c: (typeof kunden)[number], nurIntern = false): Zeile => {
    const ob = fortschritt.get(c.id);
    const stufe = c.salesContact?.customerStage ?? null;
    const pause = c.pauses[0];
    const einrichtung = (!!ob && !ob.live) || stufe === "VERTRAG" || stufe === "ONBOARDING";
    const pausiert = !!pause || stufe === "PAUSIERT";
    const gekuendigt = stufe === "GEKUENDIGT" || !!c.cancelEffectiveAt;
    const kuendigungLaeuft = !!c.cancelEffectiveAt && c.cancelEffectiveAt.getTime() > jetzt;
    const warnung = naechsterSchrittWarnung(c, schritte.get(c.id));
    const hilfe = !!c.paymentOverdueSince || !!warnung || kuendigungLaeuft || (!!ob && !ob.live && ob.waitingYou > 0);
    const mrr = c.salesContact?.monthlyValue ?? (c.retainerMonthly ? Number(c.retainerMonthly) : null);
    const kennung = testKennung(c);
    const badge: Zeile["badge"] = c.paymentOverdueSince
      ? { label: "Zahlung offen", tone: "danger" }
      : pause
        ? { label: pause.kind === "dunning" ? "Pausiert (Zahlung)" : pause.endsAt ? `Pausiert bis ${tag(pause.endsAt)}` : "Pausiert", tone: "warning" }
        : kuendigungLaeuft
          ? { label: `Endet ${tag(c.cancelEffectiveAt!)}`, tone: "warning" }
          : ob && !ob.live
            ? { label: `Einrichtung ${ob.percent} %`, tone: "brand" }
            : warnung
              ? { label: warnung, tone: "danger" }
              : kennung
                ? { label: kennung, tone: "neutral" }
                : stufe === "TEST"
                  ? { label: "Testphase", tone: "brand" }
                  : stufe === "GEKUENDIGT"
                    ? { label: "Gekündigt", tone: "neutral" }
                    : null;
    return {
      key: c.id,
      href: `/admin/neu/kunden/${c.id}`,
      name: c.name.replace(/^Allianz\s+/i, ""),
      badge,
      unter: [packageLabel(c), mrr ? `${eur(mrr)}/Monat` : null].filter(Boolean).join(" · "),
      leads: c._count.leads,
      passt: (k) =>
        nurIntern
          ? k === "intern"
          : k === "alle" ||
            (k === "" && !pausiert && stufe !== "GEKUENDIGT") ||
            (k === "hilfe" && hilfe) ||
            (k === "einrichtung" && einrichtung) ||
            (k === "test" && stufe === "TEST") ||
            (k === "pausiert" && pausiert) ||
            (k === "gekuendigt" && gekuendigt) ||
            (k === "zahlung" && !!c.paymentOverdueSince),
    };
  };
  const internZeilen = interne.map((c) => kundeZeile(c, true));

  const zeilen: Zeile[] = [
    ...kunden.map((c) => kundeZeile(c)),
    ...ohneKonto.map(
      (k): Zeile => ({
        key: `kontakt-${k.id}`,
        href: `/admin/neu/vertrieb/kontakte/${k.id}`,
        name: k.name,
        badge: k.customerStage ? { label: CUSTOMER_LABEL[k.customerStage], tone: "neutral" } : null,
        unter: ["noch kein Kundenkonto", k.monthlyValue ? `${eur(k.monthlyValue)}/Monat` : null].filter(Boolean).join(" · "),
        leads: null,
        passt: (f) =>
          f === "alle" ||
          (f === "" && k.customerStage !== "PAUSIERT" && k.customerStage !== "GEKUENDIGT") ||
          (f === "einrichtung" && (k.customerStage === "VERTRAG" || k.customerStage === "ONBOARDING")) ||
          (f === "test" && k.customerStage === "TEST") ||
          (f === "pausiert" && k.customerStage === "PAUSIERT") ||
          (f === "gekuendigt" && k.customerStage === "GEKUENDIGT"),
      }),
    ),
  ];
  const ruhendZeilen: Zeile[] = ruhende.map((r) => ({
    key: r.id,
    href: `/admin/neu/kunden/${r.id}/abrechnung`,
    name: r.name.replace(/^Allianz\s+/i, ""),
    badge: { label: r.isTest ? "Ruhend · Test" : "Ruhend", tone: "neutral" },
    unter: [
      `ruht seit ${tag(r.dormantSince!)}`,
      r.deleteAfter ? `Löschung ${tag(r.deleteAfter)}` : r.retentionChoice ? `Aufbewahrung ${AUFBEWAHRUNG[r.retentionChoice] ?? r.retentionChoice}` : null,
    ]
      .filter(Boolean)
      .join(" · "),
    leads: null,
    passt: (k) => k === "ruhend",
  }));

  const anzahl = (k: FilterKey) => (k === "ruhend" ? ruhendZeilen.length : k === "intern" ? internZeilen.length : zeilen.filter((z) => z.passt(k)).length);
  const sichtbar = filter === "ruhend" ? ruhendZeilen : filter === "intern" ? internZeilen : zeilen.filter((z) => z.passt(filter));
  const mrrAktiv = kunden.reduce((a, c) => a + (c.salesContact?.customerStage === "AKTIV" ? (c.salesContact.monthlyValue ?? 0) : 0), 0);
  const href = (k: string) => (k ? `/admin/neu/kunden?filter=${k}` : "/admin/neu/kunden");

  return (
    <Seite titel="Betreuen" reiter="betreuen" untertitel={`${kunden.length} Kunden · ${eur(mrrAktiv)} Monatsumsatz aktiv`}>
      <Aufmerksamkeit punkte={await punkteLaden} />
      <div className="space-y-4">
        <div data-funktion="page-filters--filter-alle-zahlung-offen-onboarding-pausiert page-filters--filter-intern-test-interne-konten-und-testkunden actions-dragcustomer--kunden-pipeline-vertrag-onboarding-test-aktiv">
          <Chips
            label="Status"
            eintraege={FILTER.map((f) => ({ label: f.label, href: href(f.key), anzahl: anzahl(f.key), aktiv: f.key === filter, immer: !f.key || f.key === "alle" }))}
            mehr={MEHR.map((f) => ({ label: f.label, href: href(f.key), anzahl: anzahl(f.key), aktiv: f.key === filter }))}
          />
        </div>

        <Card>
          <ul
            className="divide-y divide-[color:var(--border)]"
            data-funktion="page--kundenliste-mit-status-test-zahlung-offen-pause page--uebersicht-aller-kunden-mit-assistent-liste page--ruhende-konten-mit-loeschdatum-aufbewahrung"
          >
            {sichtbar.map((z) => (
              <li key={z.key}>
                <Link href={z.href} className="flex min-h-14 items-center gap-3 px-4 py-3 transition hover:bg-[color:var(--surface-sunken)] sm:px-5">
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-medium">{z.name}</span>
                      {z.badge ? (
                        <span className="shrink-0">
                          <Badge tone={z.badge.tone}>{z.badge.label}</Badge>
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-[color:var(--muted)]">{z.unter}</div>
                  </div>
                  {z.leads != null ? (
                    <div className="shrink-0 text-right leading-tight" title="Leads der letzten 30 Tage">
                      <div className="text-sm font-semibold tabular-nums">{z.leads}</div>
                      <div className="text-[11px] text-[color:var(--muted)]">Leads 30 T.</div>
                    </div>
                  ) : null}
                  <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--border-strong)]" />
                </Link>
              </li>
            ))}
          </ul>
          {sichtbar.length === 0 ? (
            <EmptyState
              icon={Users}
              title={zeilen.length ? (filter === "hilfe" ? "Gerade braucht kein Kunde Hilfe" : "Kein Kunde in diesem Filter") : "Noch keine Kunden"}
              text={zeilen.length ? undefined : "Kunden entstehen aus angenommenen Angeboten im Vertrieb."}
              action={
                <ButtonLink href={zeilen.length ? "/admin/neu/kunden?filter=alle" : "/admin/neu/vertrieb"} variant="primary" size="md">
                  {zeilen.length ? "Alle Kunden zeigen" : "Zum Vertrieb"}
                </ButtonLink>
              }
            />
          ) : null}
        </Card>
      </div>
    </Seite>
  );
}
