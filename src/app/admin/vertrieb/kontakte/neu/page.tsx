import Link from "next/link";
import { createLeadManually } from "@/app/admin/vertrieb/actions";
import { SOURCES } from "@/lib/vertrieb/crm";

export default async function NeuerLeadPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/admin/vertrieb/kontakte" className="text-sm text-slate-500 hover:underline">← Kontakte</Link>
      <h1 className="text-xl font-semibold">Neuer Lead</h1>
      <p className="text-sm text-slate-600">
        Z.B. wenn dir jemand auf LinkedIn schreibt. Gibt es die Agentur schon (gleiche E-Mail, LinkedIn-Profil oder Name),
        wird der bestehende Kontakt ergänzt statt doppelt angelegt. Stufe „Interesse“, Aufgabe für heute.
      </p>
      {sp.fehler && <p className="text-sm text-rose-600">Bitte mindestens Name, E-Mail oder LinkedIn-Profil angeben.</p>}
      <form action={createLeadManually} className="card grid gap-3 p-5 sm:grid-cols-2">
        <div>
          <label className="label">Woher?</label>
          <select name="source" defaultValue={sp.quelle ?? "LINKEDIN"} className="input">
            {SOURCES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label">LinkedIn-Profil</label>
          <input name="linkedinUrl" placeholder="https://www.linkedin.com/in/…" className="input" />
        </div>
        <div>
          <label className="label">Vorname</label>
          <input name="firstName" className="input" />
        </div>
        <div>
          <label className="label">Nachname</label>
          <input name="lastName" className="input" />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Agentur / Firma</label>
          <input name="company" placeholder="z.B. Allianz Generalvertretung Muster" className="input" />
        </div>
        <div>
          <label className="label">E-Mail</label>
          <input name="email" type="email" className="input" />
        </div>
        <div>
          <label className="label">Telefon</label>
          <input name="phone" className="input" />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Nachricht / Notiz</label>
          <textarea name="message" rows={4} placeholder="Was hat die Person geschrieben?" className="input" />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Aufgabe für heute</label>
          <input name="taskTitle" defaultValue="Auf LinkedIn-Anfrage reagieren" className="input" />
        </div>
        <button className="btn-primary sm:col-span-2">Lead anlegen</button>
      </form>
    </div>
  );
}
