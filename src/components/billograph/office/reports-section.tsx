"use client";

// MES RAPPORTS — rapports réels, immuables une fois publiés ; le comptage de
// tâches terminées est réel (figé à la rédaction). Le propriétaire est notifié.
import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "../lib/api-client";
import { useToast } from "@/hooks/use-toast";
import { useOfficeScope, officeScopeSuffix } from "./office-scope";
import type { OfficeReportsResponse } from "@/types/api";

export function ReportsSection({ onChanged }: { onChanged: () => void }) {
  const scope = useOfficeScope();
  const [data, setData] = useState<OfficeReportsResponse | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await apiFetch<OfficeReportsResponse>(`/api/office/reports${officeScopeSuffix(scope)}`));
    } catch (err) {
      setData({ reports: [], doneTasks: [] });
    }
  }, [scope]);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  const reload = useCallback(async () => {
    await load();
    onChanged();
  }, [load, onChanged]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Rapports périodiques de votre office — chaque rapport est conservé intégralement (historique complet).
        </p>
        <Button className="h-10" onClick={() => setOpen(true)}>
          <Send className="size-4" aria-hidden="true" />
          Rédiger un rapport
        </Button>
      </div>

      {data === null ? (
        <Skeleton className="h-40 rounded-xl" aria-busy="true" />
      ) : data.reports.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <BadgeCheck className="size-10 text-muted-foreground" aria-hidden="true" />
            <p className="font-semibold">Aucun rapport publié pour le moment</p>
            <p className="text-sm text-muted-foreground">
              Rendez compte de vos réalisations réelles : le propriétaire est notifié à chaque rapport.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {data.reports.map((r) => (
            <Card key={r.id} className="py-0">
              <CardContent className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="min-w-0 flex-1 font-medium">{r.periodLabel}</p>
                  <Badge variant="secondary">{r.tasksDoneCount} tâche(s) terminée(s)</Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(r.createdAt).toLocaleString("fr-FR")}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm">{r.realizations}</p>
                {r.difficulties && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    <span className="font-medium">Difficultés : </span>
                    {r.difficulties}
                  </p>
                )}
                {r.unresolved && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    <span className="font-medium">Non résolu : </span>
                    {r.unresolved}
                  </p>
                )}
                {r.needs && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    <span className="font-medium">Besoins : </span>
                    {r.needs}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CreateReportDialog
        open={open}
        onOpenChange={setOpen}
        doneTasks={data?.doneTasks ?? []}
        onCreated={() => {
          setOpen(false);
          void reload();
        }}
      />
    </div>
  );
}

function CreateReportDialog({
  open,
  onOpenChange,
  doneTasks,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  doneTasks: { id: string; title: string; reviewedAt: string | null; assigneeName?: string | null }[];
  onCreated: () => void;
}) {
  const scope = useOfficeScope();
  const { toast } = useToast();
  const [periodLabel, setPeriodLabel] = useState("");
  const [realizations, setRealizations] = useState("");
  const [difficulties, setDifficulties] = useState("");
  const [unresolved, setUnresolved] = useState("");
  const [needs, setNeeds] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (periodLabel.trim().length < 3) {
      toast({ variant: "destructive", title: "Période requise", description: "ex. « Semaine du 03 au 09 février »." });
      return;
    }
    if (realizations.trim().length < 10) {
      toast({ variant: "destructive", title: "Réalisations requises", description: "10 caractères minimum." });
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/api/office/reports${officeScopeSuffix(scope)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodLabel: periodLabel.trim(),
          realizations: realizations.trim(),
          difficulties: difficulties.trim() || undefined,
          unresolved: unresolved.trim() || undefined,
          needs: needs.trim() || undefined,
        }),
      });
      toast({ title: "Rapport publié", description: "Il est immuable et le propriétaire en est informé." });
      setPeriodLabel("");
      setRealizations("");
      setDifficulties("");
      setUnresolved("");
      setNeeds("");
      onCreated();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Publication impossible",
        description: err instanceof Error ? err.message : "Réessayez.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Rapport d&apos;office</DialogTitle>
          <DialogDescription>
            {doneTasks.length} travail(s) terminé(s) compté(s) réellement — le total sera figé dans le rapport.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="rep-period">Période couverte *</Label>
            <Input id="rep-period" value={periodLabel} onChange={(e) => setPeriodLabel(e.target.value)} maxLength={120} className="h-11" placeholder="ex. Semaine du 03 au 09 février" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rep-real">Réalisations réelles *</Label>
            <Textarea id="rep-real" value={realizations} onChange={(e) => setRealizations(e.target.value)} maxLength={6000} className="min-h-28" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rep-diff">Difficultés rencontrées</Label>
            <Textarea id="rep-diff" value={difficulties} onChange={(e) => setDifficulties(e.target.value)} maxLength={3000} className="min-h-16" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rep-unres">Points non résolus</Label>
            <Textarea id="rep-unres" value={unresolved} onChange={(e) => setUnresolved(e.target.value)} maxLength={3000} className="min-h-16" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rep-needs">Besoins / ressources demandées</Label>
            <Textarea id="rep-needs" value={needs} onChange={(e) => setNeeds(e.target.value)} maxLength={3000} className="min-h-16" />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button className="h-11" disabled={saving} onClick={() => void submit()}>
            {saving ? "Publication…" : "Publier le rapport"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
