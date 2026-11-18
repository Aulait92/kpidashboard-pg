"use client";

// Bisheriger Vertrag (Paket P3b, Ole 17.11.2026). Wer: Vermittler vor dem Termin, oft am Handy. Aufgabe: den Vertrag,
// den der Kunde schon hat, neben die neuen Tarife auf die Vergleichsfolie bringen. Eine Karte unter den Tarifen der
// Sparte (gleiches Muster wie die Tarifkarten): was bekannt ist, Schalter „Auf der Folie“, „Ändern“ öffnet das Formular.
// Ohne Police (Ablage auf live noch aus) ist das Eintragen von Hand der häufigste Weg: Versicherer, Tarif aus dem
// Katalog oder eigener Name, Beitrag, Summe, Selbstbeteiligung, Hauptfälligkeit und Frist. Alles freiwillig.

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileClock, Plus } from "lucide-react";
import { Button } from "@/components/ui";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { bekannteGesellschaften, gesellschaftAusText, gesellschaftName } from "@/lib/tarifkatalog";
import { betrag, empfehlungVon, tarifMonat, type SparteWahl } from "@/lib/tarifauswahl";
import {
  beitragsUnterschiedJahr,
  betragText,
  bisherErlaubt,
  bisherHand,
  bisherMonat,
  bisherSichtbar,
  hatInhalt,
  kuendigungText,
  summeLabelFuer,
  unterschiedText,
  type BisherVertrag,
} from "@/lib/bisheriger-vertrag";
import { bisherTarifeAction, type BisherTarif } from "./neu-actions";

const eur = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
const geld = (n: number | null) => (n == null ? "" : n.toFixed(2).replace(".", ",").replace(/,00$/, ""));
const QUELLE: Record<BisherVertrag["quelle"], string> = { police: "Aus der Police", chat: "Laut Chat", hand: "Von Ihnen eingetragen" };
const heute = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date());

