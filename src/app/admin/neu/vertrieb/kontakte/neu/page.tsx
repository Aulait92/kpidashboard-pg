import { Card } from "@/components/ui";
import { Seite } from "@/components/admin-neu/ui/seite";
import { KONTAKTE } from "@/components/admin-neu/vertrieb/listen";
import { createLeadManually } from "@/app/admin/vertrieb/actions";
import { SOURCES } from "@/lib/vertrieb/crm";
import { requireAuth } from "@/lib/vertrieb/auth";

export const metadata = { title: "Neuer Kontakt | performancegrowth Admin" };

// Neuer Kontakt (z. B. LinkedIn-Nachricht, Empfehlung): gleiche Server Action wie /admin/vertrieb/kontakte/neu.
// Gibt es die Agentur schon (E-Mail, LinkedIn-Profil, Name), ergänzt sie den bestehenden Kontakt. Danach öffnet
// sich die Kontaktakte im neuen Admin (Weiterleitung nach Herkunft, app/admin/vertrieb/actions.ts).
export default async function NeuerKontaktPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAuth();
  const sp = await searchParams;
  return (
    <Seite titel="Neuer Kontakt" untertitel="Gibt es die Agentur schon, wird der bestehende Kontakt ergänzt." zurueck={{ href: KONTAKTE, label: "Kontakte" }}>
      <Card className="max-w-2xl">
        <form action={createLeadManually} className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2" data-funktion="actions-createleadmanually--kontakt-anlegen-quelle-name-firma-e-mail-telefon">
          {sp.fehler ? <p className="text-sm text-rose-700 sm:col-span-2">Bitte mindestens Name, E-Mail oder LinkedIn-Profil angeben.</p> : null}
          <div className="sm:col-span-2">
            <label className="label" htmlFor="nk-company">Agentur / Firma</label>
            <input id="nk-company" name="company" placeholder="z. B. Allianz Generalvertretung Muster" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="nk-first">Vorname</label>
            <input id="nk-first" name="firstName" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="nk-last">Nachname</label>
            <input id="nk-last" name="lastName" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="nk-email">E-Mail</label>
            <input id="nk-email" name="email" type="email" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="nk-phone">Telefon</label>
            <input id="nk-phone" name="phone" type="tel" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="nk-source">Woher?</label>
            <select id="nk-source" name="source" defaultValue={sp.quelle ?? "LINKEDIN"} className="input">
              {SOURCES.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
          </div>
          <div data-funktion="page--beim-anlegen-linkedin-profil-nachricht-und">
            <label className="label" htmlFor="nk-li">LinkedIn-Profil</label>
            <input id="nk-li" name="linkedinUrl" placeholder="https://www.linkedin.com/in/…" className="input" />
          </div>
          <details className="sm:col-span-2">
            <summary className="cursor-pointer py-1 text-sm font-medium text-[color:var(--brand)]">Nachricht und Aufgabe</summary>
            <div className="mt-2 grid gap-3">
              <div>
                <label className="label" htmlFor="nk-msg">Nachricht / Notiz</label>
                <textarea id="nk-msg" name="message" rows={4} placeholder="Was hat die Person geschrieben?" className="input" />
              </div>
              <div>
                <label className="label" htmlFor="nk-task">Aufgabe für heute</label>
                <input id="nk-task" name="taskTitle" defaultValue="Auf LinkedIn-Anfrage reagieren" className="input" />
              </div>
            </div>
          </details>
          <button className="btn-primary sm:col-span-2">Kontakt anlegen</button>
        </form>
      </Card>
    </Seite>
  );
}
