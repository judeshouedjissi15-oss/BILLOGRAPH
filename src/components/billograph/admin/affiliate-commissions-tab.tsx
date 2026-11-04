"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatXOF } from "@/lib/format";
import { apiFetch } from "../lib/api-client";

type Commission = {
  id: string;
  orderReference: string;
  orderTotalXOF: number;
  orderStatus: string;
  affiliateName: string;
  sellerName: string;
  productTitle: string;
  amountXOF: number;
  ratePercent: number;
  status: string;
  createdAt: string;
};

export function AffiliateCommissionsTab() {
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ commissions: Commission[] }>("/api/admin/affiliate-commissions");
      setCommissions(data.commissions);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Impossible de charger les commissions.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return <div className="space-y-3" aria-busy="true"><Skeleton className="h-20 rounded-xl" /><Skeleton className="h-64 rounded-xl" /></div>;
  }
  if (error) {
    return <Card><CardContent className="flex flex-col items-center gap-4 p-8 text-center">
      <p role="alert" className="text-sm text-destructive">{error}</p>
      <Button type="button" variant="outline" onClick={() => void load()}>Réessayer</Button>
    </CardContent></Card>;
  }

  const total = commissions.reduce((sum, item) => sum + item.amountXOF, 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Commissions d&apos;affiliation</CardTitle>
        <CardDescription>
          Jusqu&apos;aux 200 commissions les plus récentes. Une commission est créée par paiement vérifié et liée à son taux d&apos;origine.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 rounded-lg bg-muted/40 p-4">
          <p className="text-sm text-muted-foreground">Total affiché</p>
          <p className="mt-1 text-lg font-semibold">{formatXOF(total)}</p>
        </div>
        {commissions.length ? (
          <ul className="divide-y rounded-lg border px-3">
            {commissions.map((item) => (
              <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">{item.orderReference} · {item.productTitle}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Affilié : {item.affiliateName} · vendeur : {item.sellerName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Commande {item.orderStatus} · {item.ratePercent}% du panier · {formatDate(item.createdAt)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{formatXOF(item.amountXOF)}</p>
                  <p className="text-xs text-muted-foreground">{item.status}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">Aucune commission enregistrée.</p>
        )}
      </CardContent>
    </Card>
  );
}
