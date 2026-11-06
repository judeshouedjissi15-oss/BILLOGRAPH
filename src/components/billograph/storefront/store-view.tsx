"use client";

// BOUTIQUE PUBLIQUE (#/boutique/{slug}) : bandeau à la couleur du vendeur,
// grille des produits publiés. GET /api/stores/{slug}

import { useEffect, useState } from "react";
import { ArrowRight, Copy, MessageCircle, Package, Phone, Store as StoreIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "../lib/api-client";
import { navigateTo } from "../lib/use-hash-route";
import { formatXOF } from "@/lib/format";
import { getActiveProductPrice } from "@/lib/product-pricing";
import type { PublicProduct, Store } from "@/types/api";
import { useToast } from "@/hooks/use-toast";
import { copyShareUrl, hashRouteUrl, openWhatsAppShare } from "../lib/sales-sharing";

type StoreState =
  | { status: "loading" }
  | { status: "ready"; store: Store; products: PublicProduct[] }
  | { status: "not-found" }
  | { status: "error"; message: string };

function ProductCard({ product, color }: { product: PublicProduct; color: string }) {
  const activePrice = getActiveProductPrice(product);
  return (
    <Card className="group overflow-hidden rounded-2xl py-0 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
      <div className="relative overflow-hidden">
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={`Image du produit ${product.title}`}
            className="aspect-[4/3] w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <div
            className="flex aspect-[4/3] w-full items-center justify-center"
            style={{
              background: `linear-gradient(135deg, ${color}22 0%, ${color}44 55%, ${color}66 100%)`,
            }}
          >
            <Package className="size-10" style={{ color }} aria-hidden="true" />
          </div>
        )}
        <Badge className="absolute left-3 top-3 shadow-sm" variant="secondary">
          {product.type === "DIGITAL" ? "Numérique" : "Physique"}
        </Badge>
      </div>
      <CardContent className="p-4">
        <h3 className="line-clamp-2 min-h-12 text-base font-semibold leading-snug">{product.title}</h3>
        {product.description ? (
          <p className="mt-2 line-clamp-2 min-h-10 text-sm leading-5 text-muted-foreground">
            {product.description}
          </p>
        ) : null}
        <div className="mt-4 flex items-center justify-between gap-3 border-t pt-4">
          <div>
            <p className="font-bold tracking-tight text-primary">
              {activePrice === 0 ? "Gratuit" : formatXOF(activePrice)}
            </p>
            {activePrice !== product.priceXOF && (
              <p className="text-xs text-muted-foreground line-through">{formatXOF(product.priceXOF)}</p>
            )}
          </div>
          <Button size="sm" className="h-10 rounded-lg" onClick={() => navigateTo(`#/produit/${product.slug}`)}>
            Découvrir
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function StoreView({ slug }: { slug: string }) {
  const { toast } = useToast();
  const [state, setState] = useState<StoreState>({ status: "loading" });

  const shareCatalogOnWhatsApp = (storeName: string, storeSlug: string) => {
    const url = hashRouteUrl(`/boutique/${encodeURIComponent(storeSlug)}`);
    openWhatsAppShare(`Découvrez la boutique « ${storeName} » et son catalogue : ${url}`);
  };

  const copyCatalogLink = async (storeSlug: string) => {
    try {
      await copyShareUrl(hashRouteUrl(`/boutique/${encodeURIComponent(storeSlug)}`));
      toast({ title: "Lien du catalogue copié" });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Copie impossible",
        description: error instanceof Error ? error.message : "Réessayez dans un instant.",
      });
    }
  };

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
  const faqs = store.faqs ?? [];
  const trustDetails = [
    store.deliveryInfo ? { title: "Livraison et accès", text: store.deliveryInfo } : null,
    store.returnPolicy ? { title: "Retours et remboursements", text: store.returnPolicy } : null,
  ].filter((detail): detail is { title: string; text: string } => detail !== null);

  return (
    <div>
      {/* Identité de la boutique */}
      <header className="relative" style={{ backgroundColor: store.color }}>
        <div className="absolute inset-0 bg-gradient-to-r from-black/50 via-black/25 to-transparent" aria-hidden="true" />
        <div className="relative mx-auto flex min-h-52 max-w-6xl flex-col justify-end px-4 py-9 sm:min-h-64 sm:py-12">
          <Badge className="mb-3 w-fit border-white/30 bg-white/15 text-white backdrop-blur">
            Boutique indépendante
          </Badge>
          <h1 className="text-3xl font-bold tracking-tight text-white drop-shadow sm:text-5xl">{store.name}</h1>
          {store.description ? (
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/90 sm:text-base">
              {store.description}
            </p>
          ) : null}
          {store.phone ? (
            <a
              href={`tel:${store.phone.replace(/[^\d+]/g, "")}`}
              className="mt-4 inline-flex w-fit items-center gap-2 rounded-full bg-white/15 px-3 py-2 text-xs font-medium text-white backdrop-blur transition-colors hover:bg-white/25"
            >
              <Phone className="size-3.5" aria-hidden="true" />
              Contacter la boutique · {store.phone}
            </a>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => shareCatalogOnWhatsApp(store.name, store.slug)}
            >
              <MessageCircle className="size-4" aria-hidden="true" />
              Partager sur WhatsApp
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-white/50 bg-transparent text-white hover:bg-white/15 hover:text-white"
              onClick={() => void copyCatalogLink(store.slug)}
            >
              <Copy className="size-4" aria-hidden="true" />
              Copier le lien du catalogue
            </Button>
          </div>
        </div>
      </header>

      {(store.trustMessage || trustDetails.length > 0 || faqs.length > 0) && (
        <section className="mx-auto max-w-6xl px-4 pt-8" aria-label="Informations et garanties">
          {store.trustMessage && (
            <p className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm font-medium leading-6 text-foreground">
              {store.trustMessage}
            </p>
          )}
          {trustDetails.length > 0 && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {trustDetails.map((detail) => (
                <Card key={detail.title} className="rounded-2xl">
                  <CardContent className="p-5">
                    <h2 className="font-semibold">{detail.title}</h2>
                    <p className="mt-2 whitespace-pre-line text-sm leading-6 text-muted-foreground">{detail.text}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          {faqs.length > 0 && (
            <div className="mt-7">
              <h2 className="text-xl font-bold tracking-tight">Questions fréquentes</h2>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {faqs.map((faq, index) => (
                  <Card key={`${faq.question}-${index}`} className="rounded-2xl">
                    <CardContent className="p-5">
                      <h3 className="font-semibold">{faq.question}</h3>
                      <p className="mt-2 whitespace-pre-line text-sm leading-6 text-muted-foreground">{faq.answer}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Produits */}
      <section className="mx-auto max-w-6xl px-4 py-10 sm:py-14" aria-label="Produits de la boutique">
        {products.length > 0 && (
          <div className="mb-7">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Sélection de la boutique</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Découvrez les produits</h2>
          </div>
        )}
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
