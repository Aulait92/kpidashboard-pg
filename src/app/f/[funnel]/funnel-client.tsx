"use client";

// Eigener Funnel im Browser (lib/funnel/definition.ts): Startseite mit kurzem Advertorial (als Anzeige gekennzeichnet),
// dann eine Frage je Schritt, Auswahl per Tippen mit automatischem Weiter, Zurück mit erhaltenen Eingaben (auch
// Zurück-Taste des Handys), Fortschrittsbalken über alle Schritte bis zum Absenden, Messung je Schritt
// (/api/funnel/ereignis), Absenden (/api/funnel/absenden). Meta-Pixel erst nach Einwilligung (Cookie-Hinweis).
// Marke, Farben und Bilder: lib/funnel/marken.ts (CI docs/funnel/pkv-tarife-ci.md). Handy zuerst (390 px).
// Gestaltung nach docs/funnel/review-2026-11-21/ (ux-ui.md, visual.md): System-Schrift, zwei Gewichte (600/400),
// Hover nur mit echter Maus, Fehler mit Fokus aufs Feld, kurze Übergänge (prefers-reduced-motion wird beachtet).
// Besucher-ID kommt je Seitenaufruf vom Server und lebt nur im Seitenzustand (kein Cookie, Auflage L4).

import Image from "next/image";
import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import {
  datumTippen,
  fortschrittFuer,
  funnelDef,
  hinweisFuer,
  naechsterSchritt,
  optionLabel,
  pruefeFeld,
  pruefeSchritt,
  texteFuer,
  type Antworten,
  type Eingabefeld,
  type Fehler,
  type FeldId,
  type Schritt,
  type Variante,
} from "@/lib/funnel/definition";
import { einwilligungTeile, PKV_TEXTE as T } from "@/lib/funnel/pkv-beitrag-texte";
import { markeCssVars, markeFuer, type Bild, type Marke } from "@/lib/funnel/marken";
import { CookieHinweis, useCookieHinweisSichtbar, useMetaEinwilligung } from "./cookie-hinweis";
import { Bildzeichen, Fusszeile, Logo } from "./marke";

type Props = {
  funnelKey: string;
  besuchId: string;
  varianten: Record<string, Variante>;
  geladen: number;
  pixelId: string;
  einwilligungNoetig: boolean;
  /** Adresse für den Widerruf (FUNNEL_DATENSCHUTZ_EMAIL bzw. Anbieter) */
  datenschutzEmail: string;
  /** "" auf der Funnel-Adresse, sonst "/f/<funnel>" */
  basis: string;
};

type Experte = { name: string; firma: string };

type Fbq = ((...args: unknown[]) => void) & { callMethod?: (...args: unknown[]) => void; queue: unknown[]; push: unknown; loaded: boolean; version: string };
declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

const QUELLE_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id", "campaign_id", "adset_id", "ad_id", "placement", "site_source_name", "fbclid"];

/** System-Schrift (visual.md M1): iPhone SF Pro, Android Roboto, keine Webfont-Ladezeit. Geist nur in der Wortmarke. */
const SCHRIFT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

function ladePixel(id: string) {
  if (window.fbq) {
    window.fbq("consent", "grant");
    return;
  }
  const n = function (...args: unknown[]) {
    if (n.callMethod) n.callMethod(...args);
    else n.queue.push(args);
  } as Fbq;
  n.push = n;
  n.loaded = true;
  n.version = "2.0";
  n.queue = [];
  window.fbq = n;
  window._fbq = n;
  const s = document.createElement("script");
  s.async = true;
  s.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(s);
  n("init", id);
  n("track", "PageView");
}

/** Messung je Schritt (einmal je Seite): Herkunft nur mit dem ersten Ereignis */
const messung = { quelleGesendet: false, gesehen: new Set<string>(), eventId: "" };

function leseQuelle(): Record<string, string> | null {
  const p = new URLSearchParams(window.location.search);
  const q: Record<string, string> = {};
  for (const k of QUELLE_KEYS) {
    const v = p.get(k);
    if (v) q[k] = v.slice(0, 500);
  }
  return Object.keys(q).length ? q : null;
}

function ereignisSenden(funnel: string, besuch: string, schritt: string, art: string, grund?: string) {
  const body: Record<string, unknown> = { funnel, besuch, schritt, art, grund };
  if (!messung.quelleGesendet) {
    body.quelle = leseQuelle();
    messung.quelleGesendet = true;
  }
  fetch("/api/funnel/ereignis", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), keepalive: true }).catch(() => {});
}

/** event_id für Pixel und Conversions API (einmal je Seitenaufruf) */
function eventId(): string {
  if (!messung.eventId) messung.eventId = crypto.randomUUID();
  return messung.eventId;
}

const wenigBewegung = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Farben über CSS-Variablen der Marke (markeCssVars). Hover nur mit echter Maus ([@media(pointer:fine)]), sonst bleibt
// auf dem Handy nach dem Tippen ein Rand stehen (visual.md M3).
const textLeise = "text-[var(--m-text-leise)]";
const fehlerText = "text-[var(--m-fehler)]";
const inputKlasse =
  "block min-h-14 w-full rounded-[14px] border border-[var(--m-feld-rand)] bg-white px-4 py-3.5 text-[17px] text-[var(--m-text)] outline-none transition placeholder:text-[var(--m-platzhalter)] focus:border-[var(--m-primaer)] focus:ring-4 focus:ring-[var(--m-primaer-hell)] aria-[invalid=true]:border-[var(--m-fehler)]";
