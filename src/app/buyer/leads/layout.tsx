// Leads-Layout mit @modal-Parallel-Route. Klick aus der Lead-Tabelle auf
// eine Zeile öffnet die Detail-Ansicht jetzt als Overlay über der Liste
// (siehe @modal/(.)[id]/page.tsx), genau wie im Pipeline-Tab. Direkter
// URL-Aufruf oder Refresh rendert die Vollseite aus [id]/page.tsx.
export default function BuyerLeadsLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
