import { ToastProvider } from "@/components/ui/toast";

// Rückmeldungen (Toast) für alle Admin-Seiten. Ohne Provider waren Meldungen außerhalb von Heute, Logins und
// WhatsApp-Chat stumm (z. B. ein fehlgeschlagener Schalter in den WhatsApp-Einstellungen wackelte nur).
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}
