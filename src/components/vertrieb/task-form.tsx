import { createTask } from "@/app/admin/vertrieb/actions";
import { TASK_TYPES } from "@/lib/vertrieb/crm";
import { todayKey } from "@/lib/vertrieb/dates";

export function TaskForm({ contactId, compact }: { contactId?: string; compact?: boolean }) {
  return (
    <form action={createTask} className={compact ? "grid grid-cols-2 gap-2 [&>div:first-of-type]:col-span-2" : "grid gap-2 sm:grid-cols-[1fr_auto_auto_auto_auto] sm:items-end"}>
      {contactId && <input type="hidden" name="contactId" value={contactId} />}
      <div>
        <label className="label">Neue Aufgabe</label>
        <input name="title" required placeholder="z.B. Nachfassen wegen Präsentation" className="input" />
      </div>
      <div>
        <label className="label">Art</label>
        <select name="type" className="input" defaultValue="NACHFASSEN">
          {TASK_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Fällig</label>
        <input name="due" type="date" required defaultValue={todayKey()} className="input" />
      </div>
      <div>
        <label className="label">Uhrzeit</label>
        <input name="time" type="time" defaultValue="09:00" className="input" />
      </div>
      <button className={compact ? "btn-primary col-span-2" : "btn-primary"}>Anlegen</button>
    </form>
  );
}
