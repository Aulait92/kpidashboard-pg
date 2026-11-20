import type { CSSProperties } from "react";
import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { funnelDef } from "@/lib/funnel/definition";
import { ladePartner } from "@/lib/funnel/partner";
import { markeCssVars, markeFuer } from "@/lib/funnel/marken";
import { PKV_TEXTE as T } from "@/lib/funnel/pkv-beitrag-texte";
import { funnelDatenschutzEmail } from "@/lib/funnel/einstellungen";
import { funnelBasis, funnelMetadata, funnelViewport } from "../basis";
import { Fusszeile, Logo } from "../marke";
import { CookieHinweis } from "../cookie-hinweis";

// Öffentliche Partnerliste (Auflage L2, docs/recht/pkv-funnel.md): automatisch aus den aktiven Bezügen des Produkts
// (lib/funnel/partner.ts), ohne Testkunden. Auf der Funnel-Adresse unter /partner (lib/funnel/host.ts).
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ funnel: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return funnelMetadata((await params).funnel, T.partner.titel);
}

export async function generateViewport({ params }: Props): Promise<Viewport> {
  return funnelViewport((await params).funnel);
}

const datum = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);

export default async function PartnerSeite({ params }: Props) {
  const { funnel } = await params;
  const f = funnelDef(funnel);
  if (!f) notFound();
  const marke = markeFuer(f.marke);
  const basis = await funnelBasis(f.key);
  const { partner, stand } = await ladePartner(f);
  const email = funnelDatenschutzEmail();
  return (
    <div style={markeCssVars(marke) as CSSProperties} className="flex min-h-dvh flex-col bg-[var(--m-seite)] text-[16px] text-[var(--m-text)]">
      <header className="mx-auto flex min-h-14 w-full max-w-xl items-center px-4 pt-2">
        <Logo marke={marke} href={basis || "/"} />
      </header>
      <main className="mx-auto w-full max-w-xl flex-1 px-4 pb-8 pt-3">
        <h1 className="text-[25px] font-bold leading-tight tracking-[-0.015em]">{T.partner.titel}</h1>
        <p className="mt-2 leading-relaxed text-[var(--m-text-leise)]">{T.partner.text}</p>
        <p className="mt-1 text-[14px] text-[var(--m-text-leise)]">
          {T.partner.stand}: {datum(stand ?? new Date())}
        </p>
        {partner.length ? (
          <ul className="mt-5 space-y-3">
            {partner.map((p, i) => (
              <li key={i} className="rounded-2xl border border-[var(--m-karte-rand)] bg-white p-4">
                <p className="text-[17px] font-semibold leading-snug">{p.firma}</p>
                {p.name && <p className="text-[var(--m-text-leise)]">Ansprechpartner: {p.name}</p>}
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[14px]">
                  {p.ort && (
                    <>
                      <dt className="text-[var(--m-text-leise)]">{T.partner.sitz}</dt>
                      <dd>{p.ort}</dd>
                    </>
                  )}
                  {p.registerNummer && (
                    <>
                      <dt className="text-[var(--m-text-leise)]">{T.partner.registerKurz}</dt>
                      <dd>{p.registerNummer}</dd>
                    </>
                  )}
                </dl>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-5 rounded-2xl border border-[var(--m-karte-rand)] bg-white p-4">{T.partner.leer}</p>
        )}
        <p className="mt-5 text-[14px] leading-relaxed text-[var(--m-text-leise)]">
          {T.partner.register}, einsehbar unter{" "}
          <a href="https://www.vermittlerregister.info" target="_blank" rel="noopener" className="font-medium text-[var(--m-primaer)] underline underline-offset-2">
            vermittlerregister.info
          </a>
          . Widerruf deiner Einwilligung jederzeit per E-Mail an{" "}
          <a href={`mailto:${email}`} className="break-all font-medium text-[var(--m-primaer)] underline underline-offset-2">
            {email}
          </a>
          .
        </p>
        <a
          href={basis || "/"}
          className="mt-6 flex min-h-14 w-full items-center justify-center rounded-xl border-2 border-[var(--m-primaer)] bg-white px-5 text-[17px] font-semibold text-[var(--m-primaer)] hover:bg-[var(--m-primaer-hell)]"
        >
          {T.partner.zurueck}
        </a>
      </main>
      <Fusszeile marke={marke} partnerHref={`${basis}/partner`} />
      <CookieHinweis aufWunsch />
    </div>
  );
}
