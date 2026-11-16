import { Suspense } from "react";
import { RememberList } from "@/components/admin/list-memory";
import { VERTRIEB_NEU_LISTE, VERTRIEB_NEU_LISTEN } from "@/components/admin-neu/vertrieb/listen";

// Vertrieb im neuen Admin: merkt sich die zuletzt gefilterte Liste (Pipeline, Kontakte, Aufgaben, Termine, Angebote),
// damit „Zurück“ in der Kontaktakte wieder dort landet.
export default function VertriebLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Suspense fallback={null}>
        <RememberList id={VERTRIEB_NEU_LISTE} paths={VERTRIEB_NEU_LISTEN} />
      </Suspense>
      {children}
    </>
  );
}
