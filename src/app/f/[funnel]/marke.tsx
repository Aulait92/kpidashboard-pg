// Marke der eigenen Funnels (docs/funnel/pkv-tarife-ci.md): Logo als Inline-SVG-Bildzeichen plus Wortmarke in Geist,
// Fußzeile mit Anbieterzeile und Pflichtlinks (Auflage L6). Läuft auf dem Server und im Browser.

import type { Marke } from "@/lib/funnel/marken";
import { PKV_TEXTE as T } from "@/lib/funnel/pkv-beitrag-texte";
import { CookiesLink } from "./cookie-hinweis";

/** Bildzeichen: Schild mit Pfeil nach unten („Beitrag senken“). */
export function Bildzeichen({ className = "h-7 w-7", hell = false }: { className?: string; hell?: boolean }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden focusable="false">
      <path d="M16 1.5 28.5 6v8.6c0 8.4-5.4 14.6-12.5 17.1C8.9 29.2 3.5 23 3.5 14.6V6Z" fill={hell ? "#FFFFFF" : "var(--m-primaer)"} />
      <path d="M16 8.5v13M10.5 16 16 21.5l5.5-5.5" fill="none" stroke={hell ? "var(--m-primaer)" : "#FFFFFF"} strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ marke, href }: { marke: Marke; href?: string }) {
  const inhalt = (
    <>
      <Bildzeichen className="h-[26px] w-[26px] shrink-0" />
      {/* Wortmarke in Geist (CI); der übrige Funnel nutzt die System-Schrift (visual.md M1) */}
      <span className="font-[family-name:var(--font-geist-sans)] text-[19px] leading-none tracking-[-0.02em]">
        <span className="font-bold text-[var(--m-primaer-dunkel)]">{marke.wort[0]}</span>
        <span className="font-medium text-[var(--m-grau)]">{marke.wort[1]}</span>
      </span>
    </>
  );
  return href ? (
    <a href={href} aria-label={marke.name} className="inline-flex items-center gap-2 rounded-lg outline-none focus-visible:ring-4 focus-visible:ring-[var(--m-primaer-hell)]">
      {inhalt}
    </a>
  ) : (
    <span role="img" aria-label={marke.name} className="inline-flex items-center gap-2">
      {inhalt}
    </span>
  );
}

// Tippfläche 44 px (ux-ui.md, Schön); Hover nur mit echter Maus
const link = "inline-flex min-h-11 items-center rounded px-1.5 text-[var(--m-text-leise)] underline-offset-2 [@media(pointer:fine)]:hover:text-[var(--m-primaer)] [@media(pointer:fine)]:hover:underline";

/** Fußzeile: Anbieterzeile, Impressum · Datenschutz · Cookies · Partnerliste (L6). */
export function Fusszeile({ marke, partnerHref }: { marke: Marke; partnerHref: string }) {
  return (
    <footer className="mx-auto w-full max-w-xl px-4 pb-8 pt-2 text-center text-[13px] leading-[19px] text-[var(--m-text-leise)]">
      <p className="text-[12px] leading-[18px]">{marke.anbieter}</p>
      <nav aria-label="Rechtliches" className="mt-1 flex flex-wrap items-center justify-center gap-x-1">
        <a href={T.impressumUrl} target="_blank" rel="noopener" className={link}>
          {T.impressum}
        </a>
        <span aria-hidden>·</span>
        <a href={T.datenschutzUrl} target="_blank" rel="noopener" className={link}>
          {T.datenschutz}
        </a>
        <span aria-hidden>·</span>
        <CookiesLink className={link} />
        <span aria-hidden>·</span>
        <a href={partnerHref} className={link}>
          {T.partnerliste}
        </a>
      </nav>
    </footer>
  );
}
