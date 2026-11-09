"use client";

import { useRef, useState } from "react";
import { logActivity } from "@/app/admin/vertrieb/actions";
import { LOSS_REASONS, OUTCOMES, TASK_TYPES } from "@/lib/vertrieb/crm";

function addWorkdaysLocal(n: number): string {
  const d = new Date();
  let left = n;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) left--;
  }
  return d.toLocaleDateString("sv-SE");
}

export function ActivityForm({ contactId, hasOpenTasks }: { contactId: string; hasOpenTasks: boolean }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [outcomeId, setOutcomeId] = useState("nicht_erreicht");
  const outcome = OUTCOMES.find((o) => o.id === outcomeId)!;
  const [createTask, setCreateTask] = useState(!!outcome.task);
  const [title, setTitle] = useState(outcome.task?.title ?? "");
  const [type, setType] = useState<string>(outcome.task?.type ?? "NACHFASSEN");
  const [due, setDue] = useState(addWorkdaysLocal(outcome.task?.workdays ?? 1));

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
        await logActivity(fd);
        formRef.current?.reset();
        pick("nicht_erreicht");
      }}
      className="space-y-3"
    >
      <input type="hidden" name="contactId" value={contactId} />
      <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
        <div>
          <label className="label">Art</label>
          <select name="type" className="input" defaultValue="ANRUF">
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
        </div>
      )}
      <div>
        <label className="label">Notiz</label>
        <textarea name="note" rows={2} className="input" placeholder="Was wurde besprochen?" />
      </div>

      {!outcome.closesTasks && (
        <div className="rounded-lg bg-slate-50 p-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" name="createTask" checked={createTask} onChange={(e) => setCreateTask(e.target.checked)} />
            Folgeaufgabe anlegen
          </label>
          {createTask && (
            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_140px_140px_100px]">
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
        <button className="btn-primary">Speichern</button>
      </div>
    </form>
  );
}
