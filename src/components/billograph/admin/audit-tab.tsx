"use client";

// Onglet "Audit" de l'espace admin : journal des événements.
// GET /api/admin/audit?limit=100

import { useCallback, useEffect, useState } from "react";
import { ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, apiUrl } from "../lib/api-client";
import { formatDate } from "@/lib/format";
import type { AuditEntry } from "@/types/api";
import { cn } from "@/lib/utils";

function actionVariant(action: string): string {
  if (/FAILED|REJECTED|CANCELLED|SUSPEND/.test(action)) {
    return "border-red-300 bg-red-100 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300";
  }
  if (/PAYMENT_CONFIRMED|LOGIN|SETTINGS_UPDATED/.test(action)) {
    return "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300";
  }
  if (/CREATED|REGISTERED|PUBLISHED/.test(action)) {
    return "border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300";
  }
  return "border-border bg-muted text-muted-foreground";
}

function truncate(text: string, maxLength = 90): string {
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

export function AuditTab() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await apiFetch<{ logs: AuditEntry[] }>(
        apiUrl("/api/admin/audit", { limit: 100 }),
      );
      setLogs(data.logs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de charger le journal.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-14 w-full rounded-md" />
        <Skeleton className="h-14 w-full rounded-md" />
        <Skeleton className="h-14 w-full rounded-md" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" onClick={() => void load()}>
            Réessayer
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (logs.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
          <ScrollText className="size-10 text-muted-foreground" aria-hidden="true" />
          <p className="font-semibold">Aucun événement enregistré</p>
          <p className="text-sm text-muted-foreground">
            Le journal se remplira au fil des actions sur la plateforme.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{logs.length} événement(s) — du plus récent au plus ancien.</p>
      <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
        {logs.map((log) => (
          <div key={log.id} className="rounded-lg border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={cn("font-mono text-[11px]", actionVariant(log.action))}>
                {log.action}
              </Badge>
              <span className="text-sm font-medium">
                {log.entity}
                {log.entityId ? (
                  <span className="font-mono text-xs text-muted-foreground"> #{log.entityId.slice(0, 8)}</span>
                ) : null}
              </span>
              <span className="ml-auto text-xs text-muted-foreground">{formatDate(log.createdAt)}</span>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Acteur : {log.actor ? `${log.actor.name} (${log.actor.email})` : "système"}
            </p>
            {log.metadata ? (
              <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
                {truncate(log.metadata)}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