const knopf =
  "flex min-h-14 w-full items-center justify-center gap-2.5 rounded-[14px] bg-[var(--m-primaer)] px-5 py-4 text-[17px] font-semibold text-white transition [@media(pointer:fine)]:hover:bg-[var(--m-primaer-dunkel)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--m-deko)] active:scale-[0.99] disabled:cursor-wait";
const knopfZweit =
  "flex min-h-12 w-full items-center justify-center rounded-[14px] border border-[var(--m-primaer)] bg-white px-5 py-3 text-[17px] font-semibold text-[var(--m-primaer)] transition [@media(pointer:fine)]:hover:bg-[var(--m-primaer-hell)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--m-primaer-hell)]";
const linkKlasse = "text-[var(--m-primaer)] underline underline-offset-2";
const frageKlasse = "text-[22px] font-semibold leading-[28px] tracking-[-0.01em] outline-none sm:text-[24px] sm:leading-[30px]";

export function FunnelClient({ funnelKey, besuchId, varianten, geladen, pixelId, einwilligungNoetig, datenschutzEmail, basis }: Props) {
  const f = funnelDef(funnelKey)!;
  const marke = markeFuer(f.marke);
  const [schrittId, setSchrittId] = useState(f.schritte[0].id);
  const [verlauf, setVerlauf] = useState<string[]>([]);
  const [antworten, setAntworten] = useState<Antworten>({});
  const [fehler, setFehler] = useState<Fehler>({});
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const [sendet, setSendet] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [experte, setExperte] = useState<Experte | null>(null);
  const [mailGesendet, setMailGesendet] = useState(false);
  const gespeichert = useMetaEinwilligung();
  const einwilligung: "ja" | "nein" | null | "laedt" = einwilligungNoetig ? gespeichert : "ja";
  const hinweisSichtbar = useCookieHinweisSichtbar(einwilligungNoetig);
  const [hp, setHp] = useState("");
  const karteRef = useRef<HTMLElement>(null);
  const sofortRef = useRef<HTMLAnchorElement>(null);
  const letzterSchritt = useRef<string | null>(null);

  const schritt = f.schritte.find((s) => s.id === schrittId)!;
  const texte = texteFuer(schritt, varianten[schritt.id] ?? "a");
  const partnerHref = `${basis}/partner`;
  const istStart = schritt.id === f.schritte[0].id;
  const sticky = useStickyKnopf(istStart && !hinweisSichtbar, sofortRef, karteRef);

  const senden = (s: string, art: string, grund?: string) => ereignisSenden(f.key, besuchId, s, art, grund);

  // Zurück-Taste des Browsers bzw. Handys: vorheriger Schritt, Eingaben bleiben
  useEffect(() => {
    // Kein replaceState beim Start: Next.js kennzeichnet seinen Verlaufseintrag selbst (sonst lädt die Seite neu).
    // Eintrag ohne Schritt = erster Schritt.
    const onPop = (ev: PopStateEvent) => {
      const id = (ev.state as { funnel?: string } | null)?.funnel ?? f.schritte[0].id;
      setSchrittId(id);
      setVerlauf((v) => v.slice(0, -1));
      setFehler({});
      setGewaehlt(null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [f.schritte]);

  useEffect(() => {
    if (einwilligung === "ja") ladePixel(pixelId);
  }, [einwilligung, pixelId]);

  // Jeder Schritt: einmal „angesehen“ messen, nach oben (zurück zum Start: gleich zur Frage-Karte), Fokus aufs erste
  // Feld bzw. die Überschrift
  useEffect(() => {
    if (!messung.gesehen.has(schrittId)) {
      messung.gesehen.add(schrittId);
      ereignisSenden(f.key, besuchId, schrittId, "angesehen");
    }
    // Nur bei echtem Schrittwechsel scrollen (der Effekt läuft im Entwicklungsmodus doppelt)
    const vorher = letzterSchritt.current;
    letzterSchritt.current = schrittId;
    if (vorher !== schrittId) {
      if (vorher && schrittId === f.schritte[0].id && karteRef.current) karteRef.current.scrollIntoView({ block: "start" });
      else window.scrollTo({ top: 0 });
    }
    const t = window.setTimeout(() => {
      // Nicht wegziehen, wenn schon ein Feld gewählt ist (schnelles Tippen)
      if (document.activeElement instanceof HTMLInputElement) return;
      const ziel = document.querySelector<HTMLElement>('[data-fokus="feld"]') ?? document.querySelector<HTMLElement>('[data-fokus="titel"]');
      ziel?.focus({ preventScroll: true });
    }, 50);
    return () => window.clearTimeout(t);
  }, [schrittId, f.key, f.schritte, besuchId]);

  /** Sofortlink und Sticky-Knopf: weich zur Frage-Karte, Fokus auf die Frage */
  const zurKarte = () => {
    karteRef.current?.scrollIntoView({ behavior: wenigBewegung() ? "auto" : "smooth", block: "start" });
    document.getElementById("frage-titel")?.focus({ preventScroll: true });
  };

  const gehe = (id: string) => {
    setVerlauf((v) => [...v, schrittId]);
    setSchrittId(id);
    setFehler({});
    setGewaehlt(null);
    setMeldung(null);
    history.pushState({ funnel: id }, "");
  };

  const zurueck = () => {
    if (!verlauf.length) return;
    history.back();
  };

  /** Fehler zeigen, dann Fokus und Scroll aufs erste fehlerhafte Feld (am Handy mit offener Tastatur sonst unsichtbar) */
  const zeigeFehler = (e: Fehler) => {
    setFehler(e);
    const reihenfolge: FeldId[] = schritt.art === "eingabe" || schritt.art === "absenden" ? schritt.felder.map((x) => x.feld) : [];
    const erstes = reihenfolge.find((x) => e[x]);
    window.requestAnimationFrame(() => {
      const el = erstes ? document.getElementById(`f-${erstes}`) : null;
      if (el) {
        el.focus({ preventScroll: true });
        el.scrollIntoView({ block: "center", behavior: wenigBewegung() ? "auto" : "smooth" });
      }
    });
  };

  const weiter = (a: Antworten) => {
    const e = pruefeSchritt(schritt, a);
    if (Object.keys(e).length) {
      zeigeFehler(e);
      return;
    }
    senden(schritt.id, "beantwortet");
    const n = naechsterSchritt(f, schritt.id, a);
    if (n.abbruch) senden(schritt.id, "abbruch", n.abbruch);
    gehe(n.id);
  };

  const waehle = (wert: string) => {
    if (schritt.art !== "auswahl" || gewaehlt) return;
    const a = { ...antworten, [schritt.feld]: wert };
    setAntworten(a);
    setGewaehlt(wert);
    window.setTimeout(() => weiter(a), 160);
  };

  const absenden = async () => {
    if (sendet) return;
    const e = pruefeSchritt(schritt, antworten);
    if (Object.keys(e).length) {
      zeigeFehler(e);
      return;
    }
    setSendet(true);
    setMeldung(null);
    try {
      const res = await fetch("/api/funnel/absenden", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          funnel: f.key,
          besuch: besuchId,
          antworten,
          quelle: leseQuelle(),
          eventId: eventId(),
          metaEinwilligung: einwilligung === "ja",
          geladen,
          hp,
          url: window.location.href.split("?")[0],
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; lead?: boolean; experte?: Experte | null; mail?: boolean; fehler?: Fehler; schritt?: string | null; meldung?: string };
      if (res.ok && j.ok) {
        if (j.lead && einwilligung === "ja") window.fbq?.("track", "Lead", { content_name: "PKV-Tarifoptimierung" }, { eventID: eventId() });
        setExperte(j.experte ?? null);
        setMailGesendet(!!j.mail);
        gehe("danke");
        return;
      }
      if (j.schritt && j.schritt !== schritt.id) {
        gehe(j.schritt);
        setFehler(j.fehler ?? {});
      } else if (j.fehler && Object.keys(j.fehler).length) {
        zeigeFehler(j.fehler);
      } else {
        setMeldung(j.meldung ?? T.kontakt.fehlerSenden);
      }
    } catch {
      setMeldung(T.kontakt.fehlerSenden);
    } finally {
      setSendet(false);
    }
  };

  const fortschritt = fortschrittFuer(f, schritt.id);
  // Zurück oben nicht auf der Danke-Seite und nicht auf „nur Privatversicherte“ (der Knopf dort macht dasselbe)
  const zeigeZurueck = verlauf.length > 0 && schritt.art !== "danke" && !(schritt.art === "ende" && schritt.zurueckZu === f.schritte[0].id);

  const setze = (feld: keyof Antworten, wert: string) => {
    setAntworten((a) => ({ ...a, [feld]: wert }));
    if (fehler[feld]) setFehler((e) => ({ ...e, [feld]: undefined }));
  };
  /** Beim Verlassen prüfen (nur ausgefüllte Felder, leere erst beim Weiter) */
  const pruefeVerlassen = (feld: FeldId) => {
    const wert = antworten[feld];
    if (!wert?.trim()) return;
    const e = pruefeFeld(feld, wert);
    if (e) setFehler((x) => ({ ...x, [feld]: e }));
  };

  return (
    <div
      style={{ ...(markeCssVars(marke) as CSSProperties), fontFamily: SCHRIFT }}
      className={`flex min-h-dvh flex-col bg-[var(--m-seite)] text-[17px] leading-[26px] text-[var(--m-text)] antialiased ${hinweisSichtbar ? "pb-52 sm:pb-28" : sticky ? "pb-24 sm:pb-0" : ""}`}
    >
      {/* Schrittwechsel: kurzer Fade mit 8 px Versatz (nur ohne „weniger Bewegung“) */}
      <style>{"@keyframes funnel-ein{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}"}</style>
      <header className="mx-auto flex min-h-14 w-full max-w-xl items-center justify-between px-4 pt-2">
        <Logo marke={marke} />
        {zeigeZurueck ? (
          <button type="button" onClick={zurueck} className={`-mr-2 inline-flex min-h-11 items-center gap-1 rounded-[10px] px-2.5 text-[15px] ${textLeise} [@media(pointer:fine)]:hover:bg-black/5`}>
            <Chevron /> {T.zurueck}
          </button>
        ) : (
          <span />
        )}
      </header>

      <main className="mx-auto w-full max-w-xl flex-1 px-4 pb-8 pt-3">
        {istStart && texte.ueberschrift && <Advertorial marke={marke} ueberschrift={texte.ueberschrift} sofortRef={sofortRef} zurKarte={zurKarte} />}

        <section
          ref={karteRef}
          id="frage-karte"
          className="scroll-mt-3 rounded-[20px] bg-[var(--m-karte)] p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_rgba(15,23,42,0.06)] sm:border sm:border-[var(--m-karte-rand)] sm:p-7"
          aria-live="polite"
        >
          {fortschritt && <Fortschritt nr={fortschritt.nr} von={fortschritt.von} />}
          <div key={schrittId} className="motion-safe:animate-[funnel-ein_200ms_ease-out]">
            <SchrittInhalt
              schritt={schritt}
              texte={texte}
              istStart={istStart}
              marke={marke}
              antworten={antworten}
              fehler={fehler}
              gewaehlt={gewaehlt}
              sendet={sendet}
              meldung={meldung}
              hp={hp}
              setHp={setHp}
              setze={setze}
              pruefeVerlassen={pruefeVerlassen}
              waehle={waehle}
              weiter={() => weiter(antworten)}
              absenden={absenden}
              gehe={(id) => gehe(id)}
              datenschutzEmail={datenschutzEmail}
              partnerHref={partnerHref}
              experte={experte}
              mailGesendet={mailGesendet}
            />
          </div>
        </section>
      </main>

      <Fusszeile marke={marke} partnerHref={partnerHref} />
      <StickyKnopf sichtbar={sticky} onClick={zurKarte} />
      <CookieHinweis einwilligungNoetig={einwilligungNoetig} />
    </div>
  );
}

/**
 * Sticky-Knopf am Handy (ux-ui.md, Advertorial): erst wenn der Sofortlink aus dem Bild ist, weg sobald die Frage-Karte
 * zu mindestens einem Viertel sichtbar ist (nie zwei Hauptaktionen), nie zusammen mit dem Cookie-Hinweis (aktiv=false).
 */
function useStickyKnopf(aktiv: boolean, sofortRef: RefObject<HTMLElement | null>, karteRef: RefObject<HTMLElement | null>): boolean {
  const [sofortVorbei, setSofortVorbei] = useState(false);
  const [karteSichtbar, setKarteSichtbar] = useState(false);
  useEffect(() => {
    if (!aktiv || typeof IntersectionObserver === "undefined") return;
    const beobachter: IntersectionObserver[] = [];
    if (sofortRef.current) {
      const o = new IntersectionObserver(([e]) => setSofortVorbei(!e.isIntersecting && e.boundingClientRect.top < 0));
      o.observe(sofortRef.current);
      beobachter.push(o);
    }
    if (karteRef.current) {
      const o = new IntersectionObserver(([e]) => setKarteSichtbar(e.intersectionRatio >= 0.25 || e.intersectionRect.height >= window.innerHeight * 0.25), { threshold: [0, 0.1, 0.25, 0.5] });
      o.observe(karteRef.current);
      beobachter.push(o);
    }
    return () => beobachter.forEach((o) => o.disconnect());
  }, [aktiv, sofortRef, karteRef]);
  return aktiv && sofortVorbei && !karteSichtbar;
}

function StickyKnopf({ sichtbar, onClick }: { sichtbar: boolean; onClick: () => void }) {
  return (
    <div
      aria-hidden={!sichtbar}
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-[var(--m-karte-rand)] bg-white/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_-12px_rgba(15,23,42,0.25)] backdrop-blur transition-[transform,opacity] duration-200 sm:hidden ${
        sichtbar ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-full opacity-0"
      }`}
    >
      <button type="button" tabIndex={sichtbar ? 0 : -1} onClick={onClick} className={knopf}>
        {T.start.sticky}
        <PfeilRunter />
      </button>
    </div>
  );
}

/** **fett** als Kernsatz, „*“ als hochgestelltes Fußnotenzeichen (L8) */
function Fliesstext({ text }: { text: string }) {
  const teile = text.split(/\*\*(.+?)\*\*/g);
  const stern = (t: string) =>
    t.split("*").map((x, i) => (
      <Fragment key={i}>
        {i > 0 && <sup className="text-[0.7em]">*</sup>}
        {x}
      </Fragment>
    ));
  return (
    <>
      {teile.map((t, i) =>
        i % 2 ? (
          <strong key={i} className="font-semibold">
            {t}
          </strong>
        ) : (
          <Fragment key={i}>{stern(t)}</Fragment>
        ),
      )}
    </>
  );
}

/** Startseite: Advertorial (Ole, 21.11.2026), Aufbau nach ux-ui.md: Anzeige, Überschrift (A/B-Test), Einleitung,
 * Sofortlink, Absatz, Bild, weitere Absätze; Fußnote direkt unter dem Absatz mit „bis zu 50 %“ (L8). */
function Advertorial({ marke, ueberschrift, sofortRef, zurKarte }: { marke: Marke; ueberschrift: string; sofortRef: RefObject<HTMLAnchorElement | null>; zurKarte: () => void }) {
  const bild = marke.bilder.start;
  const [erster, ...rest] = T.start.text;
  const absatz = (t: string, i: number) => (
    <div key={i}>
      <p className="text-[17px] leading-[26px]">
        <Fliesstext text={t} />
      </p>
      {t.replace(/\*\*/g, "").includes("*") && <p className={`mt-1.5 text-[13px] leading-[19px] ${textLeise}`}>* {T.start.fussnote}</p>}
    </div>
  );
  return (
    <article className="mb-6">
      <p className={`text-[12px] uppercase leading-[16px] tracking-[0.04em] ${textLeise}`}>{T.start.anzeige}</p>
      <h1 data-fokus="titel" tabIndex={-1} className="mt-2 text-[28px] font-semibold leading-[34px] tracking-[-0.02em] outline-none sm:text-[34px] sm:leading-[40px]">
        {ueberschrift}
      </h1>
      <p className="mt-3 text-[18px] leading-[27px]">{T.start.einleitung}</p>
      <a
        ref={sofortRef}
        href="#frage-karte"
        onClick={(e) => {
          e.preventDefault();
          zurKarte();
        }}
        className="-ml-1 mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-[10px] px-1 text-[17px] font-semibold text-[var(--m-primaer)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--m-primaer-hell)]"
      >
        {T.start.sofortlink}
        <PfeilRunter />
      </a>
      <div className="mt-4 space-y-4">
        {absatz(erster, 0)}
        {bild && <MarkenBild bild={bild} className="aspect-[16/9] sm:aspect-[12/5]" vorladen position="70% 50%" />}
        {rest.map((t, i) => absatz(t, i + 1))}
      </div>
    </article>
  );
}

function MarkenBild({ bild, className = "", vorladen = false, position }: { bild: Bild; className?: string; vorladen?: boolean; position?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl bg-[var(--m-primaer-hell)] ${className}`}>
      <Image src={bild.src} alt={bild.alt} width={bild.breite} height={bild.hoehe} sizes={bild.sizes} preload={vorladen} quality={75} className="h-full w-full object-cover" style={position ? { objectPosition: position } : undefined} />
    </div>
  );
}

/** Balken über alle Schritte bis zum Absenden; Text nur beim letzten Schritt (ux-ui.md Muss 2) */
function Fortschritt({ nr, von }: { nr: number; von: number }) {
  const letzter = nr === von;
  return (
    <div className="mb-5">
      {letzter && <div className={`mb-1.5 text-[13px] leading-[19px] ${textLeise}`}>{T.letzterSchritt}</div>}
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--m-spur)]" role="progressbar" aria-valuemin={0} aria-valuemax={von} aria-valuenow={nr} aria-label={T.fortschritt(nr, von)}>
        <div className="h-full rounded-full bg-[var(--m-primaer)] transition-[width] duration-300 ease-out motion-reduce:transition-none" style={{ width: `${Math.round((nr / von) * 100)}%` }} />
      </div>
    </div>
  );
}

