"use client";

// Badges partagés de l'espace professionnel (statut d'office, priorités).
import { Badge } from "@/components/ui/badge";

export function OfficeStatusBadge({ active }: { active: boolean }) {
  return active ? (
    <Badge variant="outline" className="border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
      Actif
    </Badge>
  ) : (
    <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
      Suspendu
    </Badge>
  );
}

const PRIORITY_STYLES: Record<string, string> = {
  URGENTE: "border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300",
  HAUTE: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
  NORMALE: "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300",
  BASSE: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300",
};

export function PriorityBadge({ priority, label }: { priority: string; label: string }) {
  return (
    <Badge variant="outline" className={PRIORITY_STYLES[priority] ?? PRIORITY_STYLES.NORMALE}>
      {label}
    </Badge>
  );
}

const STATUS_STYLES: Record<string, string> = {
  TODO: "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300",
  IN_PROGRESS: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
  ON_HOLD: "border-slate-300 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400",
  AWAITING_VALIDATION: "border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300",
  DONE: "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
};

export function TaskStatusBadge({ status, label }: { status: string; label: string }) {
  return (
    <Badge variant="outline" className={STATUS_STYLES[status] ?? STATUS_STYLES.TODO}>
      {label}
    </Badge>
  );
}
