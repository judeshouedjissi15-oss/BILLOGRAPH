"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownUp, Check, ChevronLeft, ChevronRight, Package, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CATEGORIES } from "@/lib/constants";
import { formatXOF } from "@/lib/format";
import { getActiveProductPrice } from "@/lib/product-pricing";
import { apiFetch, apiUrl } from "./lib/api-client";
import { navigateTo } from "./lib/use-hash-route";
import { rememberBuyerReferral } from "./lib/buyer-referral-attribution";

type MarketProduct = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  type: string;
  category: string;
  priceXOF: number;
  salePriceXOF: number | null;
  saleStartsAt: string | null;
  saleEndsAt: string | null;
  imageUrl: string | null;
  stock: number | null;
  createdAt: string;
  store: { name: string; slug: string; color: string; verifiedAt: string | null };
};

type MarketResponse = {
  products: MarketProduct[];
  total: number;
  page: number;
  pageSize: number;
};

type Filters = {
  q: string;
  category: string;
  type: string;
  minPrice: string;
  maxPrice: string;
  sort: string;
};

const INITIAL_FILTERS: Filters = {
  q: "",
  category: "",
  type: "",
  minPrice: "",
  maxPrice: "",
  sort: "recent",
};

function categoryName(id: string) {
  return CATEGORIES.find((category) => category.id === id)?.label ?? id;
}

