"use client";

// MA FORMATION — ressources réellement publiées par le propriétaire pour cet
// office (instructions, procédures, guides, documents autorisés) + communes.
import { useCallback, useEffect, useState } from "react";
import { BookOpenCheck, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "../lib/api-client";
import { TRAINING_CATEGORY_LABELS } from "@/lib/offices";
import { useOfficeScope, officeScopeSuffix } from "./office-scope";
import type { OfficeTrainingResourceInfo } from "@/types/api";

export function TrainingSection() {
  const scope = useOfficeScope();
  const [resources, setResources] = useState<OfficeTrainingResourceInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ resources: OfficeTrainingResourceInfo[] }>(`/api/office/training${officeScopeSuffix(scope)}`);
      setResources(data.resources);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de charger la formation.");
      setResources([]);
    }
  }, [scope]);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  if (resources === null) {
    return error ? (
      <Card>
        <CardContent className="p-8 text-center text-sm text-destructive">
          {error}
          <div className="mt-3">
            <Button variant="outline" size="sm" onClick={() => void load()}>
              Réessayer
            </Button>
          </div>
        </CardContent>
      </Card>
    ) : (
      <Skeleton className="h-64 rounded-xl" aria-busy="true" />
    );
  }

  return (
    <div className="space-y-4">
      {resources.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <BookOpenCheck className="size-10 text-muted-foreground" aria-hidden="true" />
            <p className="font-semibold">Aucune ressource de formation pour le moment</p>
            <p className="text-sm text-muted-foreground">
              Le propriétaire publie ici les instructions, procédures et guides de votre office.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {resources.map((r) => (
            <Card key={r.id} className="py-0">
              <CardContent className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary">
                    {TRAINING_CATEGORY_LABELS[r.category] ?? r.category}
                  </Badge>
                  <p className="font-medium">{r.title}</p>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {r.officeRole ? "Ressource de votre office" : "Commune à tous les offices"} · publiée par{" "}
                  {r.publishedByName} · actualisée le {new Date(r.updatedAt).toLocaleDateString("fr-FR")}
                </p>
                {r.body && <p className="mt-2 whitespace-pre-wrap text-sm">{r.body}</p>}
                {r.externalUrl && (
                  <a
                    href={r.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                  >
                    <ExternalLink className="size-3.5" aria-hidden="true" />
                    Ouvrir le document autorisé
                  </a>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
