import Link from "next/link";
import { redirect } from "next/navigation";
import { Megaphone, Send } from "lucide-react";
import { PageHeader } from "@/components/buyer-shell";
import { Button, Card, CardHeader } from "@/components/ui";
import { getBuyerContext } from "@/lib/buyer-context";
import { prisma } from "@/lib/prisma";
import { OCCASIONS, segmentIds, TOPIC_LABEL, type Occasion, type Segment } from "@/lib/bestand/campaigns";
import { renderTemplate, SUGGESTED_TEMPLATE_TEXT, type NoticePurpose } from "@/lib/whatsapp/templates";
import { startCampaignAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function CampaignSetup({ searchParams }: { searchParams: Promise<{ anlass?: string; segment?: string; thema?: string }> }) {
  const ctx = await getBuyerContext();
  if (!ctx) redirect("/login");
  const c = await prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { existingCustomersEnabled: true, name: true } });
  if (!c?.existingCustomersEnabled || ctx.teamRole !== "owner") redirect("/buyer");
  const sp = await searchParams;
  const occasion = (sp.anlass && sp.anlass in OCCASIONS ? sp.anlass : "review") as Occasion;
  let segment: Segment = {};
  try {
    segment = JSON.parse(sp.segment ?? "{}") as Segment;
  } catch {
    /* leer */
  }
  const topic = sp.thema ?? (segment.lacks?.[0] ? (TOPIC_LABEL[segment.lacks[0]] ?? segment.lacks[0]) : null);
  const purpose = OCCASIONS[occasion].purpose as NoticePurpose;
  const [ids, template, wa] = await Promise.all([
    segmentIds(ctx.customerId, occasion, segment),
    prisma.messageTemplate.findFirst({ where: { customerId: ctx.customerId, purpose, status: "approved" }, orderBy: { updatedAt: "desc" } }),
    prisma.whatsAppAccount.findUnique({ where: { customerId: ctx.customerId }, select: { status: true } }),
  ]);
  const advisor = c.name.replace(/^Allianz\s+/i, "");
  const body = template?.body ?? SUGGESTED_TEMPLATE_TEXT[purpose].replace(/\[Berater\]/g, advisor);
  const preview = renderTemplate(body, ["Erika", topic ?? ""]);
  const ready = !!template && wa?.status === "connected" && ids.length > 0;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <Link href="/buyer/bestand" className="text-sm text-[color:var(--brand)] hover:underline">
        ← Bestand
      </Link>
      <PageHeader title={`Kampagne: ${OCCASIONS[occasion].label}`} subtitle={OCCASIONS[occasion].hint} />
      <form action={startCampaignAction} className="space-y-5">
        <input type="hidden" name="occasion" value={occasion} />
        <input type="hidden" name="segment" value={JSON.stringify(segment)} />
        <Card>
          <CardHeader title={`${ids.length.toLocaleString("de-DE")} Empfänger`} icon={Megaphone} />
          <div className="space-y-4 px-5 pb-5 text-sm">
            <p className="text-[color:var(--muted)]">
              {occasion === "cross_sell" ? `Kunden mit ${segment.has?.join(", ")} und ohne ${segment.lacks?.join(", ")}. ` : ""}
              Nicht dabei: gesperrte Kunden, Kunden ohne Mobilnummer und alle, die in den letzten 30 Tagen schon angeschrieben wurden.
            </p>
            {occasion === "cross_sell" || occasion === "renewal" ? (
              <label className="block text-xs font-medium text-[color:var(--muted)]">
                Thema in der Nachricht
                <input name="topic" defaultValue={topic ?? ""} className="mt-1 h-10 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3 text-sm text-[color:var(--foreground)]" />
              </label>
            ) : null}
            <label className="block text-xs font-medium text-[color:var(--muted)]">
              Höchstens pro Tag
              <input name="dailyLimit" type="number" min={10} max={1000} defaultValue={150} className="mt-1 h-10 w-32 rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3 text-sm text-[color:var(--foreground)]" />
              <span className="mt-1 block font-normal">Versand Mo–Sa 9–19 Uhr. Langsam starten schützt Ihre WhatsApp-Nummer.</span>
            </label>
          </div>
        </Card>

        <Card>
          <CardHeader title="So sieht die Nachricht aus" />
          <div className="px-5 pb-5">
            <div className="max-w-sm rounded-2xl rounded-tl-sm bg-[#dcf8c6] px-4 py-3 text-[15px] leading-snug text-zinc-900 shadow-sm">{preview}</div>
            <p className="mt-3 text-xs text-[color:var(--muted)]">
              Antwortet ein Kunde, übernimmt Ihr digitaler Assistent, klärt kurz den Bedarf und bietet einen Termin an. Das Gespräch erscheint als Lead in
              Ihrer Pipeline. „Stopp“ sperrt den Kunden automatisch.
            </p>
          </div>
        </Card>

        {!template ? (
          <p className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Für diesen Anlass ist noch keine WhatsApp-Vorlage von Meta freigegeben. Wir reichen sie für Sie ein, das dauert meist 1–2 Tage. Melden Sie sich
            kurz bei uns.
          </p>
        ) : null}
        {wa?.status !== "connected" ? (
          <p className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Ihre WhatsApp-Nummer ist noch nicht verbunden.</p>
        ) : null}
        <Button type="submit" variant="primary" size="md" icon={Send} disabled={!ready}>
          Kampagne starten
        </Button>
      </form>
    </main>
  );
}
