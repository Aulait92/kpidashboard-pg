"use client";

// Eigener Funnel im Browser (lib/funnel/definition.ts): eine Frage je Schritt, Auswahl per Tippen mit automatischem
// Weiter, Zurück mit erhaltenen Eingaben (auch Zurück-Taste des Handys), Fortschritt „Frage x von 7“, Messung je
// Schritt (/api/funnel/ereignis), Absenden (/api/funnel/absenden). Meta-Pixel erst nach Einwilligung (Cookie-Hinweis).
// Ohne zusätzliche Bibliotheken, damit die Seite auf dem Handy schnell lädt.

import { useEffect, useState, useSyncExternalStore } from "react";
import { datumTippen, funnelDef, naechsterSchritt, pruefeSchritt, texteFuer, type Antworten, type Eingabefeld, type Fehler, type Schritt, type Variante } from "@/lib/funnel/definition";
import { PKV_TEXTE as T } from "@/lib/funnel/pkv-beitrag-texte";

type Props = { funnelKey: string; besuchId: string; varianten: Record<string, Variante>; geladen: number; pixelId: string; einwilligungNoetig: boolean };

type Fbq = ((...args: unknown[]) => void) & { callMethod?: (...args: unknown[]) => void; queue: unknown[]; push: unknown; loaded: boolean; version: string };
declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

const EINWILLIGUNG_COOKIE = "pf_meta";
const QUELLE_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id", "campaign_id", "adset_id", "ad_id", "placement", "site_source_name", "fbclid"];

