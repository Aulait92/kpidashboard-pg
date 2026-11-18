"use client";

// Formular der Maklervollmacht (Handy zuerst): 1 Daten prüfen, 2 Verträge, 3 Unterschreiben. Eingaben bleiben bei Fehlern
// erhalten (Zustand im Browser). Unterschrift auf einer Zeichenfläche (Finger oder Maus), als PNG an den Server.

import { datumBeimTippen, datumGueltig } from "@/lib/datum-eingabe";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Plus, RotateCcw, Trash2 } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { a, type Ansprache } from "@/lib/ansprache";
import { VV_SPARTEN, gesundheitNoetig, type VvDaten, type VvVertrag } from "@/lib/maklervollmacht/regeln";
import { GESUNDHEIT_HAEKCHEN, ZUSTIMMUNG_TEXT, einwilligungGesundheit, hinweisUnterschrift, maklerauftrag, vollmacht, type VvMakler } from "@/lib/maklervollmacht/texte";
import { unterschreibenAction, type VollmachtState } from "./actions";

const feld = "h-12 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-base outline-none focus:border-[color:var(--brand)]";
const label = "mb-1 block text-sm font-medium";

export function VollmachtFormular({
  token,
  an,
  makler,
  vorschlag,
  gesellschaften,
  erstinfoUrl,
}: {
  token: string;
  an: Ansprache;
  makler: VvMakler;
  vorschlag: Partial<VvDaten>;
  gesellschaften: string[];
  erstinfoUrl: string | null;
}) {
  const [state, action, pending] = useActionState<VollmachtState, FormData>(unterschreibenAction.bind(null, token), {});
  const [d, setD] = useState({
    vorname: vorschlag.vorname ?? "",
    nachname: vorschlag.nachname ?? "",
    strasse: vorschlag.strasse ?? "",
    plz: vorschlag.plz ?? "",
    ort: vorschlag.ort ?? "",
    geburtsdatum: "",
    email: vorschlag.email ?? "",
  });
  const [vertraege, setVertraege] = useState<VvVertrag[]>([{ versicherer: "", sparte: "haftpflicht", vertragsnummer: "" }]);
  const [gesundheit, setGesundheit] = useState(false);
  const [zustimmung, setZustimmung] = useState(false);
  const [signatur, setSignatur] = useState("");
  const mitGesundheit = gesundheitNoetig(vertraege);

  // Vorschau der Dokumente mit den aktuellen Eingaben
  const vorschau = useMemo(() => {
    const c = {
      makler,
      kunde: { ...d, email: d.email || null, geburtsdatum: d.geburtsdatum || "…" },
      vertraege: vertraege.filter((v) => v.versicherer.trim()).map((v) => ({ ...v, vertragsnummer: v.vertragsnummer || null })),
      datum: new Date().toLocaleDateString("de-DE"),
      uhrzeit: "",
      dokumentId: "wird beim Unterschreiben vergeben",
    };
    return [vollmacht(c), maklerauftrag(c), ...(mitGesundheit ? [einwilligungGesundheit(c, an)] : [])];
  }, [d, vertraege, makler, an, mitGesundheit]);

  if (state.fertig) {
    return (
      <div data-vollmacht-fertig>
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">Vielen Dank!</h1>
        <p className="mt-2 text-[15px] text-[color:var(--muted)]">
          {a(an, `Deine Vollmacht ist unterschrieben. ${makler.name} kümmert sich jetzt um die Übertragung deiner Verträge.`, `Ihre Vollmacht ist unterschrieben. ${makler.name} kümmert sich jetzt um die Übertragung Ihrer Verträge.`)}
          {state.mailGesendet ? a(an, " Eine Kopie ist per E-Mail unterwegs.", " Eine Kopie ist per E-Mail unterwegs.") : ""}
        </p>
      </div>
    );
  }

  const setVertrag = (i: number, patch: Partial<VvVertrag>) => setVertraege((vs) => vs.map((v, j) => (j === i ? { ...v, ...patch } : v)));

  return (
    <form action={action} className="space-y-7" data-vollmacht-form>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Maklervollmacht</h1>
        <p className="mt-1 text-[15px] text-[color:var(--muted)]">{a(an, "In zwei Minuten erledigt.", "In zwei Minuten erledigt.")}</p>
      </div>

      <section>
        <h2 className="mb-3 text-base font-semibold">1. {a(an, "Deine Daten", "Ihre Daten")}</h2>
        <div className="grid grid-cols-2 gap-3">
          <Feld name="vorname" label="Vorname" value={d.vorname} onChange={(v) => setD({ ...d, vorname: v })} auto="given-name" />
          <Feld name="nachname" label="Nachname" value={d.nachname} onChange={(v) => setD({ ...d, nachname: v })} auto="family-name" />
          <div className="col-span-2">
            <Feld name="strasse" label="Straße und Hausnummer" value={d.strasse} onChange={(v) => setD({ ...d, strasse: v })} auto="street-address" />
          </div>
          <Feld name="plz" label="PLZ" value={d.plz} onChange={(v) => setD({ ...d, plz: v.replace(/\D/g, "").slice(0, 5) })} auto="postal-code" mode="numeric" />
          <Feld name="ort" label="Ort" value={d.ort} onChange={(v) => setD({ ...d, ort: v })} auto="address-level2" />
          <Feld name="geburtsdatum" label="Geburtsdatum" value={d.geburtsdatum} onChange={(v) => setD({ ...d, geburtsdatum: datumBeimTippen(v) })} placeholder="TT.MM.JJJJ" auto="bday" mode="numeric" />
          {d.geburtsdatum.length >= 10 && !datumGueltig(d.geburtsdatum, { min: 1900, max: new Date().getFullYear() }) ? (
            <p className="text-sm text-red-700" role="alert">Bitte ein gültiges Datum eingeben, z. B. 22.11.1990.</p>
          ) : null}
          <Feld name="email" label="E-Mail für die Kopie" value={d.email} onChange={(v) => setD({ ...d, email: v })} auto="email" type="email" />
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-base font-semibold">2. {a(an, "Deine Verträge", "Ihre Verträge")}</h2>
        <p className="mb-3 text-sm text-[color:var(--muted)]">{a(an, "Die Vertragsnummer steht auf dem Versicherungsschein. Fehlt sie, kümmert sich dein Makler darum.", "Die Vertragsnummer steht auf dem Versicherungsschein. Fehlt sie, kümmert sich Ihr Makler darum.")}</p>
        <datalist id="vv-gesellschaften">
          {gesellschaften.map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>
        <ul className="space-y-3">
          {vertraege.map((v, i) => (
            <li key={i} className="rounded-[var(--radius-md)] border border-[color:var(--border)] p-3" data-vv-vertrag>
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <label className={label}>Versicherer</label>
                  <input list="vv-gesellschaften" value={v.versicherer} onChange={(e) => setVertrag(i, { versicherer: e.target.value })} className={feld} placeholder="z. B. Allianz" data-vv-versicherer />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className={label}>Sparte</label>
                  <select value={v.sparte} onChange={(e) => setVertrag(i, { sparte: e.target.value })} className={feld}>
                    {VV_SPARTEN.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className={label}>Vertragsnummer</label>
                  <input value={v.vertragsnummer ?? ""} onChange={(e) => setVertrag(i, { vertragsnummer: e.target.value })} className={feld} placeholder="optional" />
                </div>
              </div>
              {vertraege.length > 1 ? (
                <button type="button" onClick={() => setVertraege((vs) => vs.filter((_, j) => j !== i))} className="mt-2 inline-flex min-h-10 items-center gap-1 text-sm text-[color:var(--muted)] hover:text-rose-700">
                  <Trash2 className="h-4 w-4" /> Entfernen
                </button>
              ) : null}
            </li>
          ))}
        </ul>
        {vertraege.length < 30 ? (
          <button type="button" onClick={() => setVertraege((vs) => [...vs, { versicherer: "", sparte: "hausrat", vertragsnummer: "" }])} className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-[15px] font-medium text-[color:var(--brand)]" data-vv-mehr>
            <Plus className="h-4 w-4" /> Weiteren Vertrag
          </button>
        ) : null}
        <input type="hidden" name="vertraege" value={JSON.stringify(vertraege)} />
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold">3. Unterschreiben</h2>
        {mitGesundheit ? (
          <label className="mb-4 flex items-start gap-3 rounded-[var(--radius-md)] border border-[color:var(--border)] p-3 text-sm" data-vv-gesundheit>
            <input type="checkbox" name="gesundheit" value="ja" checked={gesundheit} onChange={(e) => setGesundheit(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0" />
            <span>
              {GESUNDHEIT_HAEKCHEN}
              <span className="mt-1 block text-xs text-[color:var(--muted)]">{a(an, "Ohne Häkchen gilt die Vollmacht trotzdem; dein Makler bekommt dann keine Gesundheitsangaben.", "Ohne Häkchen gilt die Vollmacht trotzdem; Ihr Makler bekommt dann keine Gesundheitsangaben.")}</span>
            </span>
          </label>
        ) : null}
        <p className="mb-2 text-sm text-[color:var(--muted)]">{hinweisUnterschrift(an, makler.name)}</p>
        <Unterschrift onChange={setSignatur} />
        <input type="hidden" name="unterschrift" value={signatur} />
        <label className="mt-4 flex items-start gap-3 text-sm" data-vv-zustimmung>
          <input type="checkbox" name="zustimmung" value="ja" checked={zustimmung} onChange={(e) => setZustimmung(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0" />
          <span>{ZUSTIMMUNG_TEXT}</span>
        </label>
        <details className="mt-3 text-sm">
          <summary className="min-h-10 cursor-pointer py-2 font-medium text-[color:var(--brand)]">Dokumente lesen</summary>
          <div className="mt-2 max-h-80 space-y-4 overflow-y-auto rounded-[var(--radius-sm)] bg-[color:var(--surface-sunken)] p-3 text-[13px] leading-relaxed">
            {vorschau.map((ab) => (
              <div key={ab.titel}>
                <p className="font-semibold">{ab.titel}</p>
                {ab.absaetze.slice(0, -1).map((t, i) => (
                  <p key={i} className="mt-1">
                    {t}
                  </p>
                ))}
              </div>
            ))}
            {erstinfoUrl ? (
              <a href={erstinfoUrl} target="_blank" rel="noopener noreferrer" className="inline-block font-medium text-[color:var(--brand)] underline">
                Erstinformation des Maklers
              </a>
            ) : null}
          </div>
        </details>
      </section>

      {state.error ? (
        <p className="rounded-[var(--radius-sm)] bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800" role="alert" data-vv-fehler>
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className={buttonClass("primary", "md", "h-12 w-full text-base")} data-vv-senden>
        {pending ? "Wird unterschrieben …" : "Vollmacht unterschreiben"}
      </button>
    </form>
  );
}

function Feld(p: { name: string; label: string; value: string; onChange: (v: string) => void; auto?: string; type?: string; placeholder?: string; mode?: "numeric" | "text" }) {
  return (
    <div className="min-w-0">
      <label htmlFor={`vv-${p.name}`} className={label}>
        {p.label}
      </label>
      <input
        id={`vv-${p.name}`}
        name={p.name}
        type={p.type ?? "text"}
        value={p.value}
        onChange={(e) => p.onChange(e.target.value)}
        autoComplete={p.auto}
        placeholder={p.placeholder}
        inputMode={p.mode}
        className={feld}
      />
    </div>
  );
}

/** Zeichenfläche für die Unterschrift (Pointer-Events: Finger, Stift, Maus). Liefert ein PNG als Data-URL oder "". */
function Unterschrift({ onChange }: { onChange: (dataUrl: string) => void }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const zeichnet = useRef(false);
  const punkte = useRef(0);
  const [leer, setLeer] = useState(true);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const r = c.getBoundingClientRect();
    c.width = Math.round(r.width * dpr);
    c.height = Math.round(r.height * dpr);
    const ctx = c.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f172a";
  }, []);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const ende = () => {
    if (!zeichnet.current) return;
    zeichnet.current = false;
    if (punkte.current > 8 && ref.current) {
      setLeer(false);
      onChange(ref.current.toDataURL("image/png"));
    }
  };
  const neu = () => {
    const c = ref.current;
    if (!c) return;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    punkte.current = 0;
    setLeer(true);
    onChange("");
  };

  return (
    <div>
      <div className="relative">
        <canvas
          ref={ref}
          className="block h-40 w-full touch-none rounded-[var(--radius-md)] border-2 border-dashed border-[color:var(--border-strong)] bg-white"
          aria-label="Unterschriftsfeld"
          data-vv-canvas
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            const ctx = e.currentTarget.getContext("2d")!;
            const p = pos(e);
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            zeichnet.current = true;
          }}
          onPointerMove={(e) => {
            if (!zeichnet.current) return;
            const ctx = e.currentTarget.getContext("2d")!;
            const p = pos(e);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
            punkte.current++;
          }}
          onPointerUp={ende}
          onPointerCancel={ende}
          onPointerLeave={ende}
        />
        {leer ? <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-[color:var(--muted)]">Hier mit dem Finger unterschreiben</span> : null}
      </div>
      {!leer ? (
        <button type="button" onClick={neu} className="mt-1 inline-flex min-h-10 items-center gap-1 text-sm text-[color:var(--muted)]">
          <RotateCcw className="h-4 w-4" /> Neu unterschreiben
        </button>
      ) : null}
    </div>
  );
}
