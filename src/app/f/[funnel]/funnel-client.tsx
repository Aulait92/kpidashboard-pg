"use client";

// Eigener Funnel im Browser (lib/funnel/definition.ts): eine Frage je Schritt, Auswahl per Tippen mit automatischem
// Weiter, Zurück mit erhaltenen Eingaben (auch Zurück-Taste des Handys), Fortschritt „Frage x von 7“, Messung je
// Schritt (/api/funnel/ereignis), Absenden (/api/funnel/absenden). Meta-Pixel erst nach Einwilligung (Cookie-Hinweis).
// Marke, Farben und Bilder: lib/funnel/marken.ts (CI docs/funnel/pkv-tarife-ci.md). Handy zuerst (390 px).
// Besucher-ID kommt je Seitenaufruf vom Server und lebt nur im Seitenzustand (kein Cookie, Auflage L4).

import Image from "next/image";
import { useEffect, useState, type CSSProperties } from "react";
import { datumTippen, funnelDef, naechsterSchritt, optionLabel, pruefeSchritt, texteFuer, type Antworten, type Eingabefeld, type Fehler, type Schritt, type Variante } from "@/lib/funnel/definition";
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

// Farben über CSS-Variablen der Marke (markeCssVars)
const textLeise = "text-[var(--m-text-leise)]";
const fehlerText = "text-[var(--m-fehler)]";
const inputKlasse =
  "block min-h-14 w-full rounded-xl border border-[var(--m-feld-rand)] bg-white px-4 py-3.5 text-lg text-[var(--m-text)] outline-none transition placeholder:text-slate-400 focus:border-[var(--m-primaer)] focus:ring-4 focus:ring-[var(--m-primaer-hell)] aria-[invalid=true]:border-[var(--m-fehler)]";
const knopf =
  "flex min-h-14 w-full items-center justify-center rounded-xl bg-[var(--m-primaer)] px-5 py-4 text-[17px] font-semibold text-white shadow-sm transition hover:bg-[var(--m-primaer-dunkel)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--m-deko)] active:scale-[0.99] disabled:opacity-60";
const knopfZweit =
  "flex min-h-14 w-full items-center justify-center rounded-xl border-2 border-[var(--m-primaer)] bg-white px-5 py-3.5 text-[17px] font-semibold text-[var(--m-primaer)] transition hover:bg-[var(--m-primaer-hell)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--m-primaer-hell)]";
