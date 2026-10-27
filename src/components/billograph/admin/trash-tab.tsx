"use client";

// ONGLET CORBEILLE (administration) — « tout ce que quiconque supprime reste
// dans la corbeille ». Liste réelle des éléments mis à la corbeille (qui a
// supprimé, quand, quoi), avec restauration et purge définitive (propriétaire
// uniquement — le greffier, en lecture seule, voit tout sans rien toucher).
import { useCallback, useEffect, useState } from "react";
import {
  CalendarDays,
  ClipboardList,
  FileText,
  Megaphone,
  Package,
  RotateCcw,
  Search,
  ShieldAlert,
  Star,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InlineConfirm } from "../inline-confirm";
import { apiFetch } from "../lib/api-client";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/format";
import type { TrashEntity, TrashItem } from "@/types/api";

const ENTITY_LABELS: Record<TrashEntity, string> = {
  PRODUCT: "Produit",
  REVIEW: "Avis",
  ANNOUNCEMENT: "Annonce",
  TRAINING: "Formation",
  TASK: "Tâche d'office",
  CALENDAR: "Calendrier",
};

const ENTITY_ICONS: Record<TrashEntity, typeof Package> = {
  PRODUCT: Package,
  REVIEW: Star,
  ANNOUNCEMENT: Megaphone,
  TRAINING: FileText,
  TASK: ClipboardList,
  CALENDAR: CalendarDays,
};

type TrashTabProps = {
  /** true pour un visiteur en LECTURE SEULE (greffier) : voir, sans agir. */
  readOnly?: boolean;
};

export function TrashTab({ readOnly = false }: TrashTabProps) {
  const { toast } = useToast();
  const [items, setItems] = useState<TrashItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [entityFilter, setEntityFilter] = useState<string>("ALL");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await apiFetch<{ items: TrashItem[] }>(
        `/api/admin/trash${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`,
      );
      setItems(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de charger la corbeille.");
      setItems(null);
    }
  }, [q]);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  const act = async (item: TrashItem, action: "restore" | "purge") => {
    setBusyId(`${action}-${item.entity}-${item.id}`);
    try {
      await apiFetch(`/api/admin/trash/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity: item.entity, id: item.id }),
      });
      toast({
        title: action === "restore" ? "Élément restauré" : "Élément purgé définitivement",
        description:
          action === "restore"
            ? `« ${item.title} » est de retour dans le système. L'opération est tracée dans l'audit.`
            : `« ${item.title} » a été définitivement supprimé. La preuve de l'opération reste dans l'audit.`,
      });
      await load();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Opération impossible",
        description: err instanceof Error ? err.message : "Réessayez dans un instant.",
      });
    } finally {
      setBusyId(null);
    }
  };

  const filtered = (items ?? []).filter((i) => entityFilter === "ALL" || i.entity === entityFilter);

  if (items === null) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-10 w-72" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            <Trash2 className="size-5 text-primary" aria-hidden="true" />
            Corbeille de l&apos;administration
            {filtered.length > 0 && <Badge variant="secondary">{filtered.length}</Badge>}
          </CardTitle>
          <CardDescription>
            Toute suppression — vendeur, officier ou administration — reste ici : rien n&apos;est
            perdu, tout est prouvable (qui, quand, quoi) et restaurable. La purge définitive est
            réservée au propriétaire et reste tracée dans l&apos;audit.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {readOnly && (
            <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <p>
                Vous consultez la corbeille en <strong>lecture seule</strong> (fonction de
                greffier) : vous voyez tout, vous ne pouvez ni restaurer ni purger.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Rechercher dans la corbeille…"
                className="h-11 pl-9"
                aria-label="Rechercher dans la corbeille"
              />
            </div>
            <Select value={entityFilter} onValueChange={setEntityFilter}>
              <SelectTrigger className="h-11 sm:w-56" aria-label="Filtrer par type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tous les types</SelectItem>
                {(Object.keys(ENTITY_LABELS) as TrashEntity[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {ENTITY_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {filtered.length === 0 ? (
            <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              La corbeille est vide : rien n&apos;a été supprimé. C&apos;est une bonne nouvelle.
            </p>
          ) : (
            <div className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
              {filtered.map((item) => {
                const Icon = ENTITY_ICONS[item.entity] ?? Package;
                return (
                  <div
                    key={`${item.entity}-${item.id}`}
                    className="flex flex-wrap items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/40"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {ENTITY_LABELS[item.entity]}
                        {item.subtitle ? ` · ${item.subtitle}` : ""} · supprimé le{" "}
                        {formatDate(item.deletedAt)}
                        {item.deletedByName ? ` par ${item.deletedByName}` : ""}
                      </p>
                    </div>
                    {!readOnly && (
                      <div className="flex shrink-0 items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-9"
                          disabled={busyId !== null}
                          onClick={() => void act(item, "restore")}
                        >
                          <RotateCcw className="size-3.5" aria-hidden="true" />
                          Restaurer
                        </Button>
                        <InlineConfirm
                          trigger={
                            <>
                              <Trash2 className="size-3.5" aria-hidden="true" />
                              Purger
                            </>
                          }
                          triggerVariant="ghost"
                          triggerClassName="h-9 text-destructive hover:text-destructive"
                          confirmLabel="Purger définitivement"
                          pendingLabel="Purge…"
                          size="sm"
                          busy={busyId === `purge-${item.entity}-${item.id}`}
                          onConfirm={() => void act(item, "purge")}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
