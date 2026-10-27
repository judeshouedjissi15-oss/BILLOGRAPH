"use client";

// Onglet "Boutiques" de l'espace admin : liste globale, suspension/activation.
// GET /api/admin/stores · PATCH /api/admin/stores/:id

import { useCallback, useEffect, useState } from "react";
import { Eye, ShieldBan, ShieldCheck, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "../lib/api-client";
import { navigateTo } from "../lib/use-hash-route";
import { InlineConfirm } from "../inline-confirm";
import { StoreDetailDialog } from "./store-detail-dialog";
import { formatDate } from "@/lib/format";
import type { AdminStore } from "@/types/api";

export function StoresTab({ readOnly = false }: { readOnly?: boolean } = {}) {
  const { toast } = useToast();
  const [stores, setStores] = useState<AdminStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [detailStoreId, setDetailStoreId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await apiFetch<{ stores: AdminStore[] }>("/api/admin/stores");
      setStores(data.stores);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de charger les boutiques.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  const patchStatus = async (
    store: AdminStore,
    status: "ACTIVE" | "SUSPENDED",
    successTitle: string,
  ) => {
    setBusyId(store.id);
    try {
      const data = await apiFetch<{ store: AdminStore }>(`/api/admin/stores/${store.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      setStores((prev) => prev.map((s) => (s.id === store.id ? { ...s, ...data.store } : s)));
      toast({ title: successTitle });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Action impossible",
        description: error instanceof Error ? error.message : "Réessayez dans un instant.",
      });
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-12 w-full rounded-md" />
        <Skeleton className="h-12 w-full rounded-md" />
        <Skeleton className="h-12 w-full rounded-md" />
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

  if (stores.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
          <Store className="size-10 text-muted-foreground" aria-hidden="true" />
          <p className="font-semibold">Aucune boutique sur la plateforme</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="py-0">
        <CardContent className="p-0">
          <div className="max-h-96 overflow-y-auto overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Boutique</TableHead>
                  <TableHead>Propriétaire</TableHead>
                  <TableHead className="text-right">Produits</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Créée le</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stores.map((store) => (
                  <TableRow key={store.id}>
                    <TableCell>
                      <button
                        type="button"
                        className="text-left font-medium text-primary hover:underline"
                        onClick={() => navigateTo(`#/boutique/${store.slug}`)}
                      >
                        {store.name}
                      </button>
                      <p className="text-xs text-muted-foreground">/{store.slug}</p>
                    </TableCell>
                    <TableCell className="max-w-44 truncate text-sm">
                      {store.ownerEmail}
                    </TableCell>
                    <TableCell className="text-right">{store.productsCount}</TableCell>
                    <TableCell>
                      {readOnly ? (
                          <span className="self-center text-xs text-muted-foreground">Lecture seule</span>
                        ) : store.status === "ACTIVE" ? (
                        <Badge
                          variant="outline"
                          className="border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
                        >
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-red-300 bg-red-100 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                          Suspendue
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {formatDate(store.createdAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9"
                          aria-label={`Voir le détail de la boutique ${store.name}`}
                          onClick={() => {
                            setDetailStoreId(store.id);
                            setDetailOpen(true);
                          }}
                        >
                          <Eye className="size-4" aria-hidden="true" />
                          Détails
                        </Button>
                        {store.status === "ACTIVE" ? (
                          <InlineConfirm
                            trigger={
                              <>
                                <ShieldBan className="size-4" aria-hidden="true" />
                                Suspendre
                              </>
                            }
                            triggerClassName="h-9"
                            confirmLabel="Confirmer la suspension"
                            pendingLabel="Traitement…"
                            warnText="La boutique ne sera plus visible publiquement."
                            busy={busyId === store.id}
                            onConfirm={() => patchStatus(store, "SUSPENDED", "Boutique suspendue")}
                          />
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-9"
                            disabled={busyId === store.id}
                            onClick={() => void patchStatus(store, "ACTIVE", "Boutique réactivée")}
                          >
                            <ShieldCheck className="size-4" aria-hidden="true" />
                            Réactiver
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Détail complet de la boutique : produits, commandes, retraits, portefeuille. */}
      <StoreDetailDialog
        storeId={detailStoreId}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </div>
  );
}
