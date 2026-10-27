"use client";

// MON APPEL ET MA MISSION — construit depuis la configuration réelle de
// l'office (aucune donnée inventée) + compteurs réels du tableau de bord.
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { OfficeOverview } from "@/types/api";

export function MissionSection({ office, counts }: { office: OfficeOverview["office"]; counts: OfficeOverview["counts"] }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">L&apos;appel de votre office</CardTitle>
          <CardDescription>{office.officeName}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed">{office.mission}</p>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Tâches ouvertes</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {(counts.tasks.TODO ?? 0) + (counts.tasks.IN_PROGRESS ?? 0) + (counts.tasks.ON_HOLD ?? 0)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Travaux terminés</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{counts.tasksDoneTotal}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Objectifs suivis</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{counts.objectives}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Vos responsabilités</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {office.responsibilities.map((r) => (
              <li key={r} className="flex gap-2 text-sm">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                {r}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Limites de votre autorité</CardTitle>
            <CardDescription>Ce que vous ne pouvez pas faire seul(e).</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {office.authorityLimits.map((r) => (
                <li key={r} className="flex gap-2 text-sm text-muted-foreground">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-destructive/60" aria-hidden="true" />
                  {r}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Résultats attendus</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {office.expectedResults.map((r) => (
                <li key={r} className="flex gap-2 text-sm">
                  <Badge variant="outline" className="mt-0.5 h-5 shrink-0 px-1.5 text-[10px]">
                    Cible
                  </Badge>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