export function BisherKarte({
  sp,
  ro,
  gesundheitFrei,
  gesellschaften,
  anSparte,
}: {
  sp: SparteWahl;
  ro: boolean;
  gesundheitFrei: boolean;
  gesellschaften: { key: string; name: string }[];
  anSparte: (fn: (s: SparteWahl) => void) => void;
}) {
  const [offen, setOffen] = useState(false);
  const b = sp.bisher ?? null;

  if (!bisherErlaubt(sp.key, gesundheitFrei)) {
    return (
      <p className="px-1 text-xs text-[color:var(--muted)]" data-bisher-gesperrt>
        Bisheriger Vertrag: erst nach Freischaltung von Kranken, BU und Leben in den{" "}
        <Link href="/buyer/einstellungen" className="font-medium text-[color:var(--brand)] hover:underline">
          Einstellungen
        </Link>
        .
      </p>
    );
  }

  const formular = <BisherFormular open={offen} onClose={() => setOffen(false)} sp={sp} gesellschaften={gesellschaften} anSparte={anSparte} />;

  if (!b) {
    if (ro) return null;
    return (
      <>
        <button
          type="button"
          onClick={() => setOffen(true)}
          className="flex min-h-12 w-full items-center gap-2 rounded-[var(--radius-md)] border border-dashed border-[color:var(--border-strong)] bg-white px-3.5 py-2.5 text-left text-sm font-medium text-[color:var(--brand)] hover:bg-[color:var(--surface-sunken)]"
          data-bisher-eintragen
        >
          <Plus className="h-4 w-4 shrink-0" /> Bisherigen Vertrag eintragen
          <span className="ml-auto text-xs font-normal text-[color:var(--muted)]">für den Vergleich</span>
        </button>
        {formular}
      </>
    );
  }

  const sichtbar = bisherSichtbar(b);
  const monat = bisherMonat(b);
  const e = empfehlungVon(sp);
  const diff = beitragsUnterschiedJahr(e ? tarifMonat(sp, e) : null, monat);
  const name = [b.gesellschaft, b.tarif].filter(Boolean).join(" ") || "Versicherer offen";
  const zahlen = [
    monat != null ? `${eur(monat)} im Monat` : null,
    b.summe != null ? `${summeLabelFuer(sp.key)} ${betragText(b.summe)}` : null,
    b.sb != null ? (b.sb === 0 ? "ohne SB" : `SB ${betragText(b.sb)}`) : null,
  ].filter(Boolean);
  const kt = b.ablauf || b.kuendbarZum ? kuendigungText(b, heute()) : null;
  const fehlt = !hatInhalt(b);

  return (
    <div className={cn("min-w-0 rounded-[var(--radius-md)] border border-[color:var(--border)] px-3.5 py-3", sichtbar ? "bg-slate-50" : "bg-[color:var(--surface-sunken)] opacity-80")} data-bisher-karte={b.quelle}>
      <div className="flex items-start gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-200 text-slate-600">
          <FileClock className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <b className="block text-[15px]">Bisheriger Vertrag</b>
          <span className="block break-words text-[13px] text-[color:var(--foreground)]" data-bisher-name>
            {name}
          </span>
        </span>
        {!ro ? (
          <Button size="md" variant="ghost" onClick={() => setOffen(true)} data-bisher-aendern>
            {fehlt ? "Eintragen" : "Ändern"}
          </Button>
        ) : null}
      </div>
      <p className={cn("mt-2 text-[13px]", fehlt || monat == null ? "font-medium text-amber-700" : "text-[color:var(--foreground)]")} data-bisher-zahlen>
        {fehlt ? "Tarif und Beitrag fehlen" : [monat == null ? "Beitrag fehlt" : null, ...zahlen].filter(Boolean).join(" · ")}
      </p>
      {diff != null || kt ? (
        <p className="mt-0.5 text-xs text-[color:var(--muted)]" data-bisher-fuss>
          {[diff != null ? `Ihre Empfehlung: ${unterschiedText(diff)}` : null, kt ? (kt.startsWith("kündbar") ? kt[0].toUpperCase() + kt.slice(1) : kt) : null].filter(Boolean).join(" · ")}
        </p>
      ) : null}
      <div className="mt-1.5 flex min-h-8 items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-xs text-[color:var(--muted)]">
          {QUELLE[b.quelle]}
          {b.ungeprueft ? (
            <>
              {" · "}
              <span className="font-medium text-amber-700" data-bisher-pruefen>
                bitte prüfen
              </span>
            </>
          ) : null}
        </span>
        <label className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap text-xs text-[color:var(--muted)]">
          In Präsentation
          <button
            type="button"
            role="switch"
            aria-checked={sichtbar}
            aria-label="Bisherigen Vertrag in der Präsentation zeigen"
            disabled={ro}
            onClick={() => anSparte((s) => void (s.bisher && (s.bisher.zeigen = !sichtbar)))}
            className={cn("relative h-[22px] w-[38px] shrink-0 rounded-full transition", sichtbar ? "bg-[color:var(--brand)]" : "bg-slate-300")}
            data-bisher-schalter
          >
            <span className={cn("absolute top-[3px] h-4 w-4 rounded-full bg-white shadow transition-all", sichtbar ? "left-[19px]" : "left-[3px]")} />
          </button>
        </label>
      </div>
      {formular}
    </div>
  );
}

const FELD = "h-11 w-full min-w-0 rounded-[var(--radius-sm)] border border-[color:var(--border-strong)] bg-white px-3 text-[15px] focus:border-[color:var(--brand)] focus:outline-none";
const ANDERER = "__anderer__";

function GeldEingabe({ wert, onWert, label, platzhalter }: { wert: number | null; onWert: (n: number | null) => void; label: string; platzhalter?: string }) {
  const [text, setText] = useState(geld(wert));
  return (
    <label className="grid min-w-0 gap-1 text-[13px]">
      {label}
      <span className="flex h-11 items-center rounded-[var(--radius-sm)] border border-[color:var(--border-strong)] bg-white px-3 focus-within:border-[color:var(--brand)]">
        <input
          inputMode="decimal"
          value={text}
          placeholder={platzhalter}
          onChange={(e) => {
            setText(e.target.value);
            onWert(betrag(e.target.value));
          }}
          className="w-full min-w-0 bg-transparent text-right text-[15px] font-semibold tabular-nums outline-none"
        />
        <span className="ml-1 text-[color:var(--muted)]">€</span>
      </span>
    </label>
  );
}

