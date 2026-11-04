"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Link2, Loader2, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { formatXOF } from "@/lib/format";
import { getActiveProductPrice } from "@/lib/product-pricing";
import { apiFetch } from "../lib/api-client";

type MarketplaceProduct = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  category: string;
  imageUrl: string | null;
  affiliateInstructions: string | null;
  affiliateTerms: string | null;
  priceXOF: number;
  salePriceXOF: number | null;
  saleStartsAt: string | null;
  saleEndsAt: string | null;
  createdAt: string;
  affiliatePercent: number;
  store: { name: string; slug: string };
  link: { code: string; conversions: number; earnedXOF: number; clicks: number; uniqueVisitors: number } | null;
};

type MarketplaceData = { products: MarketplaceProduct[] };

export function AffiliateMarketplaceTab() {
  const { toast } = useToast();
  const [data, setData] = useState<MarketplaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [sortBy, setSortBy] = useState("new");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const marketplace = await apiFetch<MarketplaceData>("/api/affiliates/marketplace");
      setData(marketplace);
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

  const getReferralUrl = (product: MarketplaceProduct, code: string, direct = false) =>
    `${window.location.origin}/#/${direct ? "commander" : "produit"}/${product.slug}?ref=${encodeURIComponent(code)}`;

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

  const copyLink = async (product: MarketplaceProduct, code: string, direct = false) => {
    try {
      await navigator.clipboard.writeText(getReferralUrl(product, code, direct));
      toast({ title: "Lien copié", description: direct ? "Lien direct vers la commande copié." : "Lien vers la page produit copié." });
    } catch {
      toast({ variant: "destructive", title: "Copie impossible", description: "Copiez le lien depuis la barre d'adresse de partage." });
    }
  };
  const visibleProducts = (data?.products ?? [])
    .filter((product) =>
      (!query || `${product.title} ${product.description ?? ""} ${product.store.name}`.toLowerCase().includes(query.toLowerCase())) &&
      (category === "all" || product.category === category),
    )
    .sort((a, b) => {
      if (sortBy === "price") return getActiveProductPrice(a) - getActiveProductPrice(b);
      if (sortBy === "commission") return b.affiliatePercent - a.affiliatePercent;
      if (sortBy === "popular") return (b.link?.clicks ?? 0) - (a.link?.clicks ?? 0);
      return Date.parse(b.createdAt) - Date.parse(a.createdAt);
    });

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
          <div className="mb-5 grid gap-3 sm:grid-cols-3">
            <Input
              aria-label="Rechercher un produit affilié"
              placeholder="Rechercher un produit ou vendeur"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-11"
            />
            <select
              aria-label="Filtrer par catégorie"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="h-11 rounded-md border bg-background px-3 text-sm"
            >
              <option value="all">Toutes les catégories</option>
              {[...new Set(data?.products.map((product) => product.category) ?? [])].sort().map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
            <select
              aria-label="Trier les produits affiliés"
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value)}
              className="h-11 rounded-md border bg-background px-3 text-sm"
            >
              <option value="new">Nouveautés</option>
              <option value="popular">Popularité (clics)</option>
              <option value="commission">Commission la plus élevée</option>
              <option value="price">Prix croissant</option>
            </select>
          </div>
          {visibleProducts.length ? (
            <ul className="divide-y">
              {visibleProducts.map((product) => {
                const price = getActiveProductPrice(product);
                return (
                  <li key={product.id} className="flex flex-wrap items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
                    {product.imageUrl && (
                      <div className="size-20 shrink-0 overflow-hidden rounded-lg bg-muted">
                        <img src={product.imageUrl} alt="" className="size-full object-cover" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{product.title}</p>
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Store className="size-3.5" aria-hidden="true" /> {product.store.name}
                      </p>
                      <p className="mt-1 text-sm">
                        {price ? formatXOF(price) : "Gratuit"}
                        <span className="ml-2 text-xs text-muted-foreground">· {product.affiliatePercent}% · gain estimé {formatXOF(Math.floor((price ?? 0) * product.affiliatePercent / 100))}</span>
                      </p>
                      {product.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{product.description}</p>}
                      {product.affiliateInstructions && <p className="mt-1 text-xs"><span className="font-medium">Promotion :</span> {product.affiliateInstructions}</p>}
                      {product.affiliateTerms && <p className="mt-1 text-xs text-muted-foreground"><span className="font-medium">Conditions :</span> {product.affiliateTerms}</p>}
                      {product.link && <p className="mt-1 text-xs text-muted-foreground">{product.link.clicks} clics · {product.link.uniqueVisitors} visiteurs uniques/jour · {product.link.conversions} ventes · {formatXOF(product.link.earnedXOF)} gagnés</p>}
                    </div>
                    {product.link ? (
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" onClick={() => void copyLink(product, product.link!.code)}>
                          <Copy className="size-4" aria-hidden="true" /> Lien produit
                        </Button>
                        <Button type="button" variant="outline" onClick={() => void copyLink(product, product.link!.code, true)}>
                          <Copy className="size-4" aria-hidden="true" /> Lien commande
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(`${product.title} — ${getReferralUrl(product, product.link!.code)}`)}`, "_blank", "noopener,noreferrer")}
                        >
                          WhatsApp
                        </Button>
                      </div>
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

    </div>
  );
}