type InhaltProps = {
  schritt: Schritt;
  texte: ReturnType<typeof texteFuer>;
  istStart: boolean;
  marke: Marke;
  antworten: Antworten;
  fehler: Fehler;
  gewaehlt: string | null;
  sendet: boolean;
  meldung: string | null;
  hp: string;
  setHp: (v: string) => void;
  setze: (feld: keyof Antworten, wert: string) => void;
  pruefeVerlassen: (feld: FeldId) => void;
  waehle: (wert: string) => void;
  weiter: () => void;
  absenden: () => void;
  gehe: (id: string) => void;
  datenschutzEmail: string;
  partnerHref: string;
  experte: Experte | null;
  mailGesendet: boolean;
};

const optionBasis =
  "flex min-h-14 h-full w-full items-center justify-between gap-2 rounded-[14px] border py-3 text-left text-[17px] leading-[22px] transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--m-primaer-hell)]";
const optionAn = "border-[var(--m-primaer)] bg-[var(--m-primaer-hell)] font-semibold text-[var(--m-primaer-dunkel)] shadow-[inset_0_0_0_1px_var(--m-primaer)]";
const optionAus = "border-[var(--m-option-rand)] bg-white text-[var(--m-text)] shadow-[0_1px_2px_rgba(15,23,42,0.05)] [@media(pointer:fine)]:hover:border-[var(--m-primaer)]";