function BisherFormular({
  open,
  onClose,
  sp,
  gesellschaften,
  anSparte,
}: {
  open: boolean;
  onClose: () => void;
  sp: SparteWahl;
  gesellschaften: { key: string; name: string }[];
  anSparte: (fn: (s: SparteWahl) => void) => void;
}) {
  const [e, setE] = useState<BisherVertrag>(() => bisherHand(sp.bisher));
  const [tarife, setTarife] = useState<BisherTarif[] | null>(null);
  const [eigenerName, setEigenerName] = useState(false);
  // Beim Öffnen mit dem aktuellen Stand beginnen
  const [warOffen, setWarOffen] = useState(open);
  if (open !== warOffen) {
    setWarOffen(open);
    if (open) {
      setE(bisherHand(sp.bisher));
      setEigenerName(false);
    }
  }
  const gKey = gesellschaftAusText(e.gesellschaft);
  // Tarife der Gesellschaft in dieser Sparte aus dem ganzen Katalog
  useEffect(() => {
    if (!open || !gKey) return;
    let aktuell = true;
    void bisherTarifeAction(sp.key, gKey).then((r) => {
      if (aktuell) setTarife(r.ok ? r.tarife : []);
    });
    return () => {
      aktuell = false;
    };
  }, [open, gKey, sp.key]);
  // nur Tarife der aktuell eingetragenen Gesellschaft (die Antwort zur vorigen kann noch da sein)
  const liste = gKey ? (tarife ?? []).filter((t) => t.id.startsWith(`${gKey}/`)) : [];
  const gewaehlt = liste.find((t) => t.id === e.katalogId) ?? null;
  const freiText = eigenerName || !liste.length || (!!e.tarif && !gewaehlt);
  const setze = (x: Partial<BisherVertrag>) => setE((alt) => ({ ...alt, ...x }));

  const uebernehmen = () => {
    const wahl = liste.find((t) => t.id === e.katalogId) ?? null;
    anSparte((s) => {
      const alt = s.bisher;
      // Merkmale: aus dem gewählten Katalogtarif; gleicher Tarif wie vorher: bisherige Werte (z. B. aus der Police) behalten
      const gleich = alt && (alt.katalogId ?? "") === (e.katalogId ?? "") && (alt.tarif ?? "") === (e.tarif ?? "");
      s.bisher = {
        ...e,
        quelle: "hand",
        zeigen: alt?.zeigen ?? null,
        katalogId: wahl?.id ?? null,
        werte: gleich ? { ...alt.werte } : wahl ? { ...wahl.werte } : {},
      };
      delete s.bisher.ungeprueft;
    });
    onClose();
  };
  const entfernen = () => {
    anSparte((s) => void delete s.bisher);
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Bisheriger Vertrag: ${sp.label}`}
      footer={
        <div className="flex shrink-0 items-center gap-2 border-t border-[color:var(--border)] px-5 py-3">
          {sp.bisher?.quelle === "hand" ? (
            <Button variant="ghost" size="md" onClick={entfernen} data-bisher-entfernen>
              Entfernen
            </Button>
          ) : (
            <Button variant="ghost" size="md" onClick={onClose}>
              Abbrechen
            </Button>
          )}
          <Button variant="primary" size="md" className="ml-auto" onClick={uebernehmen} data-bisher-uebernehmen>
            Übernehmen
          </Button>
        </div>
      }
    >
      <form
        className="grid gap-3.5 px-5 py-4"
        onSubmit={(ev) => {
          ev.preventDefault();
          uebernehmen();
        }}
        data-bisher-formular
      >
        <label className="grid gap-1 text-[13px]">
          Versicherer
          <input
            className={FELD}
            list={`bisher-ges-${sp.key}`}
            value={e.gesellschaft ?? ""}
            placeholder="z. B. HUK-COBURG"
            maxLength={60}
            onChange={(ev) => {
              const neu = ev.target.value;
              // andere Gesellschaft: Katalogtarif passt nicht mehr
              setE((alt) => ({ ...alt, gesellschaft: neu || null, ...(gesellschaftAusText(neu) !== gesellschaftAusText(alt.gesellschaft) ? { katalogId: null, tarif: null } : {}) }));
              setEigenerName(false);
            }}
            data-bisher-versicherer
          />
          <datalist id={`bisher-ges-${sp.key}`}>
            {/* Alle Versicherer, nicht nur die mit Tarifen im Katalog, alphabetisch (Ole, 18.11.2026: SIGNAL IDUNA fehlte) */}
            {[...new Map([...gesellschaften, ...bekannteGesellschaften().map((key) => ({ key, name: gesellschaftName(key) }))].map((g) => [g.key, g])).values()]
              .sort((x, y) => x.name.localeCompare(y.name, "de"))
              .map((g) => (
                <option key={g.key} value={g.name} />
              ))}
          </datalist>
        </label>

        <label className="grid gap-1 text-[13px]">
          Tarif
          {liste.length ? (
            <select
              className={FELD}
              value={freiText ? ANDERER : (e.katalogId ?? "")}
              onChange={(ev) => {
                const v = ev.target.value;
                if (v === ANDERER) {
                  setEigenerName(true);
                  setze({ katalogId: null, tarif: null });
                  return;
                }
                const t = liste.find((x) => x.id === v);
                setEigenerName(false);
                setze({ katalogId: t?.id ?? null, tarif: t?.kurz ?? null, gesellschaft: t?.gesellschaft ?? e.gesellschaft });
              }}
              data-bisher-tarif-wahl
            >
              <option value="">Tarif wählen</option>
              {liste.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.kurz}
                </option>
              ))}
              <option value={ANDERER}>Anderer Tarif</option>
            </select>
          ) : null}
          {freiText ? (
            <input className={FELD} value={e.tarif ?? ""} placeholder="Tarifname, falls bekannt" maxLength={80} onChange={(ev) => setze({ tarif: ev.target.value || null, katalogId: null })} data-bisher-tarif />
          ) : null}
        </label>

        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
          <GeldEingabe key={`b-${String(open)}`} label="Beitrag" wert={e.beitrag} onWert={(n) => setze({ beitrag: n })} />
          <span className="inline-flex h-11 shrink-0 overflow-hidden rounded-[var(--radius-sm)] border border-[color:var(--border)]" role="group" aria-label="Zahlweise">
            {(["monat", "jahr"] as const).map((z) => (
              <button
                key={z}
                type="button"
                aria-pressed={e.zahlweise === z}
                onClick={() => setze({ zahlweise: z })}
                className={cn("px-3.5 text-[13px] font-semibold", e.zahlweise === z ? "bg-[color:var(--brand-soft)] text-[color:var(--brand-dark)]" : "bg-white text-[color:var(--muted)]")}
              >
                {z === "monat" ? "Monat" : "Jahr"}
              </button>
            ))}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <GeldEingabe key={`s-${String(open)}`} label={summeLabelFuer(sp.key)} wert={e.summe} onWert={(n) => setze({ summe: n })} />
          <GeldEingabe key={`sb-${String(open)}`} label="Selbstbeteiligung" wert={e.sb} onWert={(n) => setze({ sb: n })} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="grid min-w-0 gap-1 text-[13px]">
            Hauptfälligkeit
            <input className={FELD} type="date" value={e.ablauf ?? ""} onChange={(ev) => setze({ ablauf: ev.target.value || null, kuendbarZum: null })} data-bisher-ablauf />
          </label>
          <label className="grid min-w-0 gap-1 text-[13px]">
            Kündigungsfrist
            <select className={FELD} value={e.fristMonate == null ? "" : String(e.fristMonate)} onChange={(ev) => setze({ fristMonate: ev.target.value === "" ? null : Number(ev.target.value) })} data-bisher-frist>
              <option value="">unbekannt</option>
              {[...new Set([1, 3, ...(e.fristMonate != null ? [e.fristMonate] : [])])]
                .sort((x, y) => x - y)
                .map((m) => (
                  <option key={m} value={String(m)}>
                    {m === 1 ? "1 Monat" : `${m} Monate`}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <button type="submit" hidden />
      </form>
    </Sheet>
  );
}
