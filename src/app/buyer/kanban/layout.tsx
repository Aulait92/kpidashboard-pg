// Pipeline-Layout mit @modal-Parallel-Route. Default = null (siehe
// @modal/default.tsx). Wird ein Lead aus der Pipeline angeklickt,
// fängt @modal/(..)leads/[id]/page.tsx die /buyer/leads/[id]-Navigation
// ab und rendert die Detail-Ansicht als Overlay über der Pipeline.
// Direkte URL-Aufrufe oder Klick aus dem Leads-Tab gehen weiter zur
// Vollseite.
export default function BuyerKanbanLayout({
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
