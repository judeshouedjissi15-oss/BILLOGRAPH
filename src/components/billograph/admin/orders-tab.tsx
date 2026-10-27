"use client";

// Onglet "Commandes" de l'espace admin : toutes boutiques, filtre statut.
// GET /api/admin/orders?status=&limit=100
// NB : le contrat ne fige pas la shape exacte — on se base sur { orders: [...] }
// avec les champs plausibles (reference, storeName, customerName, totalXOF…).

import { useCallback, useEffect, useState } from "react";
import { ShoppingBasket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { StatusBadge } from "../status-badge";
import { formatDate, formatXOF, orderStatusLabel } from "@/lib/format";
import { ORDER_STATUSES } from "@/lib/constants";
import type { OrderStatus } from "@/types/api";

export type AdminOrderRow = {
  reference: string;
  status: OrderStatus;
  totalXOF: number;
  commissionXOF?: number;
  storeName?: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
  createdAt: string;
};

export function OrdersTab() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [orders, setOrders] = useState<AdminOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await apiFetch<{ orders: AdminOrderRow[] }>(
        apiUrl("/api/admin/orders", {
          status: statusFilter === "all" ? undefined : statusFilter,
          limit: 100,
        }),
      );
      setOrders(data.orders);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de charger les commandes.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <Label htmlFor="admin-orders-status">Statut</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger id="admin-orders-status" className="h-11 w-full sm:w-48">
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
        <p className="text-sm text-muted-foreground sm:pb-3">{orders.length} commande(s)</p>
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
            <ShoppingBasket className="size-10 text-muted-foreground" aria-hidden="true" />
            <p className="font-semibold">Aucune commande trouvée</p>
            <p className="text-sm text-muted-foreground">Ajustez le filtre de statut.</p>
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
                    <TableHead>Boutique</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order) => (
                    <TableRow key={order.reference}>
                      <TableCell className="font-mono text-xs font-medium">
                        {order.reference}
                      </TableCell>
                      <TableCell className="max-w-36 truncate">{order.storeName ?? "—"}</TableCell>
                      <TableCell className="max-w-36 truncate">
                        {order.customerName ?? order.customerEmail ?? "—"}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatXOF(order.totalXOF)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {formatDate(order.createdAt)}
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
