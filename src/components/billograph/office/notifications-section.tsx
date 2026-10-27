"use client";

// MES NOTIFICATIONS — liste réelle (polling léger) présentée dans l'espace
// professionnel. Le clic sur une notification la marque comme lue puis
// navigue vers son lien (même comportement que la cloche du header).
// ⚠️ L'API /api/notifications renvoie { unreadCount, items } — toute
// divergence de forme est tolérée (Array.isArray) afin que cette section
// ne puisse JAMAIS faire planter l'application.

import { useCallback, useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { apiFetch } from "../lib/api-client";
import { navigateTo } from "../lib/use-hash-route";
import { formatDate } from "@/lib/format";

type NotificationInfo = {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

export function OfficeNotificationsSection({ onChanged }: { onChanged: () => void }) {
  const [items, setItems] = useState<NotificationInfo[] | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ unreadCount?: number; items?: NotificationInfo[] }>(
        "/api/notifications",
      );
      // Forme défensive : l'API renvoie { unreadCount, items } — on tolère
      // toute réponse inattendue sans jamais planter la section.
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  const markAllRead = async () => {
    try {
      await apiFetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      await load();
      onChanged();
    } catch {
      // silencieux : le rechargement suffit
    }
  };

  /** Clic sur une notification : marquer comme lue puis naviguer vers son lien. */
  const handleClick = (n: NotificationInfo) => {
    if (!n.readAt) {
      apiFetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [n.id] }),
      })
        .then(() => load())
        .then(() => onChanged())
        .catch(() => {});
    }
    if (n.link && n.link.startsWith("#/")) navigateTo(n.link);
  };

  if (items === null) return <Skeleton className="h-64 rounded-xl" aria-busy="true" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Vos notifications réelles : tâches reçues, validations, réponses du propriétaire.
          Cliquez sur une notification pour ouvrir la page concernée.
        </p>
        <Button variant="outline" className="h-10" onClick={() => void markAllRead()}>
          Tout marquer comme lu
        </Button>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <Bell className="size-10 text-muted-foreground" aria-hidden="true" />
            <p className="font-semibold">Aucune notification</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="max-h-96 space-y-2 overflow-y-auto pr-1">
          {items.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => handleClick(n)}
                aria-label={
                  n.link
                    ? `Ouvrir : ${n.title}`
                    : `Notification : ${n.title}`
                }
                className={cn(
                  "w-full rounded-lg border p-3 text-left transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                  n.readAt ? "opacity-70" : "border-primary/30 bg-primary/5",
                )}
              >
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{n.title}</span>
                  {!n.readAt && (
                    <span
                      className="size-2 shrink-0 rounded-full bg-primary"
                      aria-label="Non lue"
                    />
                  )}
                </span>
                <span className="mt-0.5 block text-sm text-muted-foreground">{n.body}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {formatDate(n.createdAt)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