const linkKlasse = "font-medium text-[var(--m-primaer)] underline underline-offset-2";

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
  const gespeichert = useMetaEinwilligung();
  const einwilligung: "ja" | "nein" | null | "laedt" = einwilligungNoetig ? gespeichert : "ja";
  const hinweisSichtbar = useCookieHinweisSichtbar(einwilligungNoetig);
  const [hp, setHp] = useState("");

  const schritt = f.schritte.find((s) => s.id === schrittId)!;
  const texte = texteFuer(schritt, varianten[schritt.id] ?? "a");
  const partnerHref = `${basis}/partner`;

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

  // Jeder Schritt: einmal „angesehen“ messen, nach oben, Fokus aufs erste Feld bzw. die Überschrift
  useEffect(() => {
    if (!messung.gesehen.has(schrittId)) {
      messung.gesehen.add(schrittId);
      ereignisSenden(f.key, besuchId, schrittId, "angesehen");
    }
    window.scrollTo({ top: 0 });
    const t = window.setTimeout(() => {
      // Nicht wegziehen, wenn schon ein Feld gewählt ist (schnelles Tippen)
      if (document.activeElement instanceof HTMLInputElement) return;
      const ziel = document.querySelector<HTMLElement>('[data-fokus="feld"]') ?? document.querySelector<HTMLElement>('[data-fokus="titel"]');
      ziel?.focus({ preventScroll: true });
    }, 50);
    return () => window.clearTimeout(t);
  }, [schrittId, f.key, besuchId]);

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

  const weiter = (a: Antworten) => {
    const e = pruefeSchritt(schritt, a);
    if (Object.keys(e).length) {
      setFehler(e);
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
    const e = pruefeSchritt(schritt, antworten);
    if (Object.keys(e).length) {
      setFehler(e);
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
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; lead?: boolean; experte?: Experte | null; fehler?: Fehler; schritt?: string | null; meldung?: string };
      if (res.ok && j.ok) {
        if (j.lead && einwilligung === "ja") window.fbq?.("track", "Lead", { content_name: "PKV-Tarifoptimierung" }, { eventID: eventId() });
        setExperte(j.experte ?? null);
        gehe("danke");
        return;
      }
      if (j.schritt && j.schritt !== schritt.id) {
        gehe(j.schritt);
        setFehler(j.fehler ?? {});
      } else if (j.fehler && Object.keys(j.fehler).length) {
        setFehler(j.fehler);
      } else {
        setMeldung(j.meldung ?? T.kontakt.fehlerSenden);
      }
    } catch {
      setMeldung(T.kontakt.fehlerSenden);
    } finally {
      setSendet(false);
    }
  };

  const zeigeFortschritt = "frageNr" in schritt && typeof schritt.frageNr === "number";
  const zeigeZurueck = verlauf.length > 0 && schritt.art !== "danke";
  const istStart = schritt.id === f.schritte[0].id;

  const setze = (feld: keyof Antworten, wert: string) => {
    setAntworten((a) => ({ ...a, [feld]: wert }));
    if (fehler[feld]) setFehler((e) => ({ ...e, [feld]: undefined }));
  };

  return (
    <div
      style={markeCssVars(marke) as CSSProperties}
      className={`flex min-h-dvh flex-col bg-[var(--m-seite)] text-[16px] text-[var(--m-text)] ${hinweisSichtbar ? "pb-44 sm:pb-28" : ""}`}
    >
      <header className="mx-auto flex min-h-14 w-full max-w-xl items-center justify-between px-4 pt-2">
        <Logo marke={marke} />
        {zeigeZurueck ? (
          <button type="button" onClick={zurueck} className={`-mr-2 min-h-11 rounded-lg px-3 text-[15px] font-medium ${textLeise} hover:bg-black/5`}>
            ‹ {T.zurueck}
          </button>
        ) : (
          <span />
        )}
      </header>

      <main className="mx-auto w-full max-w-xl flex-1 px-4 pb-8 pt-3">
        {istStart && texte.ueberschrift && <StartKopf marke={marke} texte={texte} />}

        <section className="rounded-2xl border border-[var(--m-karte-rand)] bg-[var(--m-karte)] p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-7" aria-live="polite">
          {zeigeFortschritt && <Fortschritt nr={(schritt as { frageNr: number }).frageNr} von={f.fragenGesamt} />}
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
            waehle={waehle}
            weiter={() => weiter(antworten)}
            absenden={absenden}
            gehe={(id) => gehe(id)}
            datenschutzEmail={datenschutzEmail}
            partnerHref={partnerHref}
            experte={experte}
          />
        </section>
        {/* Erklärung unter der Frage: Die erste Frage bleibt am Handy ohne Scrollen sichtbar */}
        {istStart && texte.text && (
          <div className="mt-5 space-y-3">
            {texte.text.map((t, i) => (
              <p key={i} className={`text-[16px] leading-relaxed ${textLeise}`}>
                {t}
              </p>
            ))}
          </div>
        )}
      </main>

      <Fusszeile marke={marke} partnerHref={partnerHref} />
      <CookieHinweis einwilligungNoetig={einwilligungNoetig} />
    </div>
  );
}

