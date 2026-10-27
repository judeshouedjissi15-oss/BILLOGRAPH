"use client";

// DIALOGUE ADMIN — DÉTAIL D'UNE BOUTIQUE VENDEUR.
// Rend accessible à l'administration TOUT ce qui se passe chez ce vendeur :
// boutique (infos, statut), propriétaire (email, confirmation), produits
// (TOUS statuts, y compris brouillons), commandes récentes, retraits et
// portefeuille (encaissé, commissions, net, disponible). Lecture seule :
// l'administration supervise sans modifier le travail du vendeur.

import { useCallback, useEffect, useState } from "react";
import {
  Banknote,
  ExternalLink,
  HandCoins,
  Package,
  Percent,
  ShieldCheck,
  Store as StoreIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatCard } from "../stat-card";
import { apiFetch } from "../lib/api-client";
import { navigateTo } from "../lib/use-hash-route";
import { StatusBadge } from "../status-badge";
import { formatDate, formatXOF } from "@/lib/format";
import type { AdminStoreDetail } from "@/types/api";

type StoreDetailDialogProps = {
  storeId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function StoreDetailDialog({ storeId, open, onOpenChange }: StoreDetailDialogProps) {
  const [detail, setDetail] = useState<AdminStoreDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    setError(null);
    setDetail(null);
    try {
      const data = await apiFetch<AdminStoreDetail>(`/api/admin/stores/${storeId}`);
      setDetail(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de charger la boutique.");
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const openStorePublicPage = () => {
    if (!detail) return;
    onOpenChange(false);
    navigateTo(`#/boutique/${detail.store.slug}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        {/* Titre TOUJOURS rendu (accessibilité Radix : DialogTitle requis dans DialogContent,
            même pendant le chargement ou en cas d'erreur). */}
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 pr-6">
            <StoreIcon className="size-5 text-primary" aria-hidden="true" />
            {detail ? (
              <>
                {detail.store.name}
                {detail.store.status === "ACTIVE" ? (
                  <Badge
                    variant="outline"
                    className="border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
                  >
                    Active
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="border-red-300 bg-red-100 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
                  >
                    Suspendue
                  </Badge>
                )}
              </>
            ) : (
              "Détail de la boutique"
            )}
          </DialogTitle>
          <DialogDescription>
            {detail
              ? `/${detail.store.slug} · Propriétaire : ${detail.owner.name} (${detail.owner.email})${
                  detail.owner.emailVerified ? " · email confirmé" : " · email NON confirmé"
                } · créée le ${formatDate(detail.store.createdAt)}`
              : "Produits, commandes, retraits et portefeuille du vendeur."}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-4" aria-busy="true">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Skeleton className="h-24 rounded-xl" />
              <Skeleton className="h-24 rounded-xl" />
              <Skeleton className="h-24 rounded-xl" />
              <Skeleton className="h-24 rounded-xl" />
            </div>
            <Skeleton className="h-48 rounded-xl" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-4 py-10 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" onClick={() => void load()}>
              Réessayer
            </Button>
          </div>
        ) : detail ? (
          <>
            <div className="space-y-6">
              {/* Portefeuille du vendeur */}
              <div className="grid gap-4 sm:grid-cols-2">
                <StatCard
                  label="Ventes encaissées"
                  value={formatXOF(detail.wallet.grossXOF)}
                  icon={Banknote}
                  hint={`${detail.counts.paidOrders} commande(s) payée(s)`}
                />
                <StatCard
                  label="Commissions plateforme"
                  value={formatXOF(detail.wallet.commissionXOF)}
                  icon={Percent}
                />
                <StatCard label="Net vendeur" value={formatXOF(detail.wallet.netXOF)} icon={HandCoins} />
                <StatCard
                  label="Solde disponible"
                  value={formatXOF(detail.wallet.availableXOF)}
                  icon={ShieldCheck}
                  hint={
                    detail.wallet.pendingXOF > 0
                      ? `${formatXOF(detail.wallet.pendingXOF)} en retrait en cours`
                      : undefined
                  }
                />
              </div>

              {/* Produits (tous statuts) */}
              <section aria-label="Produits de la boutique">
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <Package className="size-4 text-primary" aria-hidden="true" />
                  Produits ({detail.products.length})
                  <span className="font-normal text-muted-foreground">
                    — y compris brouillons et archivés
                  </span>
                </h3>
                {detail.products.length === 0 ? (
                  <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
                    Aucun produit créé par ce vendeur.
                  </p>
                ) : (
                  <div className="max-h-64 overflow-y-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Produit</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead className="text-right">Prix</TableHead>
                          <TableHead>Statut</TableHead>
                          <TableHead>Créé le</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detail.products.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell className="max-w-52">
                              <span className="block truncate font-medium" title={p.title}>
                                {p.title}
                              </span>
                              {p.type === "PHYSICAL" && p.stock !== null ? (
                                <span className="text-xs text-muted-foreground">
                                  Stock : {p.stock}
                                </span>
                              ) : null}
                            </TableCell>
                            <TableCell className="text-xs">
                              {p.type === "DIGITAL" ? "Numérique" : "Physique"}
                            </TableCell>
                            <TableCell className="text-right">{formatXOF(p.priceXOF)}</TableCell>
                            <TableCell>
                              <StatusBadge status={p.status} />
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-xs">
                              {formatDate(p.createdAt)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </section>

              {/* Commandes récentes */}
              <section aria-label="Commandes de la boutique">
                <h3 className="mb-2 text-sm font-semibold">
                  Commandes récentes ({detail.orders.length})
                </h3>
                {detail.orders.length === 0 ? (
                  <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
                    Aucune commande pour l&apos;instant.
                  </p>
                ) : (
                  <div className="max-h-64 overflow-y-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Référence</TableHead>
                          <TableHead>Client</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead>Statut</TableHead>
                          <TableHead>Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detail.orders.map((o) => (
                          <TableRow key={o.reference}>
                            <TableCell className="font-mono text-xs font-medium">
                              {o.reference}
                            </TableCell>
                            <TableCell className="max-w-40 truncate text-sm" title={o.customerEmail}>
                              {o.customerName}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {formatXOF(o.totalXOF)}
                            </TableCell>
                            <TableCell>
                              <StatusBadge status={o.status} />
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-xs">
                              {formatDate(o.createdAt)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </section>

              {/* Retraits */}
              {detail.withdrawals.length > 0 ? (
                <section aria-label="Retraits du vendeur">
                  <h3 className="mb-2 text-sm font-semibold">Retraits ({detail.withdrawals.length})</h3>
                  <div className="max-h-40 overflow-y-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-right">Montant</TableHead>
                          <TableHead>Méthode</TableHead>
                          <TableHead>Statut</TableHead>
                          <TableHead>Demandé le</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detail.withdrawals.map((w) => (
                          <TableRow key={w.id}>
                            <TableCell className="text-right font-medium">
                              {formatXOF(w.amountXOF)}
                            </TableCell>
                            <TableCell className="text-xs">
                              {w.method === "BANK_TRANSFER" ? "Virement bancaire" : "Mobile Money"}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{w.status}</Badge>
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-xs">
                              {formatDate(w.requestedAt)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </section>
              ) : null}

              <div className="flex justify-end">
                <Button variant="outline" onClick={openStorePublicPage}>
                  <ExternalLink className="size-4" aria-hidden="true" />
                  Ouvrir la boutique publique
                </Button>
              </div>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
