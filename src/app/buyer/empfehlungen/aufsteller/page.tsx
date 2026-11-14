import Link from "next/link";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { getBuyerContext } from "@/lib/buyer-context";
import { prisma } from "@/lib/prisma";
import { moduleInfo } from "@/lib/empfehlung/module";
import { generalLinkOf, loadSettings, referralLinkFor } from "@/lib/empfehlung/requests";
import { resolveOffer } from "@/lib/empfehlung/shared";
import { advisorDisplayName } from "@/lib/whatsapp/template-plan";
import { PrintButton } from "@/components/empfehlung/client";

// Aufsteller für Beratungstisch und Empfang: Empfehlungsangebot + QR-Code zum allgemeinen
// Empfehlungslink des Vertreters. Zum Drucken (A5 hoch passt in einen Standard-Aufsteller).
export const dynamic = "force-dynamic";
export const metadata = { title: "Aufsteller | performancegrowth" };

const STEPS = [
  { n: "1", t: "QR-Code scannen", d: "Mit der Handykamera, dauert zwei Sekunden." },
  { n: "2", t: "Weiterleiten", d: "Fertige Nachricht per WhatsApp an Freunde, Familie oder Kollegen." },
  { n: "3", t: "Fertig", d: "Ihre Bekannten melden sich selbst. Sie geben keine Daten von anderen weiter." },
];

export default async function AufstellerPage() {
  const ctx = await getBuyerContext();
  if (!ctx) redirect("/login");
  if (ctx.teamRole !== "owner") redirect("/buyer");
  const info = await moduleInfo(ctx.customerId);
  if (!info?.active) redirect("/buyer/empfehlungen");
  const [customer, settings] = await Promise.all([prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { name: true } }), loadSettings(ctx.customerId)]);
  const vertreter = advisorDisplayName(customer?.name ?? "");
  const general = ctx.preview ? await prisma.referralLink.findFirst({ where: { customerId: ctx.customerId, kind: "general" } }) : await generalLinkOf(ctx.customerId);
  if (!general) redirect("/buyer/empfehlungen");
  const qr = await QRCode.toDataURL(referralLinkFor(general.token), { margin: 1, width: 640 });
  const offer = resolveOffer(settings, vertreter);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 print:max-w-none print:p-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/buyer/empfehlungen" className="text-sm font-semibold text-[color:var(--brand)] hover:underline">
          Zurück zum Modul
        </Link>
        <div className="flex items-center gap-3 text-xs text-[color:var(--muted)]">
          <span>Tipp: auf A5 drucken und so aufstellen, dass Ihr Kunde es im Gespräch sieht.</span>
          <PrintButton />
        </div>
      </div>
      <section className="mx-auto flex aspect-[148/210] w-full max-w-[148mm] flex-col rounded-[20px] bg-[#0b1220] p-8 text-white print:max-w-none print:rounded-none" data-empfehlung-aufsteller>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8fb4ff]">Für Ihre Freunde und Familie</p>
        <h1 className="mt-2 text-3xl font-bold leading-tight">{offer ? offer.headline : "Zufrieden? Empfehlen Sie mich weiter"}</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-[#c9d4ea]">
          {offer ? offer.text : `Wenn Sie mit ${vertreter} zufrieden sind, freuen sich Ihre Bekannten über den Tipp. Sie melden sich ganz einfach selbst.`}
        </p>
        <ol className="mt-6 space-y-3">
          {STEPS.map((s) => (
            <li key={s.n} className="flex items-start gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#2d77fa] text-sm font-bold">{s.n}</span>
              <span>
                <span className="block font-semibold">{s.t}</span>
                <span className="block text-sm text-[#c9d4ea]">{s.d}</span>
              </span>
            </li>
          ))}
        </ol>
        <div className="mt-auto flex items-end justify-between gap-4 pt-6">
          <div>
            <p className="text-sm text-[#c9d4ea]">Ihr Ansprechpartner</p>
            <p className="text-lg font-semibold">{vertreter}</p>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="QR-Code zum Empfehlungslink" className="h-36 w-36 rounded-xl bg-white p-2" />
        </div>
      </section>
    </main>
  );
}