function Option({ label, an, onClick, breit = false, schmal = false }: { label: string; an: boolean; onClick: () => void; breit?: boolean; schmal?: boolean }) {
  return (
    <button type="button" role="radio" aria-checked={an} onClick={onClick} lang="de" className={`${optionBasis} ${schmal ? "px-3.5" : "px-4"} ${an ? optionAn : optionAus} ${breit ? "col-span-2" : ""}`}>
      {/* Keine Silbentrennung (visual.md M2); nach „/“ darf umbrochen werden */}
      <span className="min-w-0 [hyphens:manual]">{label.replace("/", "/​")}</span>
      {an && <HakenKlein className="h-5 w-5 shrink-0 text-[var(--m-primaer)]" />}
    </button>
  );
}

function FehlerZeile({ id, text }: { id?: string; text: string }) {
  return (
    <p id={id} className={`mt-2 flex items-start gap-1.5 text-[15px] leading-[21px] ${fehlerText}`}>
      <Warnung />
      <span>{text}</span>
    </p>
  );
}

/** Überschrift mit Nutzen und Fußnote (L8) als kleine Zeile über der Frage: die Frage bleibt die einzige große Überschrift */
function NutzenZeile({ text, fussnote }: { text: string; fussnote?: string }) {
  return (
    <div className="mb-3">
      <p className="text-[15px] font-semibold leading-[21px] text-[var(--m-primaer)]">
        {text}
        {fussnote && <sup className="ml-0.5 text-[11px]">*</sup>}
      </p>
      {fussnote && <p className={`mt-0.5 text-[13px] leading-[19px] ${textLeise}`}>* {fussnote}</p>}
    </div>
  );
}

