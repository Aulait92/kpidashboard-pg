// Symbole für „Heute“ (Admin-A). Eigene Datei ohne "use client", damit Server-
// und Client-Komponenten dieselbe Zuordnung nutzen können.
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Euro,
  FileText,
  Inbox,
  ListTodo,
  MessageCircle,
  Phone,
  Star,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import type { HeuteIcon } from "@/lib/admin-heute";

export const HEUTE_ICONS: Record<HeuteIcon, LucideIcon> = {
  phone: Phone,
  calendar: CalendarDays,
  euro: Euro,
  inbox: Inbox,
  form: ClipboardList,
  undo: Undo2,
  check: CheckCircle2,
  chat: MessageCircle,
  alert: AlertTriangle,
  offer: FileText,
  star: Star,
  task: ListTodo,
};
