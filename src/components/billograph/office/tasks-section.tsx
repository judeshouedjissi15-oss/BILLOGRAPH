"use client";

// MES TÂCHES — liste réelle de la base : création (avec modèles d'office),
// statut, soumission, validation, commentaires, mise à la corbeille.
import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ClipboardList, Plus, Send, Trash2, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { InlineConfirm } from "../inline-confirm";
import { cn } from "@/lib/utils";
import { apiFetch } from "../lib/api-client";
import { useToast } from "@/hooks/use-toast";
import { TASK_PRIORITY_LABELS, TASK_STATUS_LABELS } from "@/lib/offices";
import { PriorityBadge, TaskStatusBadge } from "./badges";
import { useOfficeScope, officeScopeSuffix } from "./office-scope";
import type { OfficeDefinitionInfo, OfficeTaskInfo, OfficeAdjointsResponse } from "@/types/api";

const FILTERS = [
  { value: "ALL", label: "Toutes" },
  { value: "TODO", label: TASK_STATUS_LABELS.TODO },
  { value: "IN_PROGRESS", label: TASK_STATUS_LABELS.IN_PROGRESS },
  { value: "AWAITING_VALIDATION", label: TASK_STATUS_LABELS.AWAITING_VALIDATION },
  { value: "DONE", label: TASK_STATUS_LABELS.DONE },
];

function dueInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

type TasksSectionProps = {
  office: OfficeDefinitionInfo;
  onChanged: () => void;
};

