"use client";

// Onglet "Commandes" du dashboard vendeur : filtres, recherche, table.
// Le détail d'une commande est une VRAIE PAGE : #/dashboard/commande/{reference}
// (client, articles, jetons de téléchargement, actions y sont gérés).

import { useCallback, useEffect, useMemo, useState } from "react";
import { ShoppingBasket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, apiUrl } from "../lib/api-client";
import { navigateTo } from "../lib/use-hash-route";
import { useDebouncedValue } from "../lib/use-debounced-value";
import { StatusBadge } from "../status-badge";
import { formatDate, formatXOF, orderStatusLabel } from "@/lib/format";
import { ORDER_STATUSES } from "@/lib/constants";
import type { OrderStatus, VendorOrder } from "@/types/api";

type OrdersTabProps = {
  storeSlug: string;
};

export function OrdersTab({ storeSlug }: OrdersTabProps) {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q, 300);
  const [orders, setOrders] = useState<VendorOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await apiFetch<{ orders: VendorOrder[] }>(
        apiUrl("/api/orders/mine", {
          status: statusFilter === "all" ? undefined : statusFilter,
          q: debouncedQ.trim() || undefined,
        }),
      );
      setOrders(data.orders);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de charger vos commandes.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, debouncedQ]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load, storeSlug]);

  const totals = useMemo(() => {
    const paid = orders.filter((o) => o.status === "PAID" || o.status === "DELIVERED");
    return {
      count: orders.length,
      revenue: paid.reduce((sum, o) => sum + o.totalXOF, 0),
    };
  }, [orders]);

  return (
    <div className="space-y-4">
      {/* Filtres */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="orders-status">Statut</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger id="orders-status" className="h-11 w-full sm:w-48">
              <SelectValue placeholder="Tous les statuts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              {ORDER_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {orderStatusLabel(status)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="orders-search">Rechercher</Label>
          <Input
            id="orders-search"
            type="search"
            placeholder="Référence ou email client…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-11"
          />
        </div>
        <p className="text-sm text-muted-foreground sm:pb-3">
          {totals.count} commande(s) · {formatXOF(totals.revenue)} encaissé(s)
        </p>
      </div>

      {loading ? (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-12 w-full rounded-md" />
          <Skeleton className="h-12 w-full rounded-md" />
          <Skeleton className="h-12 w-full rounded-md" />
        </div>
      ) : error ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" onClick={() => void load()}>
              Réessayer
            </Button>
          </CardContent>
        </Card>
      ) : orders.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <ShoppingBasket className="size-7" aria-hidden="true" />
            </span>
            <p className="font-semibold">Aucune commande trouvée</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Ajustez vos filtres ou partagez le lien de votre boutique pour recevoir vos
              premières commandes.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="py-0">
          <CardContent className="p-0">
            <div className="max-h-96 overflow-y-auto overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Référence</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead className="text-right">Articles</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Commission</TableHead>
                    <TableHead>Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order) => (
                    <TableRow
                      key={order.reference}
                      className="cursor-pointer"
                      tabIndex={0}
                      onClick={() => navigateTo(`#/dashboard/commande/${order.reference}`)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          navigateTo(`#/dashboard/commande/${order.reference}`);
                        }
                      }}
                      aria-label={`Ouvrir le détail de la commande ${order.reference}`}
                    >
                      <TableCell className="font-mono text-xs font-medium">
                        {order.reference}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {formatDate(order.createdAt)}
                      </TableCell>
                      <TableCell>
                        <p className="max-w-36 truncate font-medium">{order.customer.name}</p>
                        <p className="max-w-36 truncate text-xs text-muted-foreground">
                          {order.customer.email}
                        </p>
                      </TableCell>
                      <TableCell className="text-right">{order.items.length}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatXOF(order.totalXOF)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatXOF(order.commissionXOF)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={order.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