function SchrittInhalt(p: InhaltProps) {
  const { schritt, texte } = p;
  if (schritt.art === "auswahl") {
    const wert = p.gewaehlt ?? p.antworten[schritt.feld];
    const kacheln = schritt.haeufig ?? schritt.optionen;
    const ungerade = !schritt.haeufig && schritt.spalten === 2 && kacheln.length % 2 === 1;
    const gewaehltAusListe = schritt.haeufig && wert && !schritt.haeufig.includes(wert) ? wert : null;
    return (
      <div>
        {p.istStart && texte.vertrauen && <Vertrauen punkte={texte.vertrauen} />}
        {/* Beim Start steht die große Überschrift (Fokus beim Laden) im Advertorial; Sofortlink fokussiert diese Frage */}
        <h2 id={p.istStart ? "frage-titel" : undefined} data-fokus={p.istStart ? undefined : "titel"} tabIndex={-1} className={frageKlasse}>
          {texte.frage}
        </h2>
        {texte.hinweis && <p className={`mt-1 text-[15px] leading-[21px] ${textLeise}`}>{texte.hinweis}</p>}
        <div className={`mt-4 grid auto-rows-fr gap-3 ${schritt.spalten === 2 ? "grid-cols-2" : "grid-cols-1"}`} role="radiogroup" aria-label={texte.frage}>
          {kacheln.map((o, i) => (
            <Option key={o} label={optionLabel(schritt, o)} an={wert === o} onClick={() => p.waehle(o)} schmal={schritt.spalten === 2} breit={ungerade && i === kacheln.length - 1} />
          ))}
          {gewaehltAusListe && <Option label={optionLabel(schritt, gewaehltAusListe)} an onClick={() => p.waehle(gewaehltAusListe)} breit={schritt.spalten === 2} />}
        </div>
        {schritt.suche && <Suche schritt={schritt} suche={schritt.suche} wert={wert} waehle={p.waehle} />}
        {p.fehler[schritt.feld] && <FehlerZeile text={p.fehler[schritt.feld]!} />}
      </div>
    );
  }

  if (schritt.art === "eingabe" || schritt.art === "absenden") {
    const einzel = schritt.felder.length === 1;
    const frage = schritt.id === "kontakt" && p.antworten.vorname?.trim() ? T.kontakt.frageMitName(p.antworten.vorname.trim().split(" ")[0]) : texte.frage;
    const hinweis = hinweisFuer(schritt, texte, p.antworten);
    return (
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (schritt.art === "absenden") p.absenden();
          else p.weiter();
        }}
      >
        {texte.ueberschrift && <NutzenZeile text={texte.ueberschrift} fussnote={texte.fussnote} />}
        <h2 data-fokus="titel" tabIndex={-1} className={frageKlasse}>
          {frage}
        </h2>
        {hinweis && <p className={`mt-1 text-[15px] leading-[21px] ${textLeise}`}>{hinweis}</p>}
        <div className={`mt-4 ${schritt.felder.some((x) => x.schmal) ? "grid grid-cols-[7.5rem_1fr] gap-3" : "space-y-4"}`}>
          {schritt.felder.map((fd, i) => (
            <Feld key={fd.feld} fd={fd} einzel={einzel} wert={p.antworten[fd.feld] ?? ""} fehler={p.fehler[fd.feld]} setze={p.setze} verlassen={p.pruefeVerlassen} erstes={i === 0} />
          ))}
        </div>
        {/* Bot-Schutz: für Menschen unsichtbar */}
        {schritt.art === "absenden" && (
          <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
            <label>
              Bitte leer lassen
              <input tabIndex={-1} autoComplete="off" name="hp_feld_x" value={p.hp} onChange={(e) => p.setHp(e.target.value)} />
            </label>
          </div>
        )}
        {/* L1: Einwilligung direkt über dem Knopf */}
        {schritt.art === "absenden" && <Einwilligung email={p.datenschutzEmail} partnerHref={p.partnerHref} />}
        <button type="submit" className={`${knopf} ${schritt.art === "absenden" ? "mt-4" : "mt-6"}`} disabled={p.sendet} aria-busy={p.sendet}>
          {p.sendet && <Spinner />}
          {p.sendet ? T.kontakt.sendet : (texte.knopf ?? T.weiter)}
        </button>
        {p.meldung && (
          <div className="mt-3 rounded-[14px] border border-[var(--m-fehler)]/30 bg-[#FEF3F2] p-4" role="alert">
            <p className={`flex items-start gap-1.5 text-[15px] leading-[21px] ${fehlerText}`}>
              <Warnung />
              <span>{p.meldung}</span>
            </p>
            <button type="button" onClick={p.absenden} className={`${knopfZweit} mt-3`}>
              {T.kontakt.nochmal}
            </button>
          </div>
        )}
        {texte.nachsatz && <p className={`mt-3 text-center text-[13px] leading-[19px] ${textLeise}`}>{texte.nachsatz}</p>}
        {"vertraulich" in schritt && schritt.vertraulich && (
          <p className={`mt-4 flex items-center justify-center gap-1.5 text-[15px] leading-[21px] ${textLeise}`}>
            <Schloss /> {schritt.vertraulich}
          </p>
        )}
      </form>
    );
  }

  if (schritt.art === "info") {
    const bild = schritt.bild ? p.marke.bilder[schritt.bild] : undefined;
    return (
      <div>
        {/* Flach (112 px), damit der Knopf am Handy ohne Scrollen sichtbar bleibt */}
        {bild && <MarkenBild bild={bild} className="mb-5 h-28 w-full" position="50% 35%" />}
        <h2 data-fokus="titel" tabIndex={-1} className={frageKlasse}>
          {texte.ueberschrift}
        </h2>
        {texte.liste && (
          <ul className="mt-4 space-y-3">
            {texte.liste.map((t) => (
              <li key={t} className="flex gap-3 text-[17px] leading-[24px]">
                <span aria-hidden className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--m-primaer-hell)]">
                  <HakenKlein className="h-3.5 w-3.5 text-[var(--m-primaer)]" />
                </span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        )}
        <button type="button" className={`${knopf} mt-6`} onClick={p.weiter}>
          {texte.knopf ?? T.weiter}
        </button>
      </div>
    );
  }

  if (schritt.art === "danke") {
    const vorname = p.antworten.vorname?.trim().split(" ")[0];
    return (
      <div className="py-1">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--m-primaer)]">
          <Bildzeichen className="h-8 w-8" hell />
        </div>
        <h2 data-fokus="titel" tabIndex={-1} className={`${frageKlasse} text-center`}>
          {vorname ? T.danke.ueberschriftMitName(vorname) : texte.ueberschrift}
        </h2>
        {p.experte && (
          <div className="mt-5 rounded-[14px] bg-[var(--m-primaer-hell)] p-4">
            <p className="text-[13px] uppercase leading-[19px] tracking-[0.04em] text-[var(--m-primaer-dunkel)]">{T.danke.experte}</p>
            <p className="mt-1 font-semibold">{p.experte.name}</p>
            <p className={textLeise}>{p.experte.firma}</p>
          </div>
        )}
        {texte.frage && <p className="mt-5 font-semibold">{texte.frage}</p>}
        {texte.liste && (
          <ol className="mt-3 space-y-3">
            {texte.liste.map((t, i) => (
              <li key={i} className="flex gap-3 text-[17px] leading-[24px]">
                <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--m-primaer-hell)] text-[15px] font-semibold text-[var(--m-primaer)]">
                  {i + 1}
                </span>
                <span className="pt-0.5">{t}</span>
              </li>
            ))}
          </ol>
        )}
        {p.mailGesendet && <p className={`mt-4 text-[15px] leading-[21px] ${textLeise}`}>{T.danke.mail}</p>}
        {texte.nachsatz && <p className={`mt-5 border-t border-[var(--m-karte-rand)] pt-4 text-[15px] leading-[21px] ${textLeise}`}>{texte.nachsatz}</p>}
      </div>
    );
  }

  // Endseite (nicht passend): freundlich, mit klarem nächsten Schritt
  return (
    <div className="py-1">
      <h2 data-fokus="titel" tabIndex={-1} className={frageKlasse}>
        {texte.ueberschrift}
      </h2>
      {texte.text?.map((t, i) => (
        <p key={i} className={`mt-3 text-[17px] leading-[26px] ${textLeise}`}>
          {t}
        </p>
      ))}
      {schritt.art === "ende" && (
        <button type="button" className={`${knopf} mt-6`} onClick={() => p.gehe(schritt.zurueckZu)}>
          {texte.knopf}
        </button>
      )}
    </div>
  );
}

