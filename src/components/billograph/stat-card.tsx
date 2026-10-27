"use client";

import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

// Carte de statistique réutilisable (dashboard vendeur, espace admin).

type StatCardProps = {
  label: string;
  value: string;
  icon: LucideIcon;
  hint?: string;
};

export function StatCard({ label, value, icon: Icon, hint }: StatCardProps) {
  return (
    <Card className="gap-0 py-0">
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <p className="mt-1 truncate text-2xl font-bold tracking-tight" title={value}>
              {value}
            </p>
            {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
          </div>
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-5" aria-hidden="true" />
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
