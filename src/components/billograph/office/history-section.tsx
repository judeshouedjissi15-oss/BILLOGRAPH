"use client";

// MON HISTORIQUE DE TRAVAIL — journal professionnel réel, tracé au fil des
// actions (aucune entrée fabriquée). Le propriétaire voit tout l'office.
import { useCallback, useEffect, useState } from "react";
import { History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "../lib/api-client";
import { useOfficeScope, officeScopeSuffix } from "./office-scope";
import type { OfficeHistoryEntry } from "@/types/api";

export function HistorySection() {
  const scope = useOfficeScope();
  const [entries, setEntries] = useState<OfficeHistoryEntry[] | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ entries: OfficeHistoryEntry[] }>(`/api/office/history${officeScopeSuffix(scope)}`);
      setEntries(data.entries);
    } catch {
      setEntries([]);
    }
  }, [scope]);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  if (entries === null) return <Skeleton className="h-64 rounded-xl" aria-busy="true" />;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Chaque action professionnelle est tracée : tâches, validations, objectifs, rapports, demandes d&apos;aide.
      </p>
      {entries.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <History className="size-10 text-muted-foreground" aria-hidden="true" />
            <p className="font-semibold">Aucune activité pour le moment</p>
            <p className="text-sm text-muted-foreground">Votre historique se construira au fil de votre travail.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="max-h-[32rem] space-y-2 overflow-y-auto pr-1">
          {entries.map((e) => (
            <div key={e.id} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{e.actionLabel}</span>
                {e.fromAdjoint && (
                  <span className="text-xs text-muted-foreground">· par {e.authorName}</span>
                )}
                <span className="ml-auto text-xs text-muted-foreground">
                  {new Date(e.createdAt).toLocaleString("fr-FR")}
                </span>
              </div>
              {e.details && <p className="mt-1 text-sm text-muted-foreground">{e.details}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
