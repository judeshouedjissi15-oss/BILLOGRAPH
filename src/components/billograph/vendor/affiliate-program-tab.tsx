"use client";

import { useCallback, useEffect, useState } from "react";
import { BarChart3, Link2, Package, Pencil, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatXOF } from "@/lib/format";
import { apiFetch } from "../lib/api-client";
import { navigateTo } from "../lib/use-hash-route";

type VendorAffiliateData = {
  products: Array<{
    id: string;
    title: string;
    status: string;
    priceXOF: number;
    affiliateEnabled: boolean;
    affiliatePercent: number;
    affiliates: Array<{
      id: string;
      name: string;
      clicks: number;
      uniqueVisitors: number;
      sales: number;
      commissionXOF: number;
      pendingXOF: number;
    }>;
  }>;
  totals: {
    products: number;
    activeProducts: number;
    affiliates: number;
    clicks: number;
    sales: number;
    commissionXOF: number;
  };
};

export function AffiliateProgramTab() {
  const [data, setData] = useState<VendorAffiliateData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await apiFetch<VendorAffiliateData>("/api/affiliates/vendor"));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Impossible de charger les données d'affiliation.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading && !data) {
    return <div className="space-y-4" aria-busy="true"><Skeleton className="h-28 rounded-xl" /><Skeleton className="h-64 rounded-xl" /></div>;
  }
  if (error && !data) {
    return (
      <Card><CardContent className="flex flex-col items-center gap-4 p-8 text-center">
        <p role="alert" className="text-sm text-destructive">{error}</p>
        <Button type="button" variant="outline" onClick={() => void load()}>Réessayer</Button>
      </CardContent></Card>
    );
  }

  const metrics: { label: string; value: string | number; icon: LucideIcon }[] = [
    { label: "Offres actives", value: data?.totals.activeProducts ?? 0, icon: Package },
    { label: "Affiliés", value: data?.totals.affiliates ?? 0, icon: Users },
    { label: "Clics", value: data?.totals.clicks ?? 0, icon: Link2 },
    { label: "Ventes confirmées", value: data?.totals.sales ?? 0, icon: BarChart3 },
    { label: "Commissions générées", value: formatXOF(data?.totals.commissionXOF ?? 0), icon: BarChart3 },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Performance de votre programme</CardTitle>
          <CardDescription>
            Activez l&apos;affiliation sur un produit pour le rendre disponible dans le marché. Le vendeur fixe le taux; les commissions ne sont comptabilisées qu&apos;après confirmation du paiement.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {metrics.map(({ label, value, icon: StatIcon }) => {
            return (
              <div key={label} className="rounded-lg border p-4">
                <StatIcon className="size-4 text-primary" aria-hidden="true" />
                <p className="mt-2 text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 font-semibold">{value}</p>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mes produits affiliés</CardTitle>
          <CardDescription>Modifiez le taux ou les conditions depuis la fiche de chaque produit.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {data?.products.length ? data.products.map((product) => (
            <div key={product.id} className="rounded-xl border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{product.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatXOF(product.priceXOF)} · commission {product.affiliatePercent}% · {product.affiliates.length} affilié(s)
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={product.affiliateEnabled && product.status === "PUBLISHED" ? "default" : "secondary"}>
                    {product.affiliateEnabled && product.status === "PUBLISHED" ? "Ouvert" : "Fermé"}
                  </Badge>
                  <Button type="button" variant="outline" size="sm" onClick={() => navigateTo(`#/dashboard/produit/${product.id}`)}>
                    <Pencil className="size-4" aria-hidden="true" /> Modifier
                  </Button>
                </div>
              </div>
              {product.affiliates.length > 0 && (
                <ul className="mt-4 divide-y rounded-lg bg-muted/30 px-3">
                  {product.affiliates.map((affiliate) => (
                    <li key={affiliate.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                      <div>
                        <p className="font-medium">{affiliate.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {affiliate.clicks} clics · {affiliate.uniqueVisitors} visiteurs uniques/jour · {affiliate.sales} ventes
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">{formatXOF(affiliate.commissionXOF)}</p>
                        <p className="text-xs text-muted-foreground">{formatXOF(affiliate.pendingXOF)} en attente</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )) : (
            <p className="py-8 text-center text-sm text-muted-foreground">Aucun produit dans votre boutique pour le moment.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
