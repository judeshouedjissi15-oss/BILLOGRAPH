"use client";

// Cloche de notifications (header) — visibles pour tout utilisateur connecté.
// Polling léger toutes les 30 s + rafraîchissement au focus de l'onglet.
// Clic sur une notification : marque comme lue puis navigue vers son lien.

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, CheckCheck, Megaphone, ShoppingBag, TriangleAlert, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { navigateTo } from "./lib/use-hash-route";
import { apiFetch } from "./lib/api-client";
import { formatDate } from "@/lib/format";
import type { NotificationItem, NotificationsResponse } from "@/types/api";

const POLL_INTERVAL_MS = 30_000;

const TYPE_ICONS: Record<NotificationItem["type"], typeof Bell> = {
  SALE: ShoppingBag,
  PAYMENT: TriangleAlert,
  WITHDRAWAL: Wallet,
  WITHDRAWAL_REQUEST: Wallet,
  SYSTEM: Megaphone,
};

export function NotificationsBell() {
  const [data, setData] = useState<NotificationsResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [marking, setMarking] = useState(false);
  const openRef = useRef(false);
  openRef.current = open;

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<NotificationsResponse>("/api/notifications");
      setData(res);
    } catch {
      // Silencieux : la cloche ne doit jamais perturber la navigation
      // (401 après déconnexion, coupure réseau…).
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => {
      if (!document.hidden) void load();
    }, POLL_INTERVAL_MS);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  const markAllRead = async () => {
    setMarking(true);
    try {
      await apiFetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      await load();
    } catch {
      // silencieux
    } finally {
      setMarking(false);
    }
  };

  const handleClickNotification = async (item: NotificationItem) => {
    setOpen(false);
    if (!item.read) {
      apiFetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [item.id] }),
      })
        .then(() => load())
        .catch(() => {});
    }
    if (item.link) navigateTo(item.link);
  };

  const unreadCount = data?.unreadCount ?? 0;
  const items = data?.items ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative size-11"
          aria-label={
            unreadCount > 0
              ? `Notifications — ${unreadCount} non lue(s)`
              : "Notifications"
          }
        >
          <Bell className="size-5" aria-hidden="true" />
          {unreadCount > 0 && (
            <span
              className="absolute right-1 top-1 flex min-w-4.5 h-4.5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground"
              aria-hidden="true"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-88 max-w-[calc(100vw-2rem)] p-0">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => void markAllRead()}
              disabled={marking}
            >
              <CheckCheck className="size-3.5" aria-hidden="true" />
              Tout marquer comme lu
            </Button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              Aucune notification pour le moment.
            </p>
          ) : (
            <ul>
              {items.map((item) => {
                const Icon = TYPE_ICONS[item.type] ?? Bell;
                return (
                  <li key={item.id} className="border-b last:border-b-0">
                    <button
                      type="button"
                      onClick={() => void handleClickNotification(item)}
                      className={cn(
                        "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                        !item.read && "bg-primary/5",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
                          item.type === "PAYMENT"
                            ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                            : "bg-primary/10 text-primary",
                        )}
                      >
                        <Icon className="size-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold">{item.title}</span>
                          {!item.read && (
                            <span
                              className="size-2 shrink-0 rounded-full bg-primary"
                              aria-label="Non lue"
                            />
                          )}
                        </span>
                        <span className="mt-0.5 line-clamp-2 block text-xs leading-relaxed text-muted-foreground">
                          {item.body}
                        </span>
                        <span className="mt-1 block text-[11px] text-muted-foreground/70">
                          {formatDate(item.createdAt)}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
