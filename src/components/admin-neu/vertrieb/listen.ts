// Vertrieb im neuen Admin: Adressen und Listen, deren Filter für „Zurück“ aus der Kontaktakte gemerkt werden
// (components/admin/list-memory.tsx, RememberList im Layout src/app/admin/neu/vertrieb/layout.tsx).

export const V = "/admin/neu/vertrieb";
export const KONTAKTE = `${V}/kontakte`;
export const kontaktPfad = (id: string) => `${KONTAKTE}/${id}`;

export const VERTRIEB_NEU_LISTE = "vertrieb-neu";
export const VERTRIEB_NEU_LISTEN = [V, KONTAKTE, `${V}/aufgaben`, `${V}/termine`, `${V}/angebote`];
