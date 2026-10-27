"use client";

// PAGE DE VENTE PRODUIT (#/produit/{slug}) : fiche détaillée + bouton d'achat
// qui mène à la page de commande (#/commander/{slug}). GET /api/products/slug/{slug}

import { useEffect, useState } from "react";
import { Banknote, Download, Package, ShoppingCart, Store as StoreIcon, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "../lib/api-client";
import { navigateTo } from "../lib/use-hash-route";
import { formatBytes, formatXOF } from "@/lib/format";
import { CATEGORIES } from "@/lib/constants";
import type { PublicProductDetail } from "@/types/api";

type ProductStore = { name: string; slug: string; color: string; phone?: string | null };

type ProductState =
  | { status: "loading" }
  | { status: "ready"; product: PublicProductDetail; store: ProductStore }
  | { status: "not-found" }
  | { status: "error"; message: string };

function categoryLabel(categoryId: string): string {
  return CATEGORIES.find((c) => c.id === categoryId)?.label ?? categoryId;
}

export function ProductView({ slug }: { slug: string }) {
  const [state, setState] = useState<ProductState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setState({ status: "loading" });
      try {
        const data = await apiFetch<{ product: PublicProductDetail; store: ProductStore }>(
          `/api/products/slug/${slug}`,
        );
        if (!cancelled) {
          setState({ status: "ready", product: data.product, store: data.store });
          // Mémorise ce produit : la page commande propose « Réessayer le paiement » vers ici.
          try {
            window.sessionStorage.setItem("blg:last-product", `#/produit/${slug}`);
          } catch {
            // Stockage indisponible (navigation privée) : sans conséquence.
          }
        }
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
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 lg:grid-cols-2" aria-busy="true">
        <Skeleton className="aspect-video w-full rounded-2xl" />
        <div className="space-y-4">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    );
  }

  if (state.status === "not-found") {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <Package className="size-7" aria-hidden="true" />
        </span>
        <h1 className="mt-6 text-2xl font-bold tracking-tight">Produit introuvable</h1>
        <p className="mt-2 text-muted-foreground">
          Ce produit n&apos;existe plus ou a été retiré de la vente.
        </p>
        <Button className="mt-6 h-11" onClick={() => navigateTo("#/")}>
          Retour à l&apos;accueil
        </Button>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <Card>
          <CardContent className="p-10 text-center text-sm text-destructive">{state.message}</CardContent>
        </Card>
      </div>
    );
  }

  const { product, store } = state;
  const outOfStock = product.type === "PHYSICAL" && product.stock !== null && product.stock <= 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
      {/* Fil d'Ariane simple */}
      <nav aria-label="Fil d'Ariane" className="mb-6 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <button type="button" className="hover:text-primary" onClick={() => navigateTo("#/")}>
          Accueil
        </button>
        <span aria-hidden="true">/</span>
        <button type="button" className="hover:text-primary" onClick={() => navigateTo(`#/boutique/${store.slug}`)}>
          {store.name}
        </button>
        <span aria-hidden="true">/</span>
        <span className="truncate text-foreground">{product.title}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Visuel */}
        <div className="overflow-hidden rounded-2xl border shadow-sm">
          {product.imageUrl ? (
             
            <img
              src={product.imageUrl}
              alt={`Image du produit ${product.title}`}
              className="aspect-video w-full object-cover"
            />
          ) : (
            <div
              className="flex aspect-video w-full items-center justify-center"
              style={{
                background: `linear-gradient(135deg, ${store.color}1f 0%, ${store.color}3d 55%, ${store.color}59 100%)`,
              }}
            >
              <Package className="size-16" style={{ color: store.color }} aria-hidden="true" />
            </div>
          )}
        </div>

        {/* Infos */}
        <div className="flex flex-col">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">
              {product.type === "DIGITAL" ? "Produit numérique" : "Produit physique"}
            </Badge>
            <Badge variant="outline">{categoryLabel(product.category)}</Badge>
            {product.type === "DIGITAL" && product.hasFile && product.fileSize ? (
              <Badge variant="outline" className="text-muted-foreground">
                {formatBytes(product.fileSize)}
              </Badge>
            ) : null}
          </div>

          <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">{product.title}</h1>

          <button
            type="button"
            className="mt-3 inline-flex w-fit items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            onClick={() => navigateTo(`#/boutique/${store.slug}`)}
          >
            <StoreIcon className="size-4" aria-hidden="true" />
            {store.name}
          </button>

          <p className="mt-5 text-3xl font-extrabold tracking-tight">
            {product.priceXOF === 0 ? (
              <span className="text-primary">Gratuit</span>
            ) : (
              formatXOF(product.priceXOF)
            )}
          </p>

          {product.type === "PHYSICAL" && product.stock !== null && (
            <p className="mt-2 text-sm">
              {outOfStock ? (
                <span className="font-medium text-destructive">Rupture de stock</span>
              ) : product.stock < 10 ? (
                <span className="font-medium text-amber-600 dark:text-amber-400">
                  Plus que {product.stock} en stock !
                </span>
              ) : (
                <span className="text-muted-foreground">En stock : {product.stock} unité(s)</span>
              )}
            </p>
          )}

          {product.description ? (
            <p className="mt-5 whitespace-pre-line text-sm leading-relaxed text-muted-foreground sm:text-base">
              {product.description}
            </p>
          ) : (
            <p className="mt-5 text-sm italic text-muted-foreground">
              Le vendeur n&apos;a pas encore ajouté de description.
            </p>
          )}

          {/* Réassurance */}
          <ul className="mt-6 space-y-2.5 rounded-xl border bg-muted/40 p-4 text-sm">
            <li className="flex items-center gap-2.5">
              <Download className="size-4 shrink-0 text-primary" aria-hidden="true" />
              Téléchargement sécurisé pendant 30 jours (5 fois max)
            </li>
            <li className="flex items-center gap-2.5">
              <Truck className="size-4 shrink-0 text-primary" aria-hidden="true" />
              Livraison suivie directement par le vendeur
            </li>
            <li className="flex items-center gap-2.5">
              <Banknote className="size-4 shrink-0 text-primary" aria-hidden="true" />
              Paiement en FCFA, confirmation immédiate
            </li>
          </ul>

          <div className="mt-6">
            <Button
              size="lg"
              className="h-12 w-full text-base"
              disabled={outOfStock}
              onClick={() => navigateTo(`#/commander/${product.slug}`)}
            >
              <ShoppingCart className="size-5" aria-hidden="true" />
              {outOfStock ? "Produit épuisé" : "Acheter maintenant"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
