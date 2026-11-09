"use client";

/** Submit-Button, der vor dem Absenden eine Bestätigung abfragt. */
export function ConfirmButton({
  message,
  className,
  children,
  form,
  formAction,
}: {
  message: string;
  className?: string;
  children: React.ReactNode;
  form?: string;
  formAction?: (fd: FormData) => void | Promise<void>;
}) {
  return (
    <button
      type="submit"
      form={form}
      formAction={formAction}
      formNoValidate={!!formAction}
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}

/** Checkbox, die alle Checkboxen mit name="ids" im angegebenen Formular umschaltet. */
export function SelectAll({ form }: { form: string }) {
  return (
    <input
      type="checkbox"
      aria-label="Alle auswählen"
      onChange={(e) => {
        document
          .querySelectorAll<HTMLInputElement>(`input[name="ids"][form="${form}"]`)
          .forEach((cb) => (cb.checked = e.target.checked));
      }}
    />
  );
}
