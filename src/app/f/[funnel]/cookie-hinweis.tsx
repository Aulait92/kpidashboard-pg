"use client";

// Cookie-Hinweis der eigenen Funnels (Auflage L6, docs/recht/pkv-funnel.md): nur Meta (Pixel, Conversions API) braucht
// eine Einwilligung; Knöpfe gleichwertig. Gespeichert wird nur die Entscheidung (Cookie pf_meta, § 25 Abs. 2 Nr. 2
// TDDDG). „Cookies“ in der Fußzeile öffnet den Hinweis erneut; „Nein danke“ nach einem Ja widerruft im Pixel und löscht
// die Meta-Cookies.

import { useSyncExternalStore } from "react";
import { PKV_TEXTE as T } from "@/lib/funnel/pkv-beitrag-texte";

const EINWILLIGUNG_COOKIE = "pf_meta";
const hoerer = new Set<() => void>();
const zustand = { offen: false };

function abonniere(fn: () => void) {
  hoerer.add(fn);
  return () => {
    hoerer.delete(fn);
  };
}
const melden = () => hoerer.forEach((fn) => fn());

function leseEinwilligung(): "ja" | "nein" | null {
  const m = /(?:^|;\s*)pf_meta=(ja|nein)/.exec(document.cookie);
  return (m?.[1] as "ja" | "nein" | undefined) ?? null;
}

/** Entscheidung zu Meta-Cookies: "laedt" auf dem Server bzw. vor dem ersten Lesen. */
export function useMetaEinwilligung(): "ja" | "nein" | null | "laedt" {
  return useSyncExternalStore(abonniere, leseEinwilligung, () => "laedt" as const);
}

function useOffen(): boolean {
  return useSyncExternalStore(
    abonniere,
    () => zustand.offen,
    () => false,
  );
}

/** Hinweis erneut öffnen (Link „Cookies“ in der Fußzeile). */
export function cookieHinweisOeffnen() {
  zustand.offen = true;
  melden();
}

function metaCookiesLoeschen() {
  const teile = location.hostname.split(".");
  const domains = ["", location.hostname, ...teile.slice(1).map((_, i) => `.${teile.slice(i).join(".")}`)];
  for (const name of ["_fbp", "_fbc"]) for (const d of domains) document.cookie = `${name}=; path=/; max-age=0${d ? `; domain=${d}` : ""}`;
}

export function entscheide(e: "ja" | "nein") {
  const vorher = leseEinwilligung();
  document.cookie = `${EINWILLIGUNG_COOKIE}=${e}; path=/; max-age=${180 * 86400}; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
  if (e === "nein" && vorher === "ja") {
    (window as { fbq?: (...a: unknown[]) => void }).fbq?.("consent", "revoke");
    metaCookiesLoeschen();
  }
  zustand.offen = false;
  melden();
}

// Gleichwertige Knöpfe (L6), nebeneinander, 44 px; Hover nur mit echter Maus (visual.md M3)
const knopf =
  "min-h-11 flex-1 rounded-[12px] border border-[var(--m-feld-rand)] bg-white px-4 text-[15px] font-semibold text-[var(--m-text)] transition [@media(pointer:fine)]:hover:border-[var(--m-primaer)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--m-primaer-hell)]";

/**
 * Hinweis unten auf der Seite, kompakt (ux-ui.md Muss 1): Text inhaltlich unverändert (L6), 13 px, Knöpfe nebeneinander, „Mehr dazu“ mit 44 px Tippfläche.
 * Am Start verdeckt er keine Antwort mehr: Die Frage-Karte steht unter dem Advertorial, und unten bleibt Platz frei. aufWunsch = nur nach Klick auf „Cookies“ (Seiten ohne Pixel, z. B. Partnerliste);
 * sonst auch, solange nichts entschieden ist (einwilligungNoetig).
 */
export function CookieHinweis({ aufWunsch = false, einwilligungNoetig = true }: { aufWunsch?: boolean; einwilligungNoetig?: boolean }) {
  const e = useMetaEinwilligung();
  const offen = useOffen();
  const sichtbar = offen || (!aufWunsch && einwilligungNoetig && e === null);
  if (!sichtbar) return null;
  return (
    <div role="dialog" aria-label="Cookies" className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--m-karte-rand)] bg-white px-4 pb-[max(0.625rem,env(safe-area-inset-bottom))] pt-2.5 shadow-[0_-8px_24px_-12px_rgba(15,23,42,0.25)]">
      <div className="mx-auto flex max-w-xl flex-col gap-3.5 sm:max-w-3xl sm:flex-row sm:items-center sm:gap-4">
        <p className="flex-1 text-[13px] leading-[18px] text-[var(--m-text)]">
          {T.cookies.text}{" "}
          {/* Tippfläche 44 px (18 + 2 × 13) ohne höhere Zeile: Innenabstand, durch negativen Rand ausgeglichen */}
          <a href={T.datenschutzUrl} target="_blank" rel="noopener" className="-mx-1.5 -my-[13px] inline-block px-1.5 py-[13px] text-[var(--m-primaer)] underline underline-offset-2">
            {T.cookies.mehr}
          </a>
        </p>
        <div className="flex gap-2 sm:w-auto sm:shrink-0">
          <button type="button" onClick={() => entscheide("nein")} className={knopf}>
            {T.cookies.ablehnen}
          </button>
          <button type="button" onClick={() => entscheide("ja")} className={knopf}>
            {T.cookies.zustimmen}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Hält unten Platz frei, solange der Hinweis ihn verdeckt. */
export function useCookieHinweisSichtbar(einwilligungNoetig: boolean): boolean {
  const e = useMetaEinwilligung();
  const offen = useOffen();
  return offen || (einwilligungNoetig && e === null);
}

export function CookiesLink({ className }: { className?: string }) {
  return (
    <button type="button" onClick={cookieHinweisOeffnen} className={className}>
      {T.cookiesLink}
    </button>
  );
}