function StartKopf({ marke, texte }: { marke: Marke; texte: ReturnType<typeof texteFuer> }) {
  const bild = marke.bilder.start;
  return (
    <div className="mb-4">
      {bild && <MarkenBild bild={bild} className="mb-4 aspect-[12/5]" vorladen />}
      <h1 data-fokus="titel" tabIndex={-1} className="text-[25px] font-bold leading-[1.2] tracking-[-0.015em] outline-none sm:text-[30px]">
        {texte.ueberschrift}
      </h1>
      {texte.vertrauen && (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[14px] font-medium text-[var(--m-primaer-dunkel)]" aria-label="Auf einen Blick">
          {texte.vertrauen.map((v) => (
            <li key={v} className="flex items-center gap-1.5">
              <HakenKlein /> {v}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MarkenBild({ bild, className = "", vorladen = false }: { bild: Bild; className?: string; vorladen?: boolean }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl bg-[var(--m-primaer-hell)] ${className}`}>
      <Image src={bild.src} alt={bild.alt} width={bild.breite} height={bild.hoehe} sizes={bild.sizes} preload={vorladen} quality={75} className="h-full w-full object-cover" />
      {bild.symbolbild && <span className="absolute bottom-1.5 right-2 rounded bg-black/45 px-1.5 py-0.5 text-[10px] font-medium text-white">{T.fastFertig.symbolbild}</span>}
    </div>
  );
}

function Fortschritt({ nr, von }: { nr: number; von: number }) {
  return (
    <div className="mb-4">
      <div className={`mb-1.5 text-[13px] font-medium ${textLeise}`}>{T.fortschritt(nr, von)}</div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--m-primaer-hell)]" role="progressbar" aria-valuemin={0} aria-valuemax={von} aria-valuenow={nr} aria-label={T.fortschritt(nr, von)}>
        <div className="h-full rounded-full bg-[var(--m-primaer)] transition-all duration-300" style={{ width: `${Math.round((nr / von) * 100)}%` }} />
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
  waehle: (wert: string) => void;
  weiter: () => void;
  absenden: () => void;
  gehe: (id: string) => void;
  datenschutzEmail: string;
  partnerHref: string;
  experte: Experte | null;
};

const frageKlasse = "text-[20px] font-bold leading-snug tracking-[-0.01em] outline-none sm:text-[22px]";

function SchrittInhalt(p: InhaltProps) {
  const { schritt, texte } = p;
  if (schritt.art === "auswahl") {
    return (
      <div>
        {/* Beim Start steht die große Überschrift (Fokus) über der Karte */}
        <h2 data-fokus={p.istStart ? undefined : "titel"} tabIndex={-1} className={frageKlasse}>
          {texte.frage}
        </h2>
        {texte.hinweis && <p className={`mt-1 text-[15px] ${textLeise}`}>{texte.hinweis}</p>}
        <div className={`mt-4 grid gap-2.5 ${schritt.spalten === 2 ? "grid-cols-2" : "grid-cols-1"}`} role="radiogroup" aria-label={texte.frage}>
          {schritt.optionen.map((o) => {
            const an = (p.gewaehlt ?? p.antworten[schritt.feld]) === o;
            return (
              <button
                key={o}
                type="button"
                role="radio"
                aria-checked={an}
                onClick={() => p.waehle(o)}
                lang="de"
                className={`flex min-h-14 items-center justify-between gap-2 rounded-xl border-2 py-3 text-left text-[16px] font-semibold leading-tight transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--m-primaer-hell)] ${schritt.spalten === 2 ? "px-3" : "px-4"} ${
                  an ? "border-[var(--m-primaer)] bg-[var(--m-primaer-hell)] text-[var(--m-primaer-dunkel)]" : "border-[var(--m-option-rand)] bg-white text-[var(--m-text)] hover:border-[var(--m-primaer)]"
                }`}
              >
                <span className="min-w-0 hyphens-auto">{optionLabel(schritt, o).replace("/", "/\u200B")}</span>
                {an && <HakenKlein className="h-5 w-5 shrink-0 text-[var(--m-primaer)]" />}
              </button>
            );
          })}
        </div>
        {p.fehler[schritt.feld] && <p className={`mt-2 text-[15px] ${fehlerText}`}>{p.fehler[schritt.feld]}</p>}
      </div>
    );
  }

  if (schritt.art === "eingabe" || schritt.art === "absenden") {
    const einzel = schritt.felder.length === 1;
    return (
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (schritt.art === "absenden") p.absenden();
          else p.weiter();
        }}
      >
        {texte.ueberschrift && (
          <div className="mb-4">
            <p className="text-[18px] font-bold leading-snug text-[var(--m-primaer-dunkel)]">
              {texte.ueberschrift}
              {texte.fussnote && <sup className="ml-0.5 text-[12px]">*</sup>}
            </p>
            {texte.fussnote && <p className={`mt-1 text-[13px] leading-snug ${textLeise}`}>* {texte.fussnote}</p>}
          </div>
        )}
        <h2 data-fokus="titel" tabIndex={-1} className={frageKlasse}>
          {texte.frage}
        </h2>
        {texte.hinweis && <p className={`mt-1 text-[15px] leading-snug ${textLeise}`}>{texte.hinweis}</p>}
        <div className={`mt-4 ${schritt.felder.some((x) => x.schmal) ? "grid grid-cols-[7.5rem_1fr] gap-2.5" : "space-y-4"}`}>
          {schritt.felder.map((fd, i) => (
            <Feld key={fd.feld} fd={fd} einzel={einzel} wert={p.antworten[fd.feld] ?? ""} fehler={p.fehler[fd.feld]} setze={p.setze} erstes={i === 0} />
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
        {/* L1: Einwilligung direkt über dem Knopf, normale Schrift */}
        {schritt.art === "absenden" && <Einwilligung email={p.datenschutzEmail} partnerHref={p.partnerHref} />}
        <button type="submit" className={`${knopf} ${schritt.art === "absenden" ? "mt-3" : "mt-5"}`} disabled={p.sendet}>
          {p.sendet ? T.kontakt.sendet : (texte.knopf ?? T.weiter)}
        </button>
        {p.meldung && (
          <p className={`mt-3 text-[15px] ${fehlerText}`} role="alert">
            {p.meldung}
          </p>
        )}
        {texte.nachsatz && <p className={`mt-2.5 text-center text-[13px] ${textLeise}`}>{texte.nachsatz}</p>}
        {"vertraulich" in schritt && schritt.vertraulich && (
          <p className={`mt-3 flex items-center justify-center gap-1.5 text-[14px] ${textLeise}`}>
            <Schloss /> {schritt.vertraulich}
          </p>
        )}
      </form>
    );
  }

  if (schritt.art === "info") {
    const bild = schritt.bild ? p.marke.bilder[schritt.bild] : undefined;
    return (
      <div className="text-center">
        {bild ? (
          <MarkenBild bild={bild} className="mx-auto mb-4 aspect-video max-h-40 max-w-[284px]" />
        ) : (
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--m-primaer-hell)] text-[var(--m-primaer)]">
            <Haken />
          </div>
        )}
        <h2 data-fokus="titel" tabIndex={-1} className="text-[22px] font-bold leading-snug tracking-[-0.01em] outline-none">
          {texte.ueberschrift}
        </h2>
        {texte.text?.map((t, i) => (
          <p key={i} className={`mt-3 text-[16px] leading-relaxed ${textLeise}`}>
            {t}
          </p>
        ))}
        <button type="button" className={`${knopf} mt-6`} onClick={p.weiter}>
          {texte.knopf ?? T.weiter}
        </button>
      </div>
    );
  }

  if (schritt.art === "danke") {
    return (
      <div className="py-1">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--m-primaer)]">
          <Bildzeichen className="h-8 w-8" hell />
        </div>
        <h2 data-fokus="titel" tabIndex={-1} className="text-center text-[22px] font-bold leading-snug tracking-[-0.01em] outline-none">
          {texte.ueberschrift}
        </h2>
        {p.experte && (
          <div className="mt-5 rounded-xl border border-[var(--m-deko)] bg-[var(--m-primaer-hell)] p-4 text-[16px]">
            <p className="text-[13px] font-semibold uppercase tracking-wide text-[var(--m-primaer-dunkel)]">{T.danke.experte}</p>
            <p className="mt-1 font-semibold">{p.experte.name}</p>
            <p className={textLeise}>{p.experte.firma}</p>
          </div>
        )}
        {texte.frage && <p className="mt-5 font-semibold">{texte.frage}</p>}
        {texte.liste && (
          <ol className="mt-3 space-y-3">
            {texte.liste.map((t, i) => (
              <li key={i} className="flex gap-3 text-[16px] leading-snug">
                <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--m-primaer-hell)] text-[14px] font-bold text-[var(--m-primaer)]">
                  {i + 1}
                </span>
                <span className="pt-0.5">{t}</span>
              </li>
            ))}
          </ol>
        )}
        {texte.nachsatz && <p className={`mt-5 border-t border-[var(--m-karte-rand)] pt-4 text-[15px] ${textLeise}`}>{texte.nachsatz}</p>}
      </div>
    );
  }

  // Endseite (nicht passend): freundlich, mit Rücksprung
  return (
    <div className="py-1 text-center">
      <h2 data-fokus="titel" tabIndex={-1} className="text-[22px] font-bold leading-snug tracking-[-0.01em] outline-none">
        {texte.ueberschrift}
      </h2>
      {texte.text?.map((t, i) => (
        <p key={i} className={`mt-3 text-[16px] leading-relaxed ${textLeise}`}>
          {t}
        </p>
      ))}
      {schritt.art === "ende" && (
        <button type="button" className={`${knopfZweit} mt-6`} onClick={() => p.gehe(schritt.zurueckZu)}>
          {texte.knopf}
        </button>
      )}
    </div>
  );
}

/** Einwilligung (L1): Partnerliste und Datenschutz als Links in neuem Tab, Widerrufsadresse eingesetzt. */
function Einwilligung({ email, partnerHref }: { email: string; partnerHref: string }) {
  return (
    <p className="mt-5 text-[13px] leading-[1.5] text-[var(--m-text)]">
      {einwilligungTeile(email).map((t, i) =>
        typeof t === "string" ? (
          <span key={i}>{t}</span>
        ) : "email" in t ? (
          <a key={i} href={`mailto:${t.email}`} className={`${linkKlasse} break-all`}>
            {t.email}
          </a>
        ) : (
          <a key={i} href={t.link === "partner" ? partnerHref : T.datenschutzUrl} target="_blank" rel="noopener" className={linkKlasse}>
            {t.text}
          </a>
        ),
      )}
    </p>
  );
}

function Feld({ fd, einzel, wert, fehler, setze, erstes }: { fd: Eingabefeld; einzel: boolean; wert: string; fehler?: string; setze: (f: keyof Antworten, w: string) => void; erstes?: boolean }) {
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
  return (
    <div>
      <label htmlFor={id} className={einzel ? "sr-only" : "mb-1.5 block text-[15px] font-semibold text-[var(--m-text)]"}>
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
          className={`${inputKlasse} ${fd.einheit ? "pr-28" : ""}`}
        />
        {fd.einheit && <span className={`pointer-events-none absolute inset-y-0 right-4 flex items-center text-base ${textLeise}`}>{fd.einheit}</span>}
      </div>
      {fehler ? (
        <p id={`${id}-fehler`} className={`mt-1.5 text-[15px] ${fehlerText}`}>
          {fehler}
        </p>
      ) : (
        fd.hinweis && (
          <p id={`${id}-hinweis`} className={`mt-1.5 text-[14px] ${textLeise}`}>
            {fd.hinweis}
          </p>
        )
      )}
    </div>
  );
}

function Haken() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
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

function Schloss() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}
