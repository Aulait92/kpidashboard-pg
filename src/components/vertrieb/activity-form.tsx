"use client";

import { useEffect, useRef, useState } from "react";
import { logActivity, nichtErreichtVorschauAction } from "@/app/admin/vertrieb/actions";
import type { NichtErreichtVorschau } from "@/lib/vertrieb/nicht-erreicht-server";
import { LOSS_REASONS, OUTCOMES, TASK_TYPES } from "@/lib/vertrieb/crm";
import { useToast } from "@/components/ui/toast";

function addWorkdaysLocal(n: number): string {
  const d = new Date();
  let left = n;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) left--;
  }
  return d.toLocaleDateString("sv-SE");
}

export function ActivityForm({
  contactId,
  hasOpenTasks,
  offenesAngebot = null,
  onDone,
}: {
  contactId: string;
  hasOpenTasks: boolean;
  /** Bei „Verloren“: „Offenes Angebot auch als abgelehnt markieren?“ (Standard ja, gleicher Grund) */
  offenesAngebot?: { id: string; number: string } | null;
  /** Nach dem Speichern (z. B. Fenster schließen, neuer Admin) */
  onDone?: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const toast = useToast();
  const [outcomeId, setOutcomeId] = useState("nicht_erreicht");
  const outcome = OUTCOMES.find((o) => o.id === outcomeId)!;
  const [createTask, setCreateTask] = useState(!!outcome.task);
  const [title, setTitle] = useState(outcome.task?.title ?? "");
  const [type, setType] = useState<string>(outcome.task?.type ?? "NACHFASSEN");
  const [due, setDue] = useState(addWorkdaysLocal(outcome.task?.workdays ?? 1));
  const [art, setArt] = useState("ANRUF");
  // „Nicht erreicht“ nach einem Anruf: Texte vorher sehen und je Kanal wählen (Ole, 23.11.2026)
  const neAktiv = art === "ANRUF" && outcomeId === "nicht_erreicht";
  const [vorschau, setVorschau] = useState<NichtErreichtVorschau | null>(null);
  const laedt = neAktiv && !vorschau;
  useEffect(() => {
    if (!neAktiv || vorschau) return;
    let aktiv = true;
    nichtErreichtVorschauAction(contactId)
      .then((v) => {
        if (aktiv) setVorschau(v);
      })
      .catch(() => {
        if (aktiv) setVorschau({ stopp: "Fehler", hinweis: "Vorschau gerade nicht möglich." });
      });
    return () => {
      aktiv = false;
    };
  }, [neAktiv, vorschau, contactId]);

  function pick(id: string) {
    const o = OUTCOMES.find((x) => x.id === id)!;
    setOutcomeId(id);
    setCreateTask(!!o.task);
    if (o.task) {
      setTitle(o.task.title);
      setType(o.task.type);
      setDue(addWorkdaysLocal(o.task.workdays));
    }
  }

  return (
    <form
      ref={formRef}
      action={async (fd) => {
        const r = await logActivity(fd);
        // „Nicht erreicht“: was automatisch rausging (E-Mail, WhatsApp) oder warum nicht
        if (r?.hinweis) toast.show({ message: r.hinweis, durationMs: 8000 });
        formRef.current?.reset();
        setArt("ANRUF");
        setVorschau(null);
        pick("nicht_erreicht");
        onDone?.();
      }}
      className="space-y-3"
    >
      <input type="hidden" name="contactId" value={contactId} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[140px_1fr]">
        <div>
          <label className="label">Art</label>
          <select name="type" className="input" value={art} onChange={(e) => setArt(e.target.value)}>
            <option value="ANRUF">Anruf</option>
            <option value="EMAIL">E-Mail</option>
            <option value="NOTIZ">Notiz</option>
          </select>
        </div>
        <div>
          <label className="label">Ergebnis</label>
          <select name="outcome" className="input" value={outcomeId} onChange={(e) => pick(e.target.value)}>
            {OUTCOMES.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </div>
      </div>
      {outcome.needsReason && (
        <div>
          <label className="label">Grund</label>
          <select name="lossReason" className="input" defaultValue="KEIN_BEDARF">
            {LOSS_REASONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
          {offenesAngebot ? (
            <label className="mt-2 flex items-center gap-2 text-sm" data-angebot-ablehnen>
              <input type="checkbox" name="declineOfferId" value={offenesAngebot.id} defaultChecked className="h-4 w-4" />
              Offenes Angebot {offenesAngebot.number} auch als abgelehnt markieren
            </label>
          ) : null}
        </div>
      )}
      <div>
        <label className="label">Notiz</label>
        <textarea name="note" rows={2} className="input" placeholder="Was wurde besprochen?" />
      </div>

      {neAktiv ? <NichtErreichtNachricht vorschau={vorschau} laedt={laedt} /> : null}

      {!outcome.closesTasks && (
        <div className="rounded-lg bg-slate-50 p-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" name="createTask" checked={createTask} onChange={(e) => setCreateTask(e.target.checked)} />
            Folgeaufgabe anlegen
          </label>
          {createTask && (
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_140px_140px_100px]">
              <input name="taskTitle" value={title} onChange={(e) => setTitle(e.target.value)} className="input" required />
              <select name="taskType" value={type} onChange={(e) => setType(e.target.value)} className="input">
                {TASK_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
              <input name="taskDue" type="date" value={due} onChange={(e) => setDue(e.target.value)} className="input" required />
              <input name="taskTime" type="time" defaultValue="09:00" className="input" />
            </div>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {hasOpenTasks && !outcome.closesTasks ? (
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" name="closeOpen" defaultChecked />
            Offene Aufgaben dieses Kontakts als erledigt markieren
          </label>
        ) : <span />}
        <button className="btn-primary" disabled={neAktiv && laedt}>
          Speichern
        </button>
      </div>
    </form>
  );
}

/**
 * Vorschau der automatischen Nachricht nach „Nicht erreicht“, je Kanal mit Häkchen (gesendet wird nur Angehaktes).
 * Du/Sie umschaltbar, Mail bearbeitbar (Ole, 23.11.2026); WhatsApp ist eine Meta-Vorlage und bleibt fest.
 */
function NichtErreichtNachricht({ vorschau, laedt }: { vorschau: NichtErreichtVorschau | null; laedt: boolean }) {
  if (laedt || !vorschau) return <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">Nachricht an den Kontakt wird vorbereitet …</p>;
  if ("stopp" in vorschau) return <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500" data-ne-vorschau="stopp">{vorschau.hinweis}</p>;
  return <NichtErreichtEntwurf vorschau={vorschau} />;
}

function NichtErreichtEntwurf({ vorschau }: { vorschau: Exclude<NichtErreichtVorschau, { stopp: string }> }) {
  const [du, setDu] = useState(vorschau.duStandard);
  const vorschlag = (d: boolean) => (vorschau.mail ? (d ? vorschau.mail.du : vorschau.mail.sie) : null);
  const [betreff, setBetreff] = useState(vorschlag(du)?.betreff ?? "");
  const [text, setText] = useState(vorschlag(du)?.text ?? "");
  // Einfache Regel: Umschalten füllt den Text neu, solange er nicht bearbeitet wurde
  const [bearbeitet, setBearbeitet] = useState(false);
  const [mailAn, setMailAn] = useState(true);
  const [waAn, setWaAn] = useState(true);

  function form(d: boolean) {
    setDu(d);
    if (bearbeitet) return;
    setBetreff(vorschlag(d)?.betreff ?? "");
    setText(vorschlag(d)?.text ?? "");
  }
  function zuruecksetzen() {
    setBearbeitet(false);
    setBetreff(vorschlag(du)?.betreff ?? "");
    setText(vorschlag(du)?.text ?? "");
  }

  const wa = vorschau.whatsapp;
  const waText = wa ? (du && wa.du ? wa.du : wa.sie) : null;
  return (
    <div className="space-y-3 rounded-lg bg-slate-50 p-3" data-ne-vorschau>
      <input type="hidden" name="neWahl" value="1" />
      <input type="hidden" name="neDu" value={du ? "1" : "0"} />
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium">Nachricht an den Kontakt</div>
        <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5" role="group" aria-label="Anrede" data-ne-anrede>
          {([false, true] as const).map((d) => (
            <button
              key={String(d)}
              type="button"
              onClick={() => form(d)}
              aria-pressed={du === d}
              className={`rounded px-2.5 py-0.5 text-xs font-medium ${du === d ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-900"}`}
            >
              {d ? "Du" : "Sie"}
            </button>
          ))}
        </div>
      </div>

      {vorschau.mail ? (
        <div data-ne-kanal="neMail">
          <label className="flex min-h-8 items-center gap-2 text-sm">
            <input type="checkbox" name="neMail" checked={mailAn} onChange={(e) => setMailAn(e.target.checked)} className="h-4 w-4" />
            <span className="min-w-0 break-words">E-Mail an {vorschau.mail.an}</span>
          </label>
          <div className={`mt-1 space-y-2 ${mailAn ? "" : "opacity-50"}`}>
            <input
              name="neBetreff"
              aria-label="Betreff"
              className="input"
              value={betreff}
              disabled={!mailAn}
              onChange={(e) => {
                setBetreff(e.target.value);
                setBearbeitet(true);
              }}
            />
            <textarea
              name="neText"
              aria-label="Text der E-Mail"
              rows={6}
              className="input"
              value={text}
              disabled={!mailAn}
              onChange={(e) => {
                setText(e.target.value);
                setBearbeitet(true);
              }}
            />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
              {vorschau.mail.knopf ? (
                <span className="inline-block rounded bg-white px-2 py-0.5 font-medium text-slate-700 ring-1 ring-slate-200" title="Knopf mit dem Buchungslink, steht immer unter dem Text">
                  [{vorschau.mail.knopf}]
                </span>
              ) : null}
              {bearbeitet ? (
                <span data-ne-bearbeitet>
                  Bearbeitet, zählt nicht im A/B-Test.{" "}
                  <button type="button" onClick={zuruecksetzen} className="underline hover:text-slate-900">
                    Vorschlag wiederherstellen
                  </button>
                </span>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-500">{vorschau.mailGrund}</p>
      )}

      {wa && waText ? (
        <div data-ne-kanal="neWa">
          <label className="flex min-h-8 items-center gap-2 text-sm">
            <input type="checkbox" name="neWa" checked={waAn} onChange={(e) => setWaAn(e.target.checked)} className="h-4 w-4" />
            <span className="min-w-0 break-words">WhatsApp an {wa.an}</span>
          </label>
          <div className={`mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md border border-slate-200 bg-white px-3 py-2 text-xs leading-relaxed text-slate-700 ${waAn ? "" : "opacity-50"}`}>
            {waText}
          </div>
          <p className="mt-1 text-xs text-slate-500" data-ne-wa-hinweis>
            {du && !wa.du ? "WhatsApp-Vorlage, nicht änderbar. Du-Fassung noch nicht freigegeben, geht in Sie-Form raus." : "WhatsApp-Vorlage, nicht änderbar."}
          </p>
        </div>
      ) : (
        <p className="text-sm text-slate-500">{vorschau.waGrund}</p>
      )}
    </div>
  );
}
