"use client";

// Angebote zum Termin (Ole, 15.11.2026): auslesen lassen oder eintragen, prüfen, Empfehlung markieren, bestätigen.
// Je Sparte eine Tabelle wie im Tarifrechner: Stufen als Spalten, Beitrag und Merkmale als Zeilen, direkt änderbar.
// Leistungen, Ausschlüsse und Bausteine je Stufe unter „Für die Folien“. Erst bestätigte Angebote kommen in die Präsentation.

import { useState, useTransition } from "react";
import { CheckCircle2, Paperclip, Plus, Sparkles, Trash2, X } from "lucide-react";
import { FileDrop } from "@/components/ui/file-drop";
import { Button } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import type { AngebotItem } from "@/lib/angebote";
import { angeboteAuslesenAction, angeboteSpeichernAction } from "./actions";

type BRow = { name: string; beitrag: string; aktiv: boolean };
type Stufe = { tarif: string; beitrag: string; sb: string; empfohlen: boolean; leistungen: string; ausschluesse: string; bausteine: BRow[]; werte: string[] };
type Gruppe = { sparte: string; gesellschaft: string; merkmale: string[]; stufen: Stufe[] };

const zahl = (n: number | null, nachkomma = true) => (n != null ? (nachkomma ? n.toFixed(2) : String(n)).replace(".", ",") : "");

function gruppieren(items: AngebotItem[]): Gruppe[] {
  const out: Gruppe[] = [];
  for (const i of items) {
    let g = out.find((x) => x.sparte === i.sparte);
    if (!g) out.push((g = { sparte: i.sparte, gesellschaft: i.gesellschaft ?? "", merkmale: [], stufen: [] }));
    for (const m of i.merkmale) if (!g.merkmale.includes(m.name)) g.merkmale.push(m.name);
  }
  for (const g of out)
    g.stufen = items
      .filter((i) => i.sparte === g.sparte)
      .map((i) => ({
        tarif: i.tarif ?? "",
        beitrag: zahl(i.beitragMonat),
        sb: i.selbstbeteiligung ?? "",
        empfohlen: i.empfohlen,
        leistungen: i.leistungen.join("\n"),
        ausschluesse: i.ausschluesse.join("\n"),
        bausteine: i.bausteine.map((b) => ({ name: b.name, beitrag: zahl(b.beitrag, false), aktiv: b.aktiv })),
        werte: g.merkmale.map((n) => i.merkmale.find((m) => m.name === n)?.wert ?? ""),
      }));
  return out;
}

const zeilen = (t: string) => t.split("\n").map((x) => x.trim()).filter(Boolean);

function flach(gs: Gruppe[]) {
  return gs.flatMap((g) =>
    g.stufen.map((s) => ({
      sparte: g.sparte,
      gesellschaft: g.gesellschaft || null,
      tarif: s.tarif || null,
      beitragMonat: s.beitrag ? Number(s.beitrag.replace(",", ".")) : null,
      selbstbeteiligung: s.sb || null,
      leistungen: zeilen(s.leistungen),
      ausschluesse: zeilen(s.ausschluesse),
      empfohlen: s.empfohlen,
      bausteine: s.bausteine.filter((b) => b.name.trim() && b.beitrag.trim()).map((b) => ({ name: b.name.trim(), beitrag: b.beitrag.replace(",", "."), aktiv: b.aktiv })),
      merkmale: g.merkmale.map((n, j) => ({ name: n.trim(), wert: s.werte[j]?.trim() || "nein" })).filter((m) => m.name),
    })),
  );
}

const neueStufe = (n: number, tarif = ""): Stufe => ({ tarif, beitrag: "", sb: "", empfohlen: false, leistungen: "", ausschluesse: "", bausteine: [], werte: Array(n).fill("") });

const cell = "h-9 w-full min-w-[72px] rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-2 text-center text-sm";
const area = "min-h-[72px] w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-2 py-1.5 text-sm";
const iconBtn = "rounded p-1.5 text-[color:var(--muted)] hover:bg-rose-50 hover:text-rose-700";

