// Kontakt-Fenster schließen, sobald man auf eine andere Seite unter /buyer wechselt (Ole, 15.11.2026: aus dem
// Fenster „Vorbereiten“ geklickt, das Fenster blieb über der Terminvorbereitung stehen). Bei clientseitiger
// Navigation behält ein Parallel-Slot sonst seinen letzten Inhalt; diese Auffangroute setzt ihn auf „nichts“.
// Siehe node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/parallel-routes.md (Modals schließen).
export default function ModalCatchAll() {
  return null;
}