export function TasksSection({ office, onChanged }: TasksSectionProps) {
  const scope = useOfficeScope();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<OfficeTaskInfo[] | null>(null);
  const [filter, setFilter] = useState("ALL");
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [adjoints, setAdjoints] = useState<OfficeAdjointsResponse | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await apiFetch<{ tasks: OfficeTaskInfo[] }>(`/api/office/tasks${officeScopeSuffix(scope)}`);
      setTasks(data.tasks);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de charger les tâches.");
    }
  }, [scope]);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  useEffect(() => {
    if (!office.canHaveAdjoints) return;
    apiFetch<OfficeAdjointsResponse>(`/api/office/adjoints${officeScopeSuffix(scope)}`)
      .then(setAdjoints)
      .catch(() => setAdjoints(null));
  }, [office.canHaveAdjoints, scope]);

  const visible = useMemo(() => {
    if (!tasks) return [];
    return filter === "ALL" ? tasks : tasks.filter((t) => t.status === filter);
  }, [tasks, filter]);

  const detail = useMemo(() => tasks?.find((t) => t.id === detailId) ?? null, [tasks, detailId]);

  const activeAdjoints = (adjoints?.adjoints ?? []).filter((a) => a.active);

  const reloadAll = useCallback(async () => {
    await load();
    onChanged();
  }, [load, onChanged]);

  async function doAction(task: OfficeTaskInfo, body: Record<string, unknown>) {
    try {
      await apiFetch(`/api/office/tasks/${task.id}${officeScopeSuffix(scope)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      toast({ title: "Fait", description: `« ${task.title} » — mise à jour enregistrée.` });
      if (body.action === "REVIEW" || body.action === "SUBMIT") setDetailId(null);
      await reloadAll();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Action impossible",
        description: err instanceof Error ? err.message : "Réessayez.",
      });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-1 flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
                filter === f.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <Button className="h-10" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" aria-hidden="true" />
          Nouvelle tâche
        </Button>
      </div>

      {tasks === null ? (
        error ? (
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
          <div className="space-y-2" aria-busy="true">
            <Skeleton className="h-16 rounded-lg" />
            <Skeleton className="h-16 rounded-lg" />
            <Skeleton className="h-16 rounded-lg" />
          </div>
        )
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <ClipboardList className="size-10 text-muted-foreground" aria-hidden="true" />
            <p className="font-semibold">Aucune tâche {filter === "ALL" ? "" : `« ${FILTERS.find((f) => f.value === filter)?.label} » `}pour le moment</p>
            <p className="text-sm text-muted-foreground">
              Créez votre première tâche ou démarrez l&apos;un des modèles de votre office.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {visible.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setDetailId(t.id)}
              className="w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted/40"
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="min-w-0 flex-1 truncate font-medium">{t.title}</p>
                <PriorityBadge priority={t.priority} label={TASK_PRIORITY_LABELS[t.priority] ?? t.priority} />
                <TaskStatusBadge status={t.status} label={TASK_STATUS_LABELS[t.status] ?? t.status} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Attribuée à {t.assignee.isMe ? "Moi" : t.assignee.name}
                {t.dueDate ? ` · échéance ${new Date(t.dueDate).toLocaleDateString("fr-FR")}` : ""}
                {t.comments.length > 0 ? ` · ${t.comments.length} commentaire(s)` : ""}
              </p>
            </button>
          ))}
        </div>
      )}

      <CreateTaskDialog
        open={createOpen}
        asOwner={scope.asOwner}
        onOpenChange={setCreateOpen}
        office={office}
        adjoints={activeAdjoints}
        onCreated={() => {
          setCreateOpen(false);
          void reloadAll();
        }}
      />

      <TaskDetailDialog
        task={detail}
        onOpenChange={(open) => {
          if (!open) setDetailId(null);
        }}
        onChanged={() => {
          void reloadAll();
        }}
        doAction={doAction}
        onDelete={async (task) => {
          try {
            await apiFetch(`/api/office/tasks/${task.id}${officeScopeSuffix(scope)}`, { method: "DELETE" });
            toast({ title: "Tâche mise à la corbeille", description: "Récupérable par l'administration." });
            setDetailId(null);
            await reloadAll();
          } catch (err) {
            toast({
              variant: "destructive",
              title: "Suppression impossible",
              description: err instanceof Error ? err.message : "Réessayez.",
            });
          }
        }}
      />
    </div>
  );
}

// ── Création de tâche (avec modèles réels de l'office) ──────────────────
function CreateTaskDialog({
  open,
  onOpenChange,
  office,
  adjoints,
  asOwner = false,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  office: OfficeDefinitionInfo;
  adjoints: { id: string; name: string }[];
  /** Le propriétaire opère dans l'office : il confie la tâche à un membre réel. */
  asOwner?: boolean;
  onCreated: () => void;
}) {
  const scope = useOfficeScope();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("NORMALE");
  const [dueDate, setDueDate] = useState("");
  const [assigneeId, setAssigneeId] = useState(asOwner ? (adjoints[0]?.id ?? "") : "me");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setTitle("");
    setDescription("");
    setPriority("NORMALE");
    setDueDate("");
    setAssigneeId(asOwner ? (adjoints[0]?.id ?? "") : "me");
  };

  const applyTemplate = (index: number) => {
    const t = office.taskTemplates[index];
    if (!t) return;
    setTitle(t.title);
    setDescription(t.description);
    setPriority(t.priority);
    setDueDate(t.dueInDays > 0 ? dueInDays(t.dueInDays) : "");
  };

  const submit = async () => {
    if (title.trim().length < 3) {
      toast({ variant: "destructive", title: "Titre trop court", description: "3 caractères minimum." });
      return;
    }
    if (asOwner && assigneeId === "") {
      toast({ variant: "destructive", title: "Attribution requise", description: "Choisissez un membre actif de l'office." });
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/api/office/tasks${officeScopeSuffix(scope)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          priority,
          dueDate: dueDate || undefined,
          assigneeId: assigneeId === "me" ? undefined : assigneeId,
        }),
      });
      toast({
        title: "Tâche enregistrée",
        description: assigneeId === "me" ? "Elle figure désormais dans « Mes tâches »." : "Le membre a été réellement notifié.",
      });
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
          <DialogTitle>Nouvelle tâche — {office.officeName}</DialogTitle>
          <DialogDescription>
            Enregistrée réellement dans votre office ; la personne désignée est notifiée.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {office.taskTemplates.length > 0 && (
            <div className="space-y-1.5">
              <Label>Modèles de l&apos;office</Label>
              <div className="flex flex-wrap gap-1.5">
                {office.taskTemplates.map((t, i) => (
                  <button
                    key={t.title}
                    type="button"
                    onClick={() => applyTemplate(i)}
                    className="rounded-full border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                  >
                    {t.title}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="task-title">Intitulé *</Label>
            <Input id="task-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-desc">Description</Label>
            <Textarea id="task-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={4000} className="min-h-20" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
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
              <Label htmlFor="task-due">Échéance</Label>
              <Input id="task-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="h-11" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Attribuer à</Label>
            <Select value={assigneeId} onValueChange={setAssigneeId}>
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {!asOwner && <SelectItem value="me">Moi-même ({office.label})</SelectItem>}
                {adjoints.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {adjoints.length === 0 && office.canHaveAdjoints && (
              <p className="text-xs text-muted-foreground">
                {asOwner
                  ? "Aucun membre actif dans cet office pour le moment."
                  : "Vous n'avez pas encore d'adjoint actif — la tâche vous sera attribuée."}
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button className="h-11" disabled={saving} onClick={() => void submit()}>
            {saving ? "Enregistrement…" : "Créer la tâche"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Détail d'une tâche : statut, soumission, validation, commentaires ──
function TaskDetailDialog({
  task,
  onOpenChange,
  onChanged,
  doAction,
  onDelete,
}: {
  task: OfficeTaskInfo | null;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
  doAction: (task: OfficeTaskInfo, body: Record<string, unknown>) => Promise<void>;
  onDelete: (task: OfficeTaskInfo) => Promise<void>;
}) {
  const scope = useOfficeScope();
  const { toast } = useToast();
  const [comment, setComment] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setComment("");
    setReviewNote("");
  }, [task?.id]);

  if (!task) return null;

  const sendComment = async () => {
    if (comment.trim().length < 1) return;
    setBusy(true);
    try {
      await apiFetch(`/api/office/tasks/${task.id}/comments${officeScopeSuffix(scope)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: comment.trim() }),
      });
      setComment("");
      toast({ title: "Commentaire ajouté" });
      onChanged();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Envoi impossible",
        description: err instanceof Error ? err.message : "Réessayez.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={Boolean(task)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{task.title}</DialogTitle>
          <DialogDescription>
            Attribuée à {task.assignee.isMe ? "vous" : task.assignee.name} · créée par {task.createdByName} ·{" "}
            {TASK_STATUS_LABELS[task.status] ?? task.status}
          </DialogDescription>
        </DialogHeader>
        {task.description && <p className="whitespace-pre-wrap text-sm">{task.description}</p>}

        {/* Actions selon le rôle réel de la personne connectée */}
        <div className="flex flex-wrap gap-2">
          {task.assignee.isMe && task.status === "TODO" && (
            <Button size="sm" className="h-9" onClick={() => void doAction(task, { action: "SET_STATUS", status: "IN_PROGRESS" })}>
              Démarrer
            </Button>
          )}
          {task.assignee.isMe && ["TODO", "IN_PROGRESS", "ON_HOLD"].includes(task.status) && (
            <Button size="sm" className="h-9" onClick={() => void doAction(task, { action: "SUBMIT" })}>
              <Send className="size-3.5" aria-hidden="true" />
              Soumettre à validation
            </Button>
          )}
          {task.canReview && (
            <>
              <Button size="sm" className="h-9" onClick={() => void doAction(task, { action: "REVIEW", approve: true, note: reviewNote || undefined })}>
                <CheckCircle2 className="size-3.5" aria-hidden="true" />
                Valider
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-9"
                disabled={reviewNote.trim().length < 1}
                onClick={() => void doAction(task, { action: "REVIEW", approve: false, note: reviewNote })}
              >
                <Undo2 className="size-3.5" aria-hidden="true" />
                Renvoyer
              </Button>
              <Input
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                placeholder="Commentaire de validation / motif de renvoi (obligatoire pour renvoyer)"
                className="h-9 min-w-56 flex-1"
                maxLength={1000}
              />
            </>
          )}
          {task.status !== "DONE" && (task.createdByMe || task.assignee.isMe) && (
            <InlineConfirm
              trigger={
                <>
                  <Trash2 className="size-3.5" aria-hidden="true" />
                  Mettre à la corbeille
                </>
              }
              triggerVariant="ghost"
              triggerClassName="h-9 text-destructive hover:text-destructive"
              confirmLabel="Confirmer"
              pendingLabel="…"
              size="sm"
              warnText="La tâche ira dans la corbeille de l'administration (restaurable)."
              onConfirm={() => void onDelete(task)}
            />
          )}
        </div>

        {task.reviewNote && (
          <p className="rounded-lg border bg-muted/40 p-3 text-sm">
            <span className="font-medium">Retour : </span>
            {task.reviewNote}
          </p>
        )}

        {/* Commentaires réels */}
        <div className="space-y-2">
          <p className="text-sm font-semibold">Commentaires ({task.comments.length})</p>
          <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
            {task.comments.map((c) => (
              <div key={c.id} className="rounded-md border p-2 text-sm">
                <p className="text-xs text-muted-foreground">
                  {c.authorName} · {new Date(c.createdAt).toLocaleString("fr-FR")}
                </p>
                <p className="mt-1 whitespace-pre-wrap">{c.body}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Ajouter un commentaire…"
              className="h-10"
              maxLength={2000}
            />
            <Button size="sm" className="h-10" disabled={busy || comment.trim().length < 1} onClick={() => void sendComment()}>
              Envoyer
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
