"use client";

import { useFormStatus } from "react-dom";

// Submit-Button mit Lade-/Deaktiviert-Zustand (verhindert Doppel-Sends) und
// sichtbarem Klick-Feedback (active:scale). Muss innerhalb des <form> stehen.
export function SubmitButton({
  children,
  pendingLabel,
  className,
}: {
  children: React.ReactNode;
  pendingLabel: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`cursor-pointer transition active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 ${className ?? ""}`}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