function Vertrauen({ punkte }: { punkte: readonly string[] }) {
  return (
    <ul className={`mb-4 flex flex-wrap gap-x-4 gap-y-1 text-[15px] leading-[21px] ${textLeise}`} aria-label="Auf einen Blick">
      {punkte.map((v) => (
        <li key={v} className="flex items-center gap-1.5">
          <HakenKlein /> {v}
        </li>
      ))}
    </ul>
  );
}

/** Für die Suche: Kleinbuchstaben, Umlaute ausgeschrieben, ohne Akzente und Satzzeichen („Süd“ = „sued“) */
const normal = (s: string) =>
  s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");

/** Versicherer suchen (alle übrigen außer den Kacheln): Vorschlagsliste beim Tippen, beim Antippen ohne Text alle */
function Suche({ schritt, suche, wert, waehle }: { schritt: Extract<Schritt, { art: "auswahl" }>; suche: { label: string; keineTreffer: string }; wert: string | undefined; waehle: (w: string) => void }) {
  const [text, setText] = useState("");
  const [offen, setOffen] = useState(false);
  const eingabeRef = useRef<HTMLInputElement>(null);
  const sonstige = schritt.optionen.at(-1)!;
  const treffer = useMemo(() => {
    const q = normal(text);
    const liste = q
      ? schritt.optionen.filter((o) => normal(optionLabel(schritt, o)).includes(q) || normal(o).includes(q))
      : schritt.optionen.filter((o) => !schritt.haeufig?.includes(o));
    // „Andere Versicherung“ immer als Ausweg am Ende
    return [...liste.filter((o) => o !== sonstige), sonstige];
  }, [text, schritt, sonstige]);
  const zeigen = offen || !!text;
  return (
    <div className="mt-4">
      <label htmlFor="versicherer-suche" className="sr-only">
        {suche.label}
      </label>
      <div className="relative">
        <span aria-hidden className={`pointer-events-none absolute inset-y-0 left-4 flex items-center ${textLeise}`}>
          <Lupe />
        </span>
        <input
          ref={eingabeRef}
          id="versicherer-suche"
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder={suche.label}
          value={text}
          role="combobox"
          aria-expanded={zeigen}
          aria-controls="versicherer-liste"
          onChange={(e) => setText(e.target.value)}
          onFocus={() => {
            setOffen(true);
            // Am Handy die Liste über die Tastatur holen
            window.setTimeout(() => eingabeRef.current?.scrollIntoView({ block: "start", behavior: wenigBewegung() ? "auto" : "smooth" }), 250);
          }}
          className={`${inputKlasse} scroll-mt-4 pl-11`}
        />
      </div>
      {zeigen && (
        <div id="versicherer-liste" role="radiogroup" aria-label={suche.label} className="mt-2 overflow-hidden rounded-[14px] border border-[var(--m-option-rand)] bg-white">
          {treffer.map((o, i) => {
            const an = wert === o;
            return (
              <button
                key={o}
                type="button"
                role="radio"
                aria-checked={an}
                onClick={() => waehle(o)}
                className={`flex min-h-[52px] w-full items-center justify-between gap-2 px-4 py-3 text-left text-[17px] leading-[22px] transition focus-visible:bg-[var(--m-primaer-hell)] focus-visible:outline-none active:bg-[var(--m-primaer-hell)] [@media(pointer:fine)]:hover:bg-[var(--m-seite)] ${
                  i ? "border-t border-[var(--m-karte-rand)]" : ""
                } ${an ? "font-semibold text-[var(--m-primaer-dunkel)]" : ""}`}
              >
                <span className="min-w-0 [hyphens:manual]">{optionLabel(schritt, o)}</span>
                {an && <HakenKlein className="h-5 w-5 shrink-0 text-[var(--m-primaer)]" />}
              </button>
            );
          })}
          {text && treffer.length === 1 && <p className={`border-t border-[var(--m-karte-rand)] px-4 py-3 text-[15px] leading-[21px] ${textLeise}`}>{suche.keineTreffer}</p>}
        </div>
      )}
    </div>
  );
}