export function AngeboteEditor(p: {
  id: string;
  items: AngebotItem[];
  bestaetigt: boolean;
  dateien: { id: string; fileName: string }[];
  auslesenErlaubt: boolean;
  readOnly?: boolean;
  leadHref: string | null;
  leadId?: string | null;
  quelle?: string[];
}) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [gs, setGs] = useState<Gruppe[]>(() => gruppieren(p.items));
  const [dirty, setDirty] = useState(false);
  const ro = !!p.readOnly;
  const setG = (gi: number, fn: (g: Gruppe) => Gruppe) => {
    setGs((all) => all.map((g, j) => (j === gi ? fn(g) : g)));
    setDirty(true);
  };
  const setS = (gi: number, si: number, patch: Partial<Stufe>) => setG(gi, (g) => ({ ...g, stufen: g.stufen.map((s, k) => (k === si ? { ...s, ...patch } : s)) }));

  const save = (bestaetigen: boolean) =>
    start(async () => {
      const r = await angeboteSpeichernAction(p.id, { items: flach(gs) }, bestaetigen);
      if (!r.ok) return toast.show({ message: r.error ?? "Fehler", tone: "error" });
      setDirty(false);
      toast.show({ message: bestaetigen ? "Bestätigt, die Präsentation ist bereit" : "Gespeichert" });
    });
  // Angebote direkt hier hochladen (Ole, 15.11.2026: im Kontakt war nicht klar, wo sie hingehören), danach sofort auslesen
  const [laedt, setLaedt] = useState(false);
  const hochladen = async (list: File[]) => {
    if (!p.leadId || !list.length) return;
    setLaedt(true);
    try {
      for (const file of list) {
        const res = await fetch(`/api/buyer/leads/${p.leadId}/dateien?kind=angebot`, {
          method: "POST",
          headers: { "x-file-name": encodeURIComponent(file.name), "content-type": "application/octet-stream" },
          body: file,
        });
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(`${file.name}: ${j.error ?? "Hochladen hat nicht geklappt."}`);
      }
    } catch (e) {
      setLaedt(false);
      return toast.show({ message: e instanceof Error ? e.message : "Hochladen hat nicht geklappt.", tone: "error" });
    }
    setLaedt(false);
    if (!p.auslesenErlaubt) {
      toast.show({ message: list.length === 1 ? "Angebot gespeichert" : `${list.length} Angebote gespeichert` });
      return window.location.reload();
    }
    toast.show({ message: "Hochgeladen, die App liest die Angebote jetzt aus …" });
    auslesen();
  };
  const auslesen = () =>
    start(async () => {
      const r = await angeboteAuslesenAction(p.id);
      if (!r.ok) return toast.show({ message: r.error ?? "Fehler", tone: "error" });
      toast.show({ message: `${r.anzahl} ${r.anzahl === 1 ? "Angebot" : "Angebote"} ausgelesen. Bitte prüfen und bestätigen.` });
      window.location.reload();
    });

  const anzahl = gs.reduce((n, g) => n + g.stufen.length, 0);

  return (
    <div className="space-y-5 px-5 py-4 text-sm" data-angebote-editor>
      <div className="flex flex-wrap items-center gap-3">
        {p.leadId && !ro ? (
          <FileDrop
            variant="button"
            size="md"
            instant
            multiple
            maxFiles={10}
            icon={Paperclip}
            accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
            maxBytes={15 * 1024 * 1024}
            label="Angebote hochladen"
            pendingLabel="Lädt …"
            busy={laedt || pending}
            onFiles={(fs) => void hochladen(fs)}
          />
        ) : null}
        {p.auslesenErlaubt && p.dateien.length ? (
          <Button variant="secondary" size="md" icon={Sparkles} disabled={pending || ro || !p.dateien.length} onClick={auslesen}>
            {`Aus ${p.dateien.length} ${p.dateien.length === 1 ? "Angebot" : "Angeboten"} auslesen`}
          </Button>
        ) : null}
        <span className="text-[color:var(--muted)]">
          {p.dateien.length
            ? `Hochgeladen: ${p.dateien.map((d) => d.fileName).join(", ")}`
            : p.auslesenErlaubt
              ? "PDF oder Screenshots aus dem Tarifrechner hochladen, die App füllt die Tabelle."
              : "Noch kein Angebot hochgeladen."}{" "}
          {p.leadHref && p.dateien.length ? (
            <a className="font-medium text-[color:var(--brand)] underline" href={p.leadHref}>
              Im Kontakt ansehen
            </a>
          ) : null}
        </span>
      </div>
      <p className="text-xs text-[color:var(--muted)]" data-auslesen-hinweis>
        {p.auslesenErlaubt
          ? "Nur Sach-, Haftpflicht-, Rechtsschutz-, Unfall- und Tierangebote, keine Antragsunterlagen mit Gesundheitsfragen."
          : "Für dieses Produkt lesen wir Angebote nicht automatisch aus, weil sie Gesundheitsangaben enthalten können. Tragen Sie die Angebote hier ein."}
      </p>
      {p.quelle?.length && !p.bestaetigt ? (
        <div className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900" data-angebote-pruefen>
          Ausgelesen aus {p.quelle.join(", ")}. Bitte Beiträge und Werte mit dem Angebot vergleichen, Ihre Empfehlung prüfen und dann bestätigen.
        </div>
      ) : null}

      {gs.map((g, gi) => (
        <section key={gi} className="rounded-[var(--radius-md)] border border-[color:var(--border)]" data-sparte-tabelle>
          <div className="flex flex-wrap items-center gap-2 border-b border-[color:var(--border)] px-3 py-2">
            <input
              aria-label="Sparte"
              className="h-9 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-transparent bg-transparent px-2 text-base font-semibold hover:border-[color:var(--border)]"
              placeholder="Sparte, z. B. Privathaftpflicht"
              value={g.sparte}
              disabled={ro}
              onChange={(e) => setG(gi, (x) => ({ ...x, sparte: e.target.value }))}
            />
            <input
              aria-label="Gesellschaft"
              className="h-9 w-40 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-2 text-sm"
              placeholder="Gesellschaft"
              value={g.gesellschaft}
              disabled={ro}
              onChange={(e) => setG(gi, (x) => ({ ...x, gesellschaft: e.target.value }))}
            />
            {!ro ? (
              <button type="button" aria-label="Sparte entfernen" className={iconBtn} onClick={() => { setGs(gs.filter((_, j) => j !== gi)); setDirty(true); }}>
                <Trash2 className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0">
              <thead>
                <tr>
                  <th className="w-52 px-3 py-2" />
                  {g.stufen.map((s, si) => (
                    <th key={si} className={`px-2 pb-2 pt-3 ${s.empfohlen ? "bg-[color:var(--brand-soft)]" : ""}`}>
                      <div className="flex items-center gap-1">
                        <input aria-label="Stufe" className={`${cell} font-semibold`} placeholder="Stufe" value={s.tarif} disabled={ro} onChange={(e) => setS(gi, si, { tarif: e.target.value })} />
                        {!ro ? (
                          <button type="button" aria-label="Stufe entfernen" className={iconBtn} onClick={() => setG(gi, (x) => ({ ...x, stufen: x.stufen.filter((_, k) => k !== si) }))}>
                            <X className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>
                    </th>
                  ))}
                  {!ro && g.stufen.length < 4 ? (
                    <th className="px-2">
                      <button type="button" className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-[color:var(--brand)]" onClick={() => setG(gi, (x) => ({ ...x, stufen: [...x.stufen, neueStufe(x.merkmale.length)] }))}>
                        <Plus className="h-3.5 w-3.5" /> Stufe
                      </button>
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th className="px-3 py-1.5 text-left font-medium">Beitrag pro Monat (€)</th>
                  {g.stufen.map((s, si) => (
                    <td key={si} className={`px-2 py-1.5 ${s.empfohlen ? "bg-[color:var(--brand-soft)]" : ""}`}>
                      <input aria-label={`Beitrag ${s.tarif}`} className={`${cell} font-semibold tabular-nums`} inputMode="decimal" value={s.beitrag} disabled={ro} onChange={(e) => setS(gi, si, { beitrag: e.target.value })} />
                    </td>
                  ))}
                </tr>
                <tr>
                  <th className="px-3 py-1.5 text-left font-medium">Ihre Empfehlung</th>
                  {g.stufen.map((s, si) => (
                    <td key={si} className={`px-2 py-1.5 text-center ${s.empfohlen ? "bg-[color:var(--brand-soft)]" : ""}`}>
                      <label className="inline-flex items-center gap-1.5 text-xs font-medium">
                        <input
                          type="radio"
                          name={`empf-${gi}`}
                          checked={s.empfohlen}
                          disabled={ro}
                          onChange={() => setG(gi, (x) => ({ ...x, stufen: x.stufen.map((y, k) => ({ ...y, empfohlen: k === si })) }))}
                        />
                        {s.empfohlen ? "Empfohlen" : "Empfehlen"}
                      </label>
                    </td>
                  ))}
                </tr>
                {g.merkmale.map((n, mi) => (
                  <tr key={mi} className="border-t border-[color:var(--border)]">
                    <th className="px-3 py-1 text-left font-normal">
                      <div className="flex items-center gap-1">
                        <textarea
                          aria-label="Merkmal"
                          rows={n.length > 32 ? 3 : 2}
                          className="w-full min-w-[150px] resize-none rounded-[var(--radius-sm)] border border-transparent bg-transparent px-2 py-1 text-[13px] leading-tight hover:border-[color:var(--border)]"
                          value={n}
                          placeholder="Merkmal"
                          disabled={ro}
                          onChange={(e) => setG(gi, (x) => ({ ...x, merkmale: x.merkmale.map((y, k) => (k === mi ? e.target.value : y)) }))}
                        />
                        {!ro ? (
                          <button
                            type="button"
                            aria-label="Merkmal entfernen"
                            className={iconBtn}
                            onClick={() => setG(gi, (x) => ({ ...x, merkmale: x.merkmale.filter((_, k) => k !== mi), stufen: x.stufen.map((y) => ({ ...y, werte: y.werte.filter((_, k) => k !== mi) })) }))}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>
                    </th>
                    {g.stufen.map((s, si) => (
                      <td key={si} className={`px-2 py-1 ${s.empfohlen ? "bg-[color:var(--brand-soft)]" : ""}`}>
                        <input
                          aria-label={`${n} ${s.tarif}`}
                          className={cell}
                          placeholder="ja / nein / Wert"
                          value={s.werte[mi] ?? ""}
                          disabled={ro}
                          onChange={(e) => setS(gi, si, { werte: g.merkmale.map((_, k) => (k === mi ? e.target.value : s.werte[k] ?? "")) })}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="border-t border-[color:var(--border)]">
                  <th className="px-3 py-1.5 text-left font-medium">Selbstbeteiligung</th>
                  {g.stufen.map((s, si) => (
                    <td key={si} className={`px-2 py-1.5 ${s.empfohlen ? "bg-[color:var(--brand-soft)]" : ""}`}>
                      <input aria-label={`Selbstbeteiligung ${s.tarif}`} className={cell} placeholder="z. B. 150 €" value={s.sb} disabled={ro} onChange={(e) => setS(gi, si, { sb: e.target.value })} />
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          {!ro ? (
            <div className="px-3 py-2">
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs font-medium text-[color:var(--brand)]"
                onClick={() => setG(gi, (x) => ({ ...x, merkmale: [...x.merkmale, ""], stufen: x.stufen.map((y) => ({ ...y, werte: [...y.werte, ""] })) }))}
              >
                <Plus className="h-3.5 w-3.5" /> Merkmal (z. B. Versicherungssumme)
              </button>
            </div>
          ) : null}

          <details className="border-t border-[color:var(--border)] px-3 py-2">
            <summary className="cursor-pointer text-xs font-medium text-[color:var(--muted)]">Für die Folien: Leistungen, nicht versichert und Bausteine je Stufe</summary>
            <div className="mt-3 grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.max(1, g.stufen.length)}, minmax(180px, 1fr))` }}>
              {g.stufen.map((s, si) => (
                <div key={si} className="space-y-2">
                  <div className="text-xs font-semibold">{s.tarif || `Stufe ${si + 1}`}</div>
                  <label className="block">
                    <span className="text-xs text-[color:var(--muted)]">Wichtigste Leistungen (je Zeile eine)</span>
                    <textarea className={area} value={s.leistungen} disabled={ro} onChange={(e) => setS(gi, si, { leistungen: e.target.value })} />
                  </label>
                  <label className="block">
                    <span className="text-xs text-[color:var(--muted)]">Nicht versichert / Wartezeiten</span>
                    <textarea className={area} value={s.ausschluesse} disabled={ro} onChange={(e) => setS(gi, si, { ausschluesse: e.target.value })} />
                  </label>
                  <div>
                    <span className="text-xs text-[color:var(--muted)]">Bausteine mit Beitrag (z. B. Zahnbehandlung 4,10 oder höhere SB −2,80)</span>
                    {s.bausteine.map((b, bi) => {
                      const setB = (patch: Partial<BRow>) => setS(gi, si, { bausteine: s.bausteine.map((x, k) => (k === bi ? { ...x, ...patch } : x)) });
                      return (
                        <div key={bi} className="mt-1 flex items-center gap-1">
                          <input type="checkbox" title="Im Angebot enthalten" checked={b.aktiv} disabled={ro} onChange={(e) => setB({ aktiv: e.target.checked })} />
                          <input className="h-8 min-w-0 flex-1 rounded border border-[color:var(--border)] px-2 text-sm" placeholder="Baustein" value={b.name} disabled={ro} onChange={(e) => setB({ name: e.target.value })} />
                          <input className="h-8 w-20 rounded border border-[color:var(--border)] px-2 text-sm" placeholder="€" inputMode="decimal" value={b.beitrag} disabled={ro} onChange={(e) => setB({ beitrag: e.target.value })} />
                          {!ro ? (
                            <button type="button" aria-label="Baustein entfernen" className={iconBtn} onClick={() => setS(gi, si, { bausteine: s.bausteine.filter((_, k) => k !== bi) })}>
                              <X className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                        </div>
                      );
                    })}
                    {!ro && s.bausteine.length < 6 ? (
                      <button type="button" className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-[color:var(--brand)]" onClick={() => setS(gi, si, { bausteine: [...s.bausteine, { name: "", beitrag: "", aktiv: true }] })}>
                        <Plus className="h-3.5 w-3.5" /> Baustein
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </details>
        </section>
      ))}

      {!ro ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="ghost"
            size="md"
            icon={Plus}
            onClick={() => {
              setGs([...gs, { sparte: "", gesellschaft: gs[0]?.gesellschaft ?? "", merkmale: [], stufen: [neueStufe(0)] }]);
              setDirty(true);
            }}
          >
            Sparte hinzufügen
          </Button>
          {anzahl ? (
            <Button variant="primary" size="md" icon={CheckCircle2} disabled={pending} onClick={() => save(true)} data-angebote-bestaetigen>
              {p.bestaetigt && !dirty ? "Bestätigt" : "Prüfen und bestätigen"}
            </Button>
          ) : null}
          {dirty ? <span className="text-xs text-amber-700">Noch nicht gespeichert</span> : null}
        </div>
      ) : null}
    </div>
  );
}

