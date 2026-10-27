"use client";

// MES OBJECTIFS ET MON PLAN — objectifs réels + statistiques réelles (tâches
// validées). L'avancement déclaré exige une justification : rien n'est inventé.
import { useCallback, useEffect, useState } from "react";
import { Plus, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "../lib/api-client";
import { useToast } from "@/hooks/use-toast";
import { OBJECTIVE_PERIOD_LABELS, TASK_PRIORITY_LABELS } from "@/lib/offices";
import { useOfficeScope, officeScopeSuffix } from "./office-scope";
import type { OfficeObjectivesResponse } from "@/types/api";

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border p-3 text-center">
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
    </div>
  );
}

export function ObjectivesSection({ onChanged }: { onChanged: () => void }) {
  const scope = useOfficeScope();
  const { toast } = useToast();
  const [data, setData] = useState<OfficeObjectivesResponse | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await apiFetch<OfficeObjectivesResponse>(`/api/office/objectives${officeScopeSuffix(scope)}`));
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Chargement impossible",
        description: err instanceof Error ? err.message : "Réessayez.",
      });
      setData({ objectives: [], realStats: { doneToday: 0, doneThisWeek: 0, doneThisMonth: 0, doneTotal: 0 } });
    }
  }, [scope, toast]);

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
        <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4">
          <StatBox label="Aujourd'hui" value={data?.realStats.doneToday ?? 0} />
          <StatBox label="Cette semaine" value={data?.realStats.doneThisWeek ?? 0} />
          <StatBox label="Ce mois" value={data?.realStats.doneThisMonth ?? 0} />
          <StatBox label="Total terminé" value={data?.realStats.doneTotal ?? 0} />
        </div>
        <Button className="h-10" onClick={() => setOpen(true)}>
          <Plus className="size-4" aria-hidden="true" />
          Nouvel objectif
        </Button>
      </div>

      {data === null ? (
        <Skeleton className="h-40 rounded-xl" aria-busy="true" />
      ) : data.objectives.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <Target className="size-10 text-muted-foreground" aria-hidden="true" />
            <p className="font-semibold">Aucun objectif pour le moment</p>
            <p className="text-sm text-muted-foreground">
              Fixez une cible mesurable : l&apos;avancement devra être justifié par des réalisations réelles.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {data.objectives.map((o) => {
            const pct = o.target && o.target > 0 ? Math.min(100, Math.round((o.achieved / o.target) * 100)) : null;
            return (
              <Card key={o.id} className="py-0">
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="min-w-0 flex-1 font-medium">{o.title}</p>
                    <Badge variant="outline">{OBJECTIVE_PERIOD_LABELS[o.period] ?? o.period}</Badge>
                    <Badge variant="outline" className="border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                      {TASK_PRIORITY_LABELS[o.priority] ?? o.priority}
                    </Badge>
                    {o.status === "ATTEINT" && (
                      <Badge className="border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
                        Atteint
                      </Badge>
                    )}
                  </div>
                  {o.description && <p className="mt-1 text-sm text-muted-foreground">{o.description}</p>}
                  {o.target !== null && (
                    <div className="mt-3 space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>
                          Constaté : <span className="font-semibold text-foreground">{o.achieved}</span>
                          {o.unit ? ` ${o.unit}` : ""} / cible {o.target}
                        </span>
                        {pct !== null && <span>{pct}%</span>}
                      </div>
                      <Progress value={pct ?? 0} aria-label={`Avancement de ${o.title}`} />
                    </div>
                  )}
                  {o.progressNote && (
                    <p className="mt-2 rounded-md border bg-muted/40 p-2 text-xs text-muted-foreground">
                      <span className="font-medium">Justification : </span>
                      {o.progressNote}
                    </p>
                  )}
                  <div className="mt-3 flex items-center gap-2">
                    {o.target !== null && o.status !== "ATTEINT" && (
                      <UpdateObjectiveDialog objective={o} onUpdated={() => void reload()} />
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <CreateObjectiveDialog
        open={open}
        asOwner={scope.asOwner}
        onOpenChange={setOpen}
        onCreated={() => {
          setOpen(false);
          void reload();
        }}
      />
    </div>
  );
}

function CreateObjectiveDialog({
  open,
  onOpenChange,
  asOwner = false,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asOwner?: boolean;
  onCreated: () => void;
}) {
  const scope = useOfficeScope();
  const { toast } = useToast();
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  const [memberId, setMemberId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [metric, setMetric] = useState("");
  const [target, setTarget] = useState("");
  const [unit, setUnit] = useState("");
  const [period, setPeriod] = useState("MENSUEL");
  const [priority, setPriority] = useState("NORMALE");
  const [deadline, setDeadline] = useState("");
  const [saving, setSaving] = useState(false);

  // Le propriétaire choisit le membre de l'office auquel l'objectif est confié.
  useEffect(() => {
    if (!open || !asOwner) return;
    apiFetch<{ adjoints: { id: string; name: string; active: boolean }[] }>(
      `/api/office/adjoints${officeScopeSuffix(scope)}`,
    )
      .then((d) => {
        const actives = d.adjoints.filter((a) => a.active);
        setMembers(actives);
        setMemberId(actives[0]?.id ?? "");
      })
      .catch(() => setMembers([]));
  }, [open, asOwner, scope]);

  const reset = () => {
    setTitle("");
    setDescription("");
    setMetric("");
    setTarget("");
    setUnit("");
    setPeriod("MENSUEL");
    setPriority("NORMALE");
    setDeadline("");
  };

  const submit = async () => {
    if (title.trim().length < 3) {
      toast({ variant: "destructive", title: "Intitulé trop court" });
      return;
    }
    if (asOwner && memberId === "") {
      toast({ variant: "destructive", title: "Membre requis", description: "Choisissez le membre de l'office auquel l'objectif est confié." });
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/api/office/objectives${officeScopeSuffix(scope)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          metric: metric.trim() || undefined,
          target: target !== "" && /^\d+$/.test(target) ? Number(target) : undefined,
          unit: unit.trim() || undefined,
          period,
          priority,
          deadline: deadline || undefined,
          ...(asOwner ? { memberId } : {}),
        }),
      });
      toast({ title: "Objectif enregistré", description: "Il apparaît dans votre plan de travail." });
      reset();
      onCreated();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Création impossible",
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
          <DialogTitle>Nouvel objectif mesurable</DialogTitle>
          <DialogDescription>
            Fixez une cible précise : l&apos;avancement sera déclaré avec sa justification
            (réalisations réelles uniquement).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {asOwner && (
            <div className="space-y-1.5">
              <Label>Confié à (membre de l&apos;office) *</Label>
              <Select value={memberId || undefined} onValueChange={setMemberId}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Choisir un membre actif" />
                </SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="obj-title">Intitulé *</Label>
            <Input id="obj-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="obj-desc">Description</Label>
            <Textarea id="obj-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} className="min-h-20" />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="obj-metric">Indicateur</Label>
              <Input id="obj-metric" value={metric} onChange={(e) => setMetric(e.target.value)} maxLength={300} placeholder="ex. dossiers traités" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="obj-target">Cible</Label>
              <Input id="obj-target" inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value.replace(/\D/g, ""))} placeholder="ex. 12" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="obj-unit">Unité</Label>
              <Input id="obj-unit" value={unit} onChange={(e) => setUnit(e.target.value)} maxLength={60} placeholder="ex. dossiers" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Plan</Label>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(OBJECTIVE_PERIOD_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priorité</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TASK_PRIORITY_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="obj-deadline">Échéance</Label>
              <Input id="obj-deadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="h-11" />
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button className="h-11" disabled={saving} onClick={() => void submit()}>
            {saving ? "Enregistrement…" : "Fixer l'objectif"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UpdateObjectiveDialog({
  objective,
  onUpdated,
}: {
  objective: OfficeObjectivesResponse["objectives"][number];
  onUpdated: () => void;
}) {
  const scope = useOfficeScope();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [achieved, setAchieved] = useState(String(objective.achieved));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const value = Number(achieved);
    if (!Number.isInteger(value) || value < 0) {
      toast({ variant: "destructive", title: "Valeur invalide" });
      return;
    }
    if (value !== objective.achieved && note.trim().length < 5) {
      toast({
        variant: "destructive",
        title: "Justification requise",
        description: "Déclarez votre avancement avec les réalisations réelles à l'appui.",
      });
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/api/office/objectives/${objective.id}${officeScopeSuffix(scope)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          achieved: value,
          ...(note.trim() !== "" ? { progressNote: note.trim() } : {}),
        }),
      });
      toast({ title: "Avancement enregistré" });
      setOpen(false);
      onUpdated();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Mise à jour impossible",
        description: err instanceof Error ? err.message : "Réessayez.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button size="sm" variant="outline" className="h-9" onClick={() => setOpen(true)}>
        Déclarer l&apos;avancement
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Avancement — {objective.title}</DialogTitle>
            <DialogDescription>
              Constaté actuellement : {objective.achieved}
              {objective.unit ? ` ${objective.unit}` : ""}
              {objective.target !== null ? ` / cible ${objective.target}` : ""}. Toute évolution exige
              une justification réelle.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="obj-achieved">Valeur constatée *</Label>
              <Input
                id="obj-achieved"
                inputMode="numeric"
                value={achieved}
                onChange={(e) => setAchieved(e.target.value.replace(/\D/g, ""))}
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="obj-note">Justification (réalisations réelles) *</Label>
              <Textarea
                id="obj-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={1000}
                className="min-h-20"
                placeholder="Qu'est-ce qui prouve ce chiffre ? pièces, travaux, références…"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="h-11" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button className="h-11" disabled={saving} onClick={() => void submit()}>
              {saving ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
