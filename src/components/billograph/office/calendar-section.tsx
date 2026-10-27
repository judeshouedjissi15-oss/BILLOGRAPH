"use client";

// MON CALENDRIER — événements réels + échéances réelles des tâches à venir.
import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { InlineConfirm } from "../inline-confirm";
import { apiFetch } from "../lib/api-client";
import { useToast } from "@/hooks/use-toast";
import { EVENT_TYPE_LABELS, TASK_PRIORITY_LABELS } from "@/lib/offices";
import { useOfficeScope, officeScopeSuffix } from "./office-scope";
import type { OfficeCalendarResponse } from "@/types/api";

export function CalendarSection({ onChanged }: { onChanged: () => void }) {
  const scope = useOfficeScope();
  const { toast } = useToast();
  const [data, setData] = useState<OfficeCalendarResponse | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await apiFetch<OfficeCalendarResponse>(`/api/office/calendar${officeScopeSuffix(scope)}`));
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Chargement impossible",
        description: err instanceof Error ? err.message : "Réessayez.",
      });
      setData({ events: [], taskDeadlines: [] });
    }
  }, [scope, toast]);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  const remove = async (id: string) => {
    try {
      await apiFetch(`/api/office/calendar/${id}${officeScopeSuffix(scope)}`, { method: "DELETE" });
      toast({ title: "Événement mis à la corbeille", description: "Récupérable par l'administration." });
      await load();
      onChanged();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Suppression impossible",
        description: err instanceof Error ? err.message : "Réessayez.",
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Vos réunions, activités, échéances et rappels — réels, datés, à vous.
        </p>
        <Button className="h-10" onClick={() => setOpen(true)}>
          <Plus className="size-4" aria-hidden="true" />
          Nouvel événement
        </Button>
      </div>

      {data === null ? (
        <Skeleton className="h-64 rounded-xl" aria-busy="true" />
      ) : (
        <div className="space-y-4">
          {data.taskDeadlines.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <p className="text-sm font-semibold">Échéances de tâches à venir</p>
              </CardHeader>
              <CardContent className="space-y-2">
                {data.taskDeadlines.map((t) => (
                  <div key={t.id} className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm">
                    <CalendarDays className="size-4 text-muted-foreground" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{t.title}</span>
                    <Badge variant="outline">{TASK_PRIORITY_LABELS[t.priority] ?? t.priority}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {t.dueDate ? new Date(t.dueDate).toLocaleDateString("fr-FR") : "—"}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {data.events.length === 0 ? (
            <Card>
              <CardContent className="p-10 text-center text-sm text-muted-foreground">
                Aucun événement pour le moment — ajoutez vos réunions et rappels.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {data.events.map((e) => (
                <div key={e.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {e.title}
                      <Badge variant="outline">{EVENT_TYPE_LABELS[e.type] ?? e.type}</Badge>
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {new Date(e.startsAt).toLocaleString("fr-FR")}
                      {e.location ? ` · ${e.location}` : ""}
                    </p>
                    {e.description && <p className="mt-1 text-sm text-muted-foreground">{e.description}</p>}
                  </div>
                  <InlineConfirm
                    trigger={
                      <>
                        <Trash2 className="size-3.5" aria-hidden="true" />
                        Supprimer
                      </>
                    }
                    triggerVariant="ghost"
                    triggerClassName="h-9 text-destructive hover:text-destructive"
                    confirmLabel="Confirmer"
                    pendingLabel="…"
                    size="sm"
                    warnText="L'événement ira dans la corbeille de l'administration (restaurable)."
                    onConfirm={() => void remove(e.id)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <CreateEventDialog
        open={open}
        onOpenChange={setOpen}
        onCreated={() => {
          setOpen(false);
          void load();
          onChanged();
        }}
      />
    </div>
  );
}

function CreateEventDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const scope = useOfficeScope();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("ACTIVITE");
  const [startsAt, setStartsAt] = useState("");
  const [location, setLocation] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (title.trim().length < 2) {
      toast({ variant: "destructive", title: "Intitulé trop court" });
      return;
    }
    if (startsAt === "") {
      toast({ variant: "destructive", title: "Date et heure requises" });
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/api/office/calendar${officeScopeSuffix(scope)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          type,
          startsAt: new Date(startsAt).toISOString(),
          location: location.trim() || undefined,
        }),
      });
      toast({ title: "Événement ajouté" });
      setTitle("");
      setDescription("");
      setType("ACTIVITE");
      setStartsAt("");
      setLocation("");
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nouvel événement de calendrier</DialogTitle>
          <DialogDescription>Réunion, activité, échéance ou rappel — enregistré réellement.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="evt-title">Intitulé *</Label>
            <Input id="evt-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className="h-11" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(EVENT_TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="evt-starts">Date et heure *</Label>
              <Input id="evt-starts" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className="h-11" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="evt-location">Lieu / lien</Label>
            <Input id="evt-location" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={200} className="h-11" placeholder="ex. Bureau du greffe" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="evt-desc">Notes</Label>
            <Textarea id="evt-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} className="min-h-16" />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button className="h-11" disabled={saving} onClick={() => void submit()}>
            {saving ? "Enregistrement…" : "Ajouter"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