/** Einwilligung (L1): Wortlaut unverändert; 13 px, leise, Links mit größerer Tippfläche, Adresse ohne Umbruch im Wort. */
function Einwilligung({ email, partnerHref }: { email: string; partnerHref: string }) {
  return (
    <p className={`mt-5 text-[13px] leading-[19px] ${textLeise}`}>
      {einwilligungTeile(email).map((t, i) =>
        typeof t === "string" ? (
          <span key={i}>{t}</span>
        ) : "email" in t ? (
          <a key={i} href={`mailto:${t.email}`} className={`${linkKlasse} whitespace-nowrap py-1`}>
            {t.email}
          </a>
        ) : (
          <a key={i} href={t.link === "partner" ? partnerHref : T.datenschutzUrl} target="_blank" rel="noopener" className={`${linkKlasse} py-1`}>
            {t.text}
          </a>
        ),
      )}
    </p>
  );
}

function Feld({
  fd,
  einzel,
  wert,
  fehler,
  setze,
  verlassen,
  erstes,
}: {
  fd: Eingabefeld;
  einzel: boolean;
  wert: string;
  fehler?: string;
  setze: (f: keyof Antworten, w: string) => void;
  verlassen: (f: FeldId) => void;
  erstes?: boolean;
}) {
  const id = `f-${fd.feld}`;
  const typ = fd.typ === "email" ? "email" : fd.typ === "tel" ? "tel" : "text";
  const inputMode = fd.typ === "euro" || fd.typ === "plz" || fd.typ === "datum" ? "numeric" : fd.typ === "email" ? "email" : fd.typ === "tel" ? "tel" : undefined;
  const aendern = (v: string) => {
    if (fd.typ === "datum") v = datumTippen(v);
    if (fd.typ === "plz") v = v.replace(/\D/g, "").slice(0, 5);
    if (fd.typ === "euro") v = v.replace(/[^\d.,]/g, "").slice(0, 8);
    setze(fd.feld, v);
  };
  const beschreibung = [fehler ? `${id}-fehler` : null, fd.hinweis ? `${id}-hinweis` : null].filter(Boolean).join(" ") || undefined;
  // Telefon und E-Mail schon beim Verlassen prüfen (ux-ui.md Muss 8)
  const beimVerlassen = fd.typ === "tel" || fd.typ === "email";
  return (
    <div>
      <label htmlFor={id} className={einzel ? "sr-only" : "mb-1.5 block text-[15px] font-semibold leading-[21px] text-[var(--m-text)]"}>
        {fd.label}
      </label>
      <div className="relative">
        <input
          data-fokus={erstes ? "feld" : undefined}
          id={id}
          name={fd.feld}
          type={typ}
          inputMode={inputMode}
          autoComplete={fd.autocomplete ?? "off"}
          autoCapitalize={fd.typ === "email" ? "none" : undefined}
          autoCorrect="off"
          spellCheck={false}
          placeholder={fd.platzhalter}
          maxLength={fd.typ === "datum" ? 10 : 120}
          value={wert}
          aria-invalid={!!fehler}
          aria-describedby={beschreibung}
          onChange={(e) => aendern(e.target.value)}
          onBlur={beimVerlassen ? () => verlassen(fd.feld) : undefined}
          className={`${inputKlasse} scroll-mt-24 ${fd.einheit ? "pr-28" : ""}`}
        />
        {fd.einheit && <span className={`pointer-events-none absolute inset-y-0 right-4 flex items-center text-[17px] ${textLeise}`}>{fd.einheit}</span>}
      </div>
      {fehler ? (
        <FehlerZeile id={`${id}-fehler`} text={fehler} />
      ) : (
        fd.hinweis && (
          <p id={`${id}-hinweis`} className={`mt-1.5 text-[15px] leading-[21px] ${textLeise}`}>
            {fd.hinweis}
          </p>
        )
      )}
    </div>
  );
}

function Icon({ children, className = "h-5 w-5" }: { children: ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

const Chevron = () => (
  <Icon>
    <path d="M15 18l-6-6 6-6" />
  </Icon>
);
const PfeilRunter = () => (
  <Icon className="h-[18px] w-[18px]">
    <path d="M12 5v14M6 13l6 6 6-6" />
  </Icon>
);
const Lupe = () => (
  <Icon>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </Icon>
);
const Warnung = () => (
  <Icon className="mt-[1px] h-[18px] w-[18px] shrink-0">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5.5M12 16.5h.01" />
  </Icon>
);
const Schloss = () => (
  <Icon className="h-4 w-4">
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </Icon>
);

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity={0.3} strokeWidth={3} />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" />
    </svg>
  );
}

function HakenKlein({ className = "h-4 w-4 shrink-0 text-[var(--m-primaer)]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}
