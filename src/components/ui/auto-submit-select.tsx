"use client";

// Auswahl, die ihr Formular beim Ändern sofort abschickt (GET-Filter ohne eigenen Knopf), z. B. Kunde in Admin → Chats.
export function AutoSubmitSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}