export function MarketView() {
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(INITIAL_FILTERS);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<MarketResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);

  useEffect(() => {
    const referralCode = new URLSearchParams(window.location.hash.split("?")[1] ?? "").get("buyer_ref");
    if (referralCode) rememberBuyerReferral(referralCode);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const params: Record<string, string | number | undefined> = {
          page,
          ...appliedFilters,
        };
        const response = await apiFetch<MarketResponse>(
          apiUrl("/api/market/products", params),
        );
        if (!cancelled) setData(response);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Le catalogue est indisponible.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [appliedFilters, page]);

  const comparedProducts = useMemo(
    () => (data?.products ?? []).filter((product) => compareIds.includes(product.id)),
    [compareIds, data],
  );
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  const applyFilters = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(1);
    setAppliedFilters(filters);
    setCompareIds([]);
  };

  const toggleCompare = (productId: string) => {
    setCompareIds((current) => {
      if (current.includes(productId)) return current.filter((id) => id !== productId);
      if (current.length >= 3) return current;
      return [...current, productId];
    });
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
      <header className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">BILLOGRAPH MARKET</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Découvrez les produits</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Recherchez des offres publiées par les boutiques actives et achetez directement auprès des vendeurs.
        </p>
      </header>

      <form onSubmit={applyFilters} className="mb-8 rounded-2xl border bg-card p-4 sm:p-5">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <div className="space-y-2 md:col-span-2 xl:col-span-2">
            <Label htmlFor="market-query">Recherche</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                id="market-query"
                value={filters.q}
                onChange={(event) => setFilters({ ...filters, q: event.target.value })}
                maxLength={100}
                placeholder="Produit, description ou vendeur"
                className="pl-9"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="market-category">Catégorie</Label>
            <Select value={filters.category || "all"} onValueChange={(value) => setFilters({ ...filters, category: value === "all" ? "" : value })}>
              <SelectTrigger id="market-category"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes</SelectItem>
                {CATEGORIES.map((category) => (
                  <SelectItem key={category.id} value={category.id}>{category.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="market-type">Type</Label>
            <Select value={filters.type || "all"} onValueChange={(value) => setFilters({ ...filters, type: value === "all" ? "" : value })}>
              <SelectTrigger id="market-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les types</SelectItem>
                <SelectItem value="DIGITAL">Numérique</SelectItem>
                <SelectItem value="PHYSICAL">Physique</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="market-sort">Trier par</Label>
            <Select value={filters.sort} onValueChange={(value) => setFilters({ ...filters, sort: value })}>
              <SelectTrigger id="market-sort"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Plus récents</SelectItem>
                <SelectItem value="price-asc">Prix catalogue croissant</SelectItem>
                <SelectItem value="price-desc">Prix catalogue décroissant</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label htmlFor="market-min-price">Min. prix catalogue</Label>
              <Input
                id="market-min-price"
                type="number"
                min={0}
                max={10_000_000}
                step={100}
                value={filters.minPrice}
                onChange={(event) => setFilters({ ...filters, minPrice: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="market-max-price">Max. prix catalogue</Label>
              <Input
                id="market-max-price"
                type="number"
                min={0}
                max={10_000_000}
                step={100}
                value={filters.maxPrice}
                onChange={(event) => setFilters({ ...filters, maxPrice: event.target.value })}
              />
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">Les résultats ne montrent que les produits publiés.</p>
          <Button type="submit" className="h-10">
            <Search className="mr-2 size-4" aria-hidden="true" />
            Rechercher
          </Button>
        </div>
      </form>

      {error && (
        <Card className="mb-6 border-destructive/40">
          <CardContent className="p-5 text-sm text-destructive" role="alert">{error}</CardContent>
        </Card>
      )}

      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {loading ? "Chargement du catalogue…" : `${data?.total ?? 0} produit${data?.total === 1 ? "" : "s"}`}
        </p>
        {compareIds.length > 0 && (
          <Button type="button" variant="outline" size="sm" onClick={() => setCompareIds([])}>
            <X className="mr-1 size-4" aria-hidden="true" /> Vider la comparaison ({compareIds.length})
          </Button>
        )}
      </div>

      {loading ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="h-80 animate-pulse rounded-2xl border bg-muted/50" />
          ))}
        </div>
      ) : data && data.products.length > 0 ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {data.products.map((product) => {
            const price = getActiveProductPrice(product);
            const selected = compareIds.includes(product.id);
            const available = product.type === "DIGITAL" || product.stock === null || product.stock > 0;
            return (
              <Card key={product.id} className="overflow-hidden rounded-2xl">
                <button
                  type="button"
                  className="block w-full text-left"
                  onClick={() => navigateTo(`#/produit/${product.slug}`)}
                  aria-label={`Voir ${product.title}`}
                >
                  {product.imageUrl ? (
                    <img src={product.imageUrl} alt="" className="aspect-[16/10] w-full object-cover" />
                  ) : (
                    <div className="flex aspect-[16/10] items-center justify-center bg-muted" style={{ color: product.store.color }}>
                      <Package className="size-12" aria-hidden="true" />
                    </div>
                  )}
                </button>
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">{product.type === "DIGITAL" ? "Numérique" : "Physique"}</Badge>
                    <Badge variant="outline">{categoryName(product.category)}</Badge>
                  </div>
                  <div className="min-h-16">
                    <button
                      type="button"
                      className="line-clamp-2 text-left font-semibold hover:text-primary"
                      onClick={() => navigateTo(`#/produit/${product.slug}`)}
                    >
                      {product.title}
                    </button>
                    <button
                      type="button"
                      className="mt-1 text-left text-xs text-muted-foreground hover:text-primary"
                      onClick={() => navigateTo(`#/boutique/${product.store.slug}`)}
                    >
                      {product.store.name}
                    </button>
                    {product.store.verifiedAt && (
                      <Badge variant="outline" className="ml-1 border-emerald-500/40 text-emerald-700">
                        Vendeur vérifié
                      </Badge>
                    )}
                  </div>
                  <p className="line-clamp-2 min-h-10 text-sm text-muted-foreground">
                    {product.description || "Découvrez les informations sur la fiche du produit."}
                  </p>
                  <div className="flex items-center justify-between gap-2 border-t pt-3">
                    <div>
                      <p className="font-bold text-primary">{formatXOF(price)}</p>
                      {!available && <p className="text-xs text-destructive">Épuisé</p>}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant={selected ? "secondary" : "outline"}
                      disabled={!selected && compareIds.length >= 3}
                      onClick={() => toggleCompare(product.id)}
                      aria-pressed={selected}
                      aria-label={`${selected ? "Retirer" : "Ajouter"} ${product.title} ${selected ? "de" : "à"} la comparaison`}
                    >
                      {selected ? <Check className="mr-1 size-4" aria-hidden="true" /> : <ArrowDownUp className="mr-1 size-4" aria-hidden="true" />}
                      Comparer
                    </Button>
                  </div>
                  <Button
                    type="button"
                    className="w-full"
                    disabled={!available}
                    onClick={() => navigateTo(`#/produit/${product.slug}`)}
                  >
                    {available ? "Voir et acheter" : "Indisponible"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : data ? (
        <Card>
          <CardContent className="flex flex-col items-center p-10 text-center">
            <Package className="size-10 text-muted-foreground" aria-hidden="true" />
            <h2 className="mt-4 text-lg font-semibold">Aucun produit trouvé</h2>
            <p className="mt-1 text-sm text-muted-foreground">Essayez d&apos;élargir votre recherche ou vos filtres.</p>
          </CardContent>
        </Card>
      ) : null}

      {comparedProducts.length > 0 && (
        <section className="mt-10 rounded-2xl border bg-card p-4 sm:p-6" aria-labelledby="market-compare-title">
          <h2 id="market-compare-title" className="text-xl font-semibold">Comparer les produits</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-left text-sm">
              <thead>
                <tr>
                  <th scope="col" className="w-36 border-b p-3 text-muted-foreground">Critère</th>
                  {comparedProducts.map((product) => (
                    <th scope="col" key={product.id} className="border-b p-3 align-top">
                      <div className="flex items-start justify-between gap-2">
                        <button className="text-left font-semibold hover:text-primary" onClick={() => navigateTo(`#/produit/${product.slug}`)}>
                          {product.title}
                        </button>
                        <button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label={`Retirer ${product.title} de la comparaison`} onClick={() => toggleCompare(product.id)}>
                          <X className="size-4" aria-hidden="true" />
                        </button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ["Prix", (product: MarketProduct) => formatXOF(getActiveProductPrice(product))],
                  ["Vendeur", (product: MarketProduct) => product.store.name],
                  ["Type", (product: MarketProduct) => product.type === "DIGITAL" ? "Numérique" : "Physique"],
                  ["Catégorie", (product: MarketProduct) => categoryName(product.category)],
                  ["Disponibilité", (product: MarketProduct) => product.type === "DIGITAL" || product.stock === null || product.stock > 0 ? "Disponible" : "Épuisé"],
                ].map(([label, getValue]) => (
                  <tr key={label as string}>
                    <th scope="row" className="border-b p-3 font-medium text-muted-foreground">{label as string}</th>
                    {comparedProducts.map((product) => (
                      <td key={product.id} className="border-b p-3">{(getValue as (item: MarketProduct) => string)(product)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {data && totalPages > 1 && (
        <nav className="mt-8 flex items-center justify-center gap-3" aria-label="Pagination des produits">
          <Button type="button" variant="outline" disabled={page <= 1} onClick={() => {
            setCompareIds([]);
            setPage((current) => current - 1);
          }}>
            <ChevronLeft className="mr-1 size-4" aria-hidden="true" /> Précédent
          </Button>
          <span className="text-sm text-muted-foreground">Page {page} / {totalPages}</span>
          <Button type="button" variant="outline" disabled={page >= totalPages} onClick={() => {
            setCompareIds([]);
            setPage((current) => current + 1);
          }}>
            Suivant <ChevronRight className="ml-1 size-4" aria-hidden="true" />
          </Button>
        </nav>
      )}
    </div>
  );
}
