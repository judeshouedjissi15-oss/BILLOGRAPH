"use client";

// Onglet "Vue d'ensemble" du dashboard vendeur : statistiques, graphique 30 jours,
// top produits, dernières commandes. GET /api/stats/vendor

import { useCallback, useEffect, useState } from "react";
import {
  Banknote,
  ShoppingCart,
  TrendingUp,
  Wallet,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatCard } from "../stat-card";
import { StatusBadge } from "../status-badge";
import { apiFetch } from "../lib/api-client";
import { formatDate, formatXOF } from "@/lib/format";
import type { VendorStats } from "@/types/api";

const BRAND = "#0B7A6B";

type OverviewTabProps = {
  storeSlug: string;
  onOpenOrders: () => void;
};

function compactAmount(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(".0", "")} M`;
  if (Math.abs(value) >= 1_000) return `${Math.round(value / 1_000)} k`;
  return String(value);
}

function shortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(date);
}

type SalesTooltipProps = {
  active?: boolean;
  label?: string | number;
  payload?: { payload?: { date?: string; revenueXOF?: number; ordersCount?: number } }[];
};

function SalesTooltip({ active, label, payload }: SalesTooltipProps) {
  if (!active || !payload?.length) return null;
  const datum = payload[0]?.payload;
  if (!datum) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="font-medium">{datum.date ? shortDate(datum.date) : String(label ?? "")}</p>
      <p className="mt-0.5 font-semibold text-primary">{formatXOF(datum.revenueXOF ?? 0)}</p>
      <p className="text-xs text-muted-foreground">
        {datum.ordersCount ?? 0} commande(s) sur cette journée
      </p>
    </div>
  );
}

function OrdersTooltip({ active, label, payload }: SalesTooltipProps) {
  if (!active || !payload?.length) return null;
  const datum = payload[0]?.payload;
  if (!datum) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="font-medium">{datum.date ? shortDate(datum.date) : String(label ?? "")}</p>
      <p className="mt-0.5 font-semibold text-primary">
        {datum.ordersCount ?? 0} commande(s) payée(s)
      </p>
      <p className="text-xs text-muted-foreground">Revenus du jour : {formatXOF(datum.revenueXOF ?? 0)}</p>
    </div>
  );
}

export function OverviewTab({ storeSlug, onOpenOrders }: OverviewTabProps) {
  const [stats, setStats] = useState<VendorStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<VendorStats>("/api/stats/vendor");
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de charger les statistiques.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, storeSlug]);

  if (loading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-xl" />
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
          <p className="text-sm text-destructive">{error ?? "Statistiques indisponibles."}</p>
          <Button variant="outline" onClick={() => void load()}>
            Réessayer
          </Button>
        </CardContent>
      </Card>
    );
  }

  const hasSales = stats.series.some((point) => point.revenueXOF > 0);
  // Graphique des commandes : alimenté par la SÉRIE RÉELLE de l'API — il
  // s'affiche dès qu'au moins une commande payée existe, même à 0 FCFA
  // (produit gratuit), pour une analyse complète de l'activité.
  const hasOrders = stats.series.some((point) => point.ordersCount > 0);

  return (
    <div className="space-y-6">
      {/* StatCards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Revenus totaux"
          value={formatXOF(stats.totals.revenueXOF)}
          icon={Banknote}
          hint={`Commission plateforme, tout compris (frais de paiement inclus) : ${formatXOF(stats.totals.commissionXOF)}`}
        />
        <StatCard
          label="30 derniers jours"
          value={formatXOF(stats.period.revenueXOF)}
          icon={TrendingUp}
          hint={`${stats.period.ordersCount} commande(s) sur la période`}
        />
        <StatCard
          label="Commandes payées"
          value={String(stats.totals.ordersCount)}
          icon={ShoppingCart}
          hint={`${stats.totals.customersCount} client(s) distinct(s)`}
        />
        <StatCard
          label="Solde disponible"
          value={formatXOF(stats.totals.netXOF)}
          icon={Wallet}
          hint="Net de commission, avant reversement"
        />
      </div>

      {/* Graphique des ventes */}
      <Card>
        <CardHeader>
          <CardTitle>Ventes des 30 derniers jours</CardTitle>
          <CardDescription>Revenus journaliers, commandes payées uniquement.</CardDescription>
        </CardHeader>
        <CardContent>
          {stats.series.length === 0 || !hasSales ? (
            <div className="flex h-60 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-center">
              <p className="font-medium">Aucune vente sur les 30 derniers jours</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Partagez le lien de votre boutique : dès qu&apos;une commande est payée, elle
                apparaîtra ici.
              </p>
            </div>
          ) : (
            <div className="h-[260px] w-full">
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={stats.series} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="vendorRevenueGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={BRAND} stopOpacity={0.35} />
                      <stop offset="95%" stopColor={BRAND} stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-border" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(value: string) => shortDate(value)}
                    minTickGap={28}
                    tick={{ fontSize: 12 }}
                    stroke="currentColor"
                    className="text-muted-foreground"
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tickFormatter={(value: number) => compactAmount(value)}
                    width={52}
                    tick={{ fontSize: 12 }}
                    stroke="currentColor"
                    className="text-muted-foreground"
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip content={<SalesTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="revenueXOF"
                    name="Revenus"
                    stroke={BRAND}
                    strokeWidth={2}
                    fill="url(#vendorRevenueGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Graphique des commandes (données réelles, indépendant du CA) */}
      {hasOrders ? (
        <Card>
          <CardHeader>
            <CardTitle>Commandes des 30 derniers jours</CardTitle>
            <CardDescription>Nombre de commandes payées par jour (source : commandes réelles).</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={stats.series} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-border" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(value: string) => shortDate(value)}
                    minTickGap={28}
                    tick={{ fontSize: 12 }}
                    stroke="currentColor"
                    className="text-muted-foreground"
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    width={40}
                    tick={{ fontSize: 12 }}
                    stroke="currentColor"
                    className="text-muted-foreground"
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip cursor={{ fill: "hsl(var(--muted) / 0.4)" }} content={<OrdersTooltip />} />
                  <Bar
                    dataKey="ordersCount"
                    name="Commandes"
                    fill={BRAND}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={36}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top produits */}
        <Card>
          <CardHeader>
            <CardTitle>Top produits</CardTitle>
            <CardDescription>Classement par chiffre d&apos;affaires.</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.topProducts.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Aucune vente pour le moment.
              </p>
            ) : (
              <ul className="space-y-3">
                {stats.topProducts.map((product, index) => (
                  <li
                    key={`${product.title}-${index}`}
                    className="flex items-center justify-between gap-3 rounded-lg border p-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                        {index + 1}
                      </span>
                      <p className="truncate text-sm font-medium">{product.title}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold">{formatXOF(product.revenueXOF)}</p>
                      <p className="text-xs text-muted-foreground">{product.units} unité(s)</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Dernières commandes */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Dernières commandes</CardTitle>
              <CardDescription>Les 10 plus récentes.</CardDescription>
            </div>
            <Button variant="ghost" size="sm" className="h-9" onClick={onOpenOrders}>
              Tout voir
            </Button>
          </CardHeader>
          <CardContent>
            {stats.latestOrders.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Aucune commande pour le moment.
              </p>
            ) : (
              <div className="max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Référence</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Statut</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.latestOrders.map((order) => (
                      <TableRow key={order.reference}>
                        <TableCell className="font-mono text-xs font-medium">
                          {order.reference}
                        </TableCell>
                        <TableCell className="max-w-32 truncate">{order.customerName}</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatXOF(order.totalXOF)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={order.status} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              Dernière mise à jour : {formatDate(new Date())}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
