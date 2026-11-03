"use client";

// PAGE DE VENTE PRODUIT (#/produit/{slug}) — fiche produit, réassurance et accès direct au checkout.

import { useEffect, useState } from "react";
import {
  ArrowRight,
  Banknote,
  Download,
  Package,
  ShieldCheck,
  ShoppingBag,
  Store as StoreIcon,
  Truck,
} from "lucide-react";
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
  return CATEGORIES.find((category) => category.id === categoryId)?.label ?? categoryId;
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
          try {
            window.sessionStorage.setItem("blg:last-product", `#/produit/${slug}`);
          } catch {
            // Le parcours d'achat reste disponible si le stockage du navigateur est désactivé.
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
        <Skeleton className="aspect-[4/3] w-full rounded-3xl" />
        <div className="space-y-4">
          <Skeleton className="h-6 w-40" />
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
  const isDigital = product.type === "DIGITAL";
  const outOfStock = !isDigital && product.stock !== null && product.stock <= 0;
  const highlights = isDigital
    ? [
        { icon: Download, text: product.hasFile ? "Téléchargement sécurisé après paiement" : "Accès numérique après achat" },
        { icon: ShieldCheck, text: "Paiement traité en toute sécurité" },
        { icon: Banknote, text: "Prix affiché en FCFA, sans surprise" },
      ]
    : [
        { icon: Package, text: "Stock actualisé par le vendeur" },
        { icon: Truck, text: "Modalités de livraison communiquées par le vendeur" },
        { icon: Banknote, text: "Prix affiché en FCFA, sans surprise" },
      ];

  return (
    <div className="bg-gradient-to-b from-muted/50 via-background to-background">
      <div className="mx-auto max-w-6xl px-4 pb-14 pt-6 sm:pb-20 sm:pt-8">
        <nav aria-label="Fil d'Ariane" className="mb-6 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <button type="button" className="transition-colors hover:text-primary" onClick={() => navigateTo("#/")}>
            Accueil
          </button>
          <span aria-hidden="true">/</span>
          <button
            type="button"
            className="max-w-40 truncate transition-colors hover:text-primary"
            onClick={() => navigateTo(`#/boutique/${store.slug}`)}
          >
            {store.name}
          </button>
          <span aria-hidden="true">/</span>
          <span className="max-w-48 truncate font-medium text-foreground">{product.title}</span>
        </nav>

        <div className="grid min-w-0 items-start gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12">
          <div className="min-w-0 space-y-6">
            <div className="group relative overflow-hidden rounded-3xl border bg-card shadow-sm">
              {product.imageUrl ? (
                <img
                  src={product.imageUrl}
                  alt={`Visuel de ${product.title}`}
                  className="aspect-[4/3] w-full object-cover"
                />
              ) : (
                <div
                  className="flex aspect-[4/3] w-full items-center justify-center"
                  style={{
                    background: `radial-gradient(circle at 75% 20%, ${store.color}66, transparent 40%), linear-gradient(135deg, ${store.color}14, ${store.color}44)`,
                  }}
                >
                  <Package className="size-20" style={{ color: store.color }} aria-hidden="true" />
                </div>
              )}
              <Badge className="absolute left-4 top-4 border border-white/30 bg-background/90 px-3 py-1 text-foreground shadow-sm backdrop-blur">
                {isDigital ? "Produit numérique" : "Produit physique"}
              </Badge>
            </div>

            <Card className="overflow-hidden rounded-2xl border-0 shadow-sm">
              <CardContent className="p-6 sm:p-8">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                  À propos de ce produit
                </p>
                <h2 className="mt-2 text-xl font-bold tracking-tight">Tout ce qu&apos;il faut savoir</h2>
                {product.description ? (
                  <p className="mt-4 whitespace-pre-line text-sm leading-7 text-muted-foreground sm:text-base">
                    {product.description}
                  </p>
                ) : (
                  <p className="mt-4 text-sm leading-7 text-muted-foreground">
                    Retrouvez les informations essentielles de ce produit et contactez la boutique pour toute question.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-2xl shadow-sm">
              <CardContent className="flex items-center gap-4 p-5">
                <span
                  className="flex size-12 shrink-0 items-center justify-center rounded-xl"
                  style={{ backgroundColor: `${store.color}1a`, color: store.color }}
                >
                  <StoreIcon className="size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">Vendu par</p>
                  <button
                    type="button"
                    className="mt-0.5 max-w-full truncate text-left font-semibold transition-colors hover:text-primary"
                    onClick={() => navigateTo(`#/boutique/${store.slug}`)}
                  >
                    {store.name}
                  </button>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="min-w-0 lg:sticky lg:top-24">
            <div className="rounded-3xl border bg-card p-5 shadow-sm sm:p-8">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{categoryLabel(product.category)}</Badge>
                {isDigital && product.hasFile && product.fileSize ? (
                  <Badge variant="outline">{formatBytes(product.fileSize)}</Badge>
                ) : null}
                {!isDigital && product.stock !== null && (
                  <Badge variant={outOfStock ? "destructive" : "outline"}>
                    {outOfStock ? "Épuisé" : `${product.stock} en stock`}
                  </Badge>
                )}
              </div>

              <h1 className="mt-5 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
                {product.title}
              </h1>
              <button
                type="button"
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
                onClick={() => navigateTo(`#/boutique/${store.slug}`)}
              >
                <StoreIcon className="size-4" aria-hidden="true" />
                {store.name}
              </button>

              <div className="my-6 border-t" />
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Prix du produit</p>
                  <p className="mt-1 text-3xl font-extrabold tracking-tight text-primary sm:text-4xl">
                    {product.priceXOF === 0 ? "Gratuit" : formatXOF(product.priceXOF)}
                  </p>
                </div>
                {product.priceXOF > 0 && (
                  <span className="pb-1 text-xs text-muted-foreground">Paiement en FCFA</span>
                )}
              </div>

              <ul className="mt-6 space-y-3 rounded-2xl bg-muted/60 p-4">
                {highlights.map(({ icon: Icon, text }) => (
                  <li key={text} className="flex items-start gap-3 text-sm">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Icon className="size-3.5" aria-hidden="true" />
                    </span>
                    <span className="leading-5">{text}</span>
                  </li>
                ))}
                </ul>

              <Button
                size="lg"
                className="mt-6 h-14 w-full rounded-xl text-base font-semibold shadow-md"
                disabled={outOfStock}
                onClick={() => navigateTo(`#/commander/${product.slug}`)}
              >
                <ShoppingBag className="size-5" aria-hidden="true" />
                {outOfStock ? "Produit épuisé" : product.priceXOF === 0 ? "Obtenir gratuitement" : "Acheter maintenant"}
                {!outOfStock && <ArrowRight className="ml-auto size-5" aria-hidden="true" />}
              </Button>
              <p className="mt-3 text-center text-xs text-muted-foreground">
                Vous pourrez vérifier votre commande avant de confirmer.
              </p>
            </div>

            {store.phone ? (
              <a
                href={`tel:${store.phone.replace(/[^\d+]/g, "")}`}
                className="mt-4 flex items-center justify-center gap-2 rounded-2xl border bg-background px-4 py-3 text-sm font-medium transition-colors hover:bg-muted"
              >
                Une question ? Contacter la boutique
                <ArrowRight className="size-4" aria-hidden="true" />
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
