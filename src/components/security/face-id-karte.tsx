"use client";

// Anmeldung & Sicherheit: Face ID in der App an/aus (components/app-sperre.tsx, lib/native-bridge.ts).
// Nur in der App mit eingerichtetem Face ID/Touch ID sichtbar; im Browser rendert die Karte nichts.
// Gleicher Schalter wie die übrigen Einstellungs-Zeilen (next-step-reminder-toggle.tsx).

import { useEffect, useState } from "react";
import { ScanFace } from "lucide-react";
import { Card, CardHeader } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { biometrie, faceIdAn, faceIdBeenden, faceIdEinrichten, isNativeApp } from "@/lib/native-bridge";
import { cn } from "@/lib/utils";

export function FaceIdKarte({ disabled = false }: { disabled?: boolean }) {
  const toast = useToast();
  const [name, setName] = useState<string | null>(null);
  const [on, setOn] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!isNativeApp()) return;
    let aktiv = true;
    void biometrie().then((b) => {
      if (!aktiv || !b.verfuegbar) return;
      setName(b.name);
      setOn(faceIdAn());
    });
    return () => {
      aktiv = false;
    };
  }, []);

  if (!name) return null;

  const toggle = async () => {
    if (pending) return;
    if (on) {
      faceIdBeenden({ abgewaehlt: true });
      setOn(false);
      toast.show({ message: `${name} aus` });
      return;
    }
    setPending(true);
    const ok = await faceIdEinrichten();
    setPending(false);
    setOn(ok);
    toast.show(ok ? { message: `${name} an` } : { message: `${name} ließ sich nicht einrichten. Bitte in den iPhone-Einstellungen für performancegrowth erlauben.`, tone: "error" });
  };

  return (
    <Card>
      <CardHeader title={name} icon={ScanFace} />
      <div className="flex min-h-[64px] items-center gap-4 px-5 py-3">
        <span className="min-w-0 flex-1">
          <span className="block font-medium">App mit {name} entsperren</span>
          <span className="block text-sm text-[color:var(--muted)]">Sie bleiben angemeldet und brauchen beim Öffnen kein Passwort.</span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={`App mit ${name} entsperren`}
          disabled={pending || disabled}
          onClick={() => void toggle()}
          className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)] focus-visible:ring-offset-2 disabled:opacity-50", on ? "bg-[color:var(--brand)]" : "bg-slate-300")}
        >
          <span className={cn("absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-[left] motion-reduce:transition-none", on ? "left-[22px]" : "left-0.5")} />
        </button>
      </div>
    </Card>
  );
}
