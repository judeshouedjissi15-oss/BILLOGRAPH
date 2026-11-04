"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Link2, Loader2, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { formatXOF } from "@/lib/format";
import { getActiveProductPrice } from "@/lib/product-pricing";
import { apiFetch } from "../lib/api-client";

type MarketplaceProduct = {
  id: string;
  title: string;
  slug: string;
  priceXOF: number;
  salePriceXOF: number | null;
  saleStartsAt: string | null;
  saleEndsAt: string | null;
  affiliatePercent: number;
  store: { name: string; slug: string };
  link: { code: string; conversions: number; earnedXOF: number } | null;
};

type AffiliateLink = {
  code: string;
  createdAt: string;
  product: { title: string; slug: string; priceXOF: number };
  conversions: number;
  earnedXOF: number;
};

type MarketplaceData = { products: MarketplaceProduct[]; links: AffiliateLink[] };

export function AffiliateMarketplaceTab() {
  const { toast } = useToast();
  const [data, setData] = useState<MarketplaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await apiFetch<MarketplaceData>("/api/affiliates/marketplace"));
    } catch (error) {
      setError(error instanceof Error ? error.message : "Réessayez dans un instant.");
      toast({
        variant: "destructive",
        title: "Marché affilié indisponible",
        description: error instanceof Error ? error.message : "Réessayez dans un instant.",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const getReferralUrl = (product: MarketplaceProduct, code: string) =>
    `${window.location.origin}/#/produit/${product.slug}?ref=${encodeURIComponent(code)}`;

  const createLink = async (product: MarketplaceProduct) => {
    setCreating(product.id);
    try {
      await apiFetch("/api/affiliates/marketplace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id }),
      });
      await load();
      toast({ title: "Lien affilié créé", description: `Vous pouvez maintenant partager « ${product.title} ».` });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Création impossible",
        description: error instanceof Error ? error.message : "Réessayez dans un instant.",
      });
    } finally {
      setCreating(null);
    }
  };

  const copyLink = async (product: MarketplaceProduct, code: string) => {
    try {
      await navigator.clipboard.writeText(getReferralUrl(product, code));
      toast({ title: "Lien copié", description: "Partagez-le pour suivre vos ventes affiliées." });
    } catch {
      toast({ variant: "destructive", title: "Copie impossible", description: "Copiez le lien depuis la barre d'adresse de partage." });
    }
  };

  if (loading && !data) {
    return <div className="space-y-4" aria-busy="true"><Skeleton className="h-28 rounded-xl" /><Skeleton className="h-64 rounded-xl" /></div>;
  }

  if (error && !data) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
          <p role="alert" className="text-sm text-destructive">{error}</p>
          <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>
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
          <CardTitle>Marché d&apos;affiliation</CardTitle>
          <CardDescription>
            Choisissez un produit, partagez votre lien et recevez la commission définie par son vendeur après confirmation du paiement.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data?.products.length ? (
            <ul className="divide-y">
              {data.products.map((product) => {
                const price = getActiveProductPrice(product);
                return (
                  <li key={product.id} className="flex flex-wrap items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{product.title}</p>
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Store className="size-3.5" aria-hidden="true" /> {product.store.name}
                      </p>
                      <p className="mt-1 text-sm">
                        {price ? formatXOF(price) : "Gratuit"}
                        <span className="ml-2 text-xs text-muted-foreground">· {product.affiliatePercent}% de commission</span>
                      </p>
                      {product.link && <p className="mt-1 text-xs text-muted-foreground">{product.link.conversions} ventes · {formatXOF(product.link.earnedXOF)} gagnés</p>}
                    </div>
                    {product.link ? (
                      <Button type="button" variant="outline" onClick={() => void copyLink(product, product.link!.code)}>
                        <Copy className="size-4" aria-hidden="true" /> Copier mon lien
                      </Button>
                    ) : (
                      <Button type="button" disabled={creating === product.id} onClick={() => void createLink(product)}>
                        {creating === product.id ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Link2 className="size-4" aria-hidden="true" />}
                        Générer un lien
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">Aucun produit ouvert à l&apos;affiliation pour le moment.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mes liens et commissions</CardTitle>
          <CardDescription>Seules les commandes payées génèrent une commission. Les remboursements ne sont pas rémunérés.</CardDescription>
        </CardHeader>
        <CardContent>
          {data?.links.length ? (
            <ul className="divide-y">
              {data.links.map((link) => (
                <li key={link.code} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div>
                    <p className="font-medium">{link.product.title}</p>
                    <p className="text-xs text-muted-foreground">{link.conversions} ventes confirmées</p>
                  </div>
                  <p className="font-semibold text-primary">{formatXOF(link.earnedXOF)}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-5 text-center text-sm text-muted-foreground">Vos liens affiliés apparaîtront ici.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
