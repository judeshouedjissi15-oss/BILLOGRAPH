"use client";

// MES ADJOINTS — liste réelle des adjoints rattachés (0 à 5) avec leur charge
// de travail réelle. L'attribution et le retrait se font depuis l'administration
// (Utilisateurs → Poste) : cette vue est informative.
import { useCallback, useEffect, useState } from "react";
import { Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "../lib/api-client";
import { useOfficeScope, officeScopeSuffix } from "./office-scope";
import type { OfficeAdjointsResponse } from "@/types/api";

export function AdjointsSection() {
  const scope = useOfficeScope();
  const [data, setData] = useState<OfficeAdjointsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await apiFetch<OfficeAdjointsResponse>(`/api/office/adjoints${officeScopeSuffix(scope)}`));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de charger les adjoints.");
    }
  }, [scope]);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  if (!data) {
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
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <Users className="size-4 text-primary" aria-hidden="true" />
            Effectif de l&apos;office
            <Badge variant="secondary">
              {data.activeAdjoints} / {data.maxAdjoints} membres actifs
            </Badge>
            {data.pendingValidations > 0 && (
              <Badge className="border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                {data.pendingValidations} travail(s) à valider
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {data.asOwner
              ? "Vue du propriétaire : tous les membres actifs de cet office (titulaires et adjoints). La gestion des postes se fait depuis l'administration (Utilisateurs → Poste)."
              : "Vos adjoints reçoivent les tâches que vous leur attribuez. Ils exécutent : ils ne reçoivent AUCUNE de vos permissions. L'attribution et le retrait d'adjoints se font depuis l'administration (Utilisateurs → Poste), dans la limite de 5 adjoints actifs par office."}
          </p>
        </CardContent>
      </Card>

      {data.adjoints.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <Users className="size-10 text-muted-foreground" aria-hidden="true" />
            <p className="font-semibold">Aucun membre à afficher</p>
            <p className="text-sm text-muted-foreground">
              Le propriétaire attribue les postes depuis l&apos;administration.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {data.adjoints.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {a.name}
                  {a.isTitulaire !== undefined && (
                    <Badge variant="outline" className="text-[10px]">
                      {a.isTitulaire ? "Titulaire" : `Adjoint de ${a.supervisorName ?? "—"}`}
                    </Badge>
                  )}
                  {!a.active && <Badge variant="secondary">Office suspendu</Badge>}
                </p>
                <p className="truncate text-xs text-muted-foreground">{a.email}</p>
              </div>
              <div className="flex gap-3 text-xs text-muted-foreground">
                <span>
                  <span className="font-semibold text-foreground">{a.tasks.open}</span> en cours
                </span>
                <span>
                  <span className="font-semibold text-foreground">{a.tasks.awaiting}</span> à valider
                </span>
                <span>
                  <span className="font-semibold text-foreground">{a.tasks.done}</span> terminées
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
