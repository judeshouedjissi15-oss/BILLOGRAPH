"use client";

// BOUTIQUE PUBLIQUE (#/boutique/{slug}) : bandeau à la couleur du vendeur,
// grille des produits publiés. GET /api/stores/{slug}

import { useEffect, useState } from "react";
import { Package, Phone, ShoppingCart, Store as StoreIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "../lib/api-client";
import { navigateTo } from "../lib/use-hash-route";
import { formatXOF } from "@/lib/format";
import type { PublicProduct, Store } from "@/types/api";

type StoreState =
  | { status: "loading" }
  | { status: "ready"; store: Store; products: PublicProduct[] }
  | { status: "not-found" }
  | { status: "error"; message: string };

function ProductCard({ product, color }: { product: PublicProduct; color: string }) {
  return (
    <Card className="group overflow-hidden py-0 transition-shadow hover:shadow-md">
      <div className="relative">
        {product.imageUrl ? (
           
          <img
            src={product.imageUrl}
            alt={`Image du produit ${product.title}`}
            className="aspect-video w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div
            className="flex aspect-video w-full items-center justify-center"
            style={{
              background: `linear-gradient(135deg, ${color}22 0%, ${color}44 55%, ${color}66 100%)`,
            }}
          >
            <Package className="size-10" style={{ color }} aria-hidden="true" />
          </div>
        )}
        <Badge className="absolute left-3 top-3 shadow" variant="secondary">
          {product.type === "DIGITAL" ? "Numérique" : "Physique"}
        </Badge>
      </div>
      <CardContent className="p-4">
        <h3 className="line-clamp-2 min-h-10 font-semibold leading-snug">{product.title}</h3>
        <div className="mt-3 flex items-center justify-between gap-2">
          <p className="font-bold text-primary">
            {product.priceXOF === 0 ? "Gratuit" : formatXOF(product.priceXOF)}
          </p>
          <Button size="sm" className="h-10" onClick={() => navigateTo(`#/produit/${product.slug}`)}>
            <ShoppingCart className="size-4" aria-hidden="true" />
            Acheter
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function StoreView({ slug }: { slug: string }) {
  const [state, setState] = useState<StoreState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setState({ status: "loading" });
      try {
        const data = await apiFetch<{ store: Store; products: PublicProduct[] }>(
          `/api/stores/${slug}`,
        );
        if (!cancelled) setState({ status: "ready", store: data.store, products: data.products });
      } catch (error) {
        if (cancelled) return;
        const status = (error as { status?: number }).status;
        if (status === 404) setState({ status: "not-found" });
        else
          setState({
            status: "error",
            message: error instanceof Error ? error.message : "Erreur de chargement.",
          });
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (state.status === "loading") {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8" aria-busy="true">
        <Skeleton className="h-48 w-full rounded-2xl" />
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-72 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (state.status === "not-found") {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <StoreIcon className="size-7" aria-hidden="true" />
        </span>
        <h1 className="mt-6 text-2xl font-bold tracking-tight">
          Boutique introuvable ou suspendue
        </h1>
        <p className="mt-2 text-muted-foreground">
          Cette boutique n&apos;existe plus ou a été désactivée par son propriétaire.
        </p>
        <Button className="mt-6 h-11" onClick={() => navigateTo("#/")}>
          Découvrir d&apos;autres boutiques
        </Button>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <Card>
          <CardContent className="p-10 text-center text-sm text-destructive">
            {state.message}
          </CardContent>
        </Card>
      </div>
    );
  }

  const { store, products } = state;

  return (
    <div>
      {/* Bandeau */}
      <header className="relative" style={{ backgroundColor: store.color }}>
        <div className="absolute inset-0 bg-black/25" aria-hidden="true" />
        <div className="relative mx-auto flex min-h-44 max-w-6xl flex-col justify-end px-4 py-8 sm:min-h-56">
          <h1 className="text-3xl font-bold text-white drop-shadow sm:text-4xl">{store.name}</h1>
          {store.description ? (
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/90 sm:text-base">
              {store.description}
            </p>
          ) : null}
          {store.phone ? (
            <p className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white backdrop-blur">
              <Phone className="size-3.5" aria-hidden="true" />
              {store.phone}
            </p>
          ) : null}
        </div>
      </header>

      {/* Produits */}
      <section className="mx-auto max-w-6xl px-4 py-10" aria-label="Produits de la boutique">
        {products.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-16 text-center">
            <Package className="size-10 text-muted-foreground" aria-hidden="true" />
            <p className="font-semibold">Cette boutique n&apos;a pas encore de produit publié</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Revenez bientôt : le vendeur prépare sûrement de belles choses.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} color={store.color} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