function ladePixel(id: string) {
  if (window.fbq) return;
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

const einwilligungHoerer = new Set<() => void>();
function abonniereEinwilligung(fn: () => void) {
  einwilligungHoerer.add(fn);
  return () => {
    einwilligungHoerer.delete(fn);
  };
}

function leseEinwilligung(): "ja" | "nein" | null {
  const m = /(?:^|;\s*)pf_meta=(ja|nein)/.exec(document.cookie);
  return (m?.[1] as "ja" | "nein" | undefined) ?? null;
}

const inputKlasse =
  "block w-full rounded-xl border border-slate-300 bg-white px-4 py-3.5 text-lg text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100 aria-[invalid=true]:border-rose-500";

export function FunnelClient({ funnelKey, besuchId, varianten, geladen, pixelId, einwilligungNoetig }: Props) {
  const f = funnelDef(funnelKey)!;
  const [schrittId, setSchrittId] = useState(f.schritte[0].id);
  const [verlauf, setVerlauf] = useState<string[]>([]);
  const [antworten, setAntworten] = useState<Antworten>({});
  const [fehler, setFehler] = useState<Fehler>({});
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const [sendet, setSendet] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  const gespeichert = useSyncExternalStore(abonniereEinwilligung, leseEinwilligung, () => "laedt" as const);
  const einwilligung: "ja" | "nein" | null | "laedt" = einwilligungNoetig ? gespeichert : "ja";
  const [hp, setHp] = useState("");

  const schritt = f.schritte.find((s) => s.id === schrittId)!;
  const texte = texteFuer(schritt, varianten[schritt.id] ?? "a");

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
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; lead?: boolean; fehler?: Fehler; schritt?: string | null; meldung?: string };
      if (res.ok && j.ok) {
        if (j.lead && einwilligung === "ja") window.fbq?.("track", "Lead", { content_name: "PKV-Tarifoptimierung" }, { eventID: eventId() });
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

  const entscheide = (e: "ja" | "nein") => {
    document.cookie = `${EINWILLIGUNG_COOKIE}=${e}; path=/; max-age=${180 * 86400}; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
    einwilligungHoerer.forEach((fn) => fn());
  };

  const zeigeFortschritt = "frageNr" in schritt && typeof schritt.frageNr === "number";
  const zeigeZurueck = verlauf.length > 0 && schritt.art !== "danke";
  const hinweisSichtbar = einwilligung === null;

  const setze = (feld: keyof Antworten, wert: string) => {
    setAntworten((a) => ({ ...a, [feld]: wert }));
    if (fehler[feld]) setFehler((e) => ({ ...e, [feld]: undefined }));
  };

  return (
    <div className={`flex min-h-dvh flex-col bg-slate-50 text-slate-900 ${hinweisSichtbar ? "pb-40 sm:pb-28" : ""}`}>
      <header className="mx-auto flex w-full max-w-xl items-center justify-between px-4 pt-4">
        <span className="text-sm font-semibold tracking-tight text-slate-700">{T.marke}</span>
        {zeigeZurueck ? (
          <button type="button" onClick={zurueck} className="-mr-2 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100">
            ‹ {T.zurueck}
          </button>
        ) : (
          <span />
        )}
      </header>

      <main className="mx-auto w-full max-w-xl flex-1 px-4 pb-8 pt-3">
        {schritt.id === f.schritte[0].id && texte.ueberschrift && (
          <div className="mb-5">
            <h1 data-fokus="titel" tabIndex={-1} className="text-[1.6rem] font-bold leading-tight tracking-tight outline-none sm:text-3xl">
              {texte.ueberschrift}
            </h1>
            {texte.text?.map((t, i) => (
              <p key={i} className="mt-3 text-[15px] leading-relaxed text-slate-600 sm:text-base">
                {t}
              </p>
            ))}
          </div>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7" aria-live="polite">
          {zeigeFortschritt && <Fortschritt nr={(schritt as { frageNr: number }).frageNr} von={f.fragenGesamt} />}
          <SchrittInhalt
            schritt={schritt}
            texte={texte}
            istStart={schritt.id === f.schritte[0].id}
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
          />
        </section>
      </main>

      <footer className="mx-auto w-full max-w-xl px-4 pb-6 text-center text-xs text-slate-500">
        <a href={T.impressumUrl} target="_blank" rel="noopener" className="underline-offset-2 hover:underline">
          {T.impressum}
        </a>
        <span className="mx-2">·</span>
        <a href={T.datenschutzUrl} target="_blank" rel="noopener" className="underline-offset-2 hover:underline">
          {T.datenschutz}
        </a>
      </footer>

      {hinweisSichtbar && (
        <div role="dialog" aria-label="Cookies" className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-8px_24px_-12px_rgba(15,23,42,0.25)] backdrop-blur">
          <div className="mx-auto flex max-w-xl flex-col gap-2.5 sm:flex-row sm:items-center">
            <p className="flex-1 text-[13px] leading-snug text-slate-700">
              {T.cookies.text}{" "}
              <a href={T.datenschutzUrl} target="_blank" rel="noopener" className="underline">
                {T.cookies.mehr}
              </a>
            </p>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <button type="button" onClick={() => entscheide("nein")} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800">
                {T.cookies.ablehnen}
              </button>
              <button type="button" onClick={() => entscheide("ja")} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800">
                {T.cookies.zustimmen}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Fortschritt({ nr, von }: { nr: number; von: number }) {
  return (
    <div className="mb-4">
      <div className="mb-1.5 text-xs font-medium text-slate-500">{T.fortschritt(nr, von)}</div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={von} aria-valuenow={nr}>
        <div className="h-full rounded-full bg-blue-600 transition-all duration-300" style={{ width: `${Math.round((nr / von) * 100)}%` }} />
      </div>
    </div>
  );
}

type InhaltProps = {
  schritt: Schritt;
  texte: ReturnType<typeof texteFuer>;
  istStart: boolean;
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
};

const knopf = "flex w-full items-center justify-center rounded-xl bg-blue-600 px-5 py-4 text-base font-semibold text-white shadow-sm transition hover:bg-blue-700 active:scale-[0.99] disabled:opacity-60";

function SchrittInhalt(p: InhaltProps) {
  const { schritt, texte } = p;
  if (schritt.art === "auswahl") {
    return (
      <div>
        {/* Beim Start steht die große Überschrift (Fokus) über der Karte */}
        <h2 data-fokus={p.istStart ? undefined : "titel"} tabIndex={-1} className="text-xl font-bold leading-snug tracking-tight outline-none sm:text-2xl">
          {texte.frage}
        </h2>
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
                className={`flex min-h-14 items-center justify-between gap-2 rounded-xl border-2 py-3 text-left text-[15px] font-semibold leading-tight transition active:scale-[0.98] ${schritt.spalten === 2 ? "px-3" : "px-4"} ${
                  an ? "border-blue-600 bg-blue-50 text-blue-900" : "border-slate-200 bg-white text-slate-800 hover:border-blue-300"
                }`}
              >
                <span className="min-w-0 hyphens-auto">{o}</span>
                {/* Kreis nur bei einer Spalte: in zwei Spalten braucht der Name die Breite (z. B. Bayerische Beamtenkasse) */}
                {schritt.spalten === 1 && <span aria-hidden className={`h-5 w-5 shrink-0 rounded-full border-2 ${an ? "border-blue-600 bg-blue-600 shadow-[inset_0_0_0_3px_white]" : "border-slate-300"}`} />}
              </button>
            );
          })}
        </div>
        {p.fehler[schritt.feld] && <p className="mt-2 text-sm text-rose-600">{p.fehler[schritt.feld]}</p>}
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
        {texte.ueberschrift && <p className="mb-1 text-sm font-semibold text-blue-700">{texte.ueberschrift}</p>}
        <h2 data-fokus="titel" tabIndex={-1} className="text-xl font-bold leading-snug tracking-tight outline-none sm:text-2xl">
          {texte.frage}
        </h2>
        {texte.hinweis && <p className="mt-1 text-sm text-slate-500">{texte.hinweis}</p>}
        <div className={`mt-4 ${schritt.felder.some((x) => x.schmal) ? "grid grid-cols-[7.5rem_1fr] gap-2.5" : "space-y-3"}`}>
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
        <button type="submit" className={`${knopf} mt-5`} disabled={p.sendet}>
          {p.sendet ? T.kontakt.sendet : texte.knopf ?? T.weiter}
        </button>
        {p.meldung && <p className="mt-3 text-sm text-rose-600" role="alert">{p.meldung}</p>}
        {"vertraulich" in schritt && schritt.vertraulich && (
          <p className="mt-3 flex items-center justify-center gap-1.5 text-sm text-slate-500">
            <Schloss /> {schritt.vertraulich}
          </p>
        )}
        {schritt.art === "absenden" && (
          <>
            <p className="mt-3 flex items-center justify-center gap-1.5 text-sm text-slate-500">
              <Schloss /> {T.name.vertraulich}
            </p>
            <p className="mt-3 text-xs leading-relaxed text-slate-500">{schritt.einwilligung}</p>
          </>
        )}
      </form>
    );
  }

  if (schritt.art === "info") {
    return (
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <Haken />
        </div>
        <h2 data-fokus="titel" tabIndex={-1} className="text-2xl font-bold tracking-tight outline-none">
          {texte.ueberschrift}
        </h2>
        {texte.text?.map((t, i) => (
          <p key={i} className="mt-3 text-[15px] leading-relaxed text-slate-600">
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
      <div className="py-2 text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <Haken />
        </div>
        <h2 data-fokus="titel" tabIndex={-1} className="text-2xl font-bold tracking-tight outline-none">
          {texte.ueberschrift}
        </h2>
        <p className="mt-1 font-semibold text-slate-800">{texte.frage}</p>
        {texte.text?.map((t, i) => (
          <p key={i} className="mt-3 text-[15px] leading-relaxed text-slate-600">
            {t}
          </p>
        ))}
      </div>
    );
  }

  // Endseite (nicht passend): freundlich, mit Korrektur
  return (
    <div className="py-2 text-center">
      <h2 data-fokus="titel" tabIndex={-1} className="text-2xl font-bold tracking-tight outline-none">
        {texte.ueberschrift}
      </h2>
      {texte.text?.map((t, i) => (
        <p key={i} className="mt-3 text-[15px] leading-relaxed text-slate-600">
          {t}
        </p>
      ))}
      {schritt.art === "ende" && (
        <button type="button" className="mt-6 w-full rounded-xl border-2 border-slate-200 bg-white px-5 py-3.5 text-base font-semibold text-slate-800 hover:border-blue-300" onClick={() => p.gehe(schritt.zurueckZu)}>
          {texte.knopf}
        </button>
      )}
    </div>
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
  return (
    <div>
      <label htmlFor={id} className={einzel ? "sr-only" : "mb-1 block text-sm font-medium text-slate-700"}>
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
          aria-describedby={fehler ? `${id}-fehler` : undefined}
          onChange={(e) => aendern(e.target.value)}
          className={`${inputKlasse} ${fd.einheit ? "pr-28" : ""}`}
        />
        {fd.einheit && <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-base text-slate-500">{fd.einheit}</span>}
      </div>
      {fehler && (
        <p id={`${id}-fehler`} className="mt-1.5 text-sm text-rose-600">
          {fehler}
        </p>
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

function Schloss() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}
