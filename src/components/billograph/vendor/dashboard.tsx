"use client";

// TABLEAU DE BORD VENDEUR (#/dashboard) — vue protégée.
// Charge la boutique : si aucune → onboarding, sinon onglets
// (Vue d'ensemble, Produits, Commandes, Ma boutique).

import { useCallback, useEffect, useState } from "react";
import { Store as StoreIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { apiFetch } from "../lib/api-client";
import { navigateTo } from "../lib/use-hash-route";
import { StoreCreateForm } from "./store-create-form";
import { OverviewTab } from "./overview-tab";
import { ProductsTab } from "./products-tab";
import { OrdersTab } from "./orders-tab";
import { WalletTab } from "./wallet-tab";
import { StoreSettingsTab } from "./store-settings-tab";
import type { Store, User } from "@/types/api";

type StoreState =
  | { status: "loading" }
  | { status: "none" }
  | { status: "ready"; store: Store }
  | { status: "error"; message: string };

type VendorDashboardProps = {
  user: User;
  refreshUser: () => Promise<void>;
  initialTab?: "overview" | "products" | "orders" | "settings";
};

export function VendorDashboard({ user, refreshUser, initialTab = "overview" }: VendorDashboardProps) {
  const [storeState, setStoreState] = useState<StoreState>({ status: "loading" });
  const [tab, setTab] = useState<string>(initialTab);

  // Chargement initial : setState uniquement dans des callbacks async (jamais
  // de façon synchrone dans le corps de l'effet), avec garde d'annulation.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiFetch<{ store: Store | null }>("/api/stores/mine");
        if (!cancelled) {
          setStoreState(data.store ? { status: "ready", store: data.store } : { status: "none" });
        }
      } catch (error) {
        if (cancelled) return;
        const status = (error as { status?: number }).status;
        if (status === 401) {
          navigateTo("#/auth");
          return;
        }
        setStoreState({
          status: "error",
          message: error instanceof Error ? error.message : "Erreur de chargement.",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchStore = useCallback(async () => {
    try {
      const data = await apiFetch<{ store: Store | null }>("/api/stores/mine");
      setStoreState(data.store ? { status: "ready", store: data.store } : { status: "none" });
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status === 401) {
        navigateTo("#/auth");
        return;
      }
      setStoreState({
        status: "error",
        message: error instanceof Error ? error.message : "Erreur de chargement.",
      });
    }
  }, []);

  const retryLoad = () => {
    setStoreState({ status: "loading" });
    void fetchStore();
  };

  const handleStoreCreated = async (store: Store) => {
    setStoreState({ status: "ready", store });
    await refreshUser(); // le compte vient d'être promu VENDEUR côté serveur
  };

  if (storeState.status === "loading") {
    return (
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8" aria-busy="true">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }

  if (storeState.status === "none") {
    return <StoreCreateForm onCreated={(store) => void handleStoreCreated(store)} />;
  }

  if (storeState.status === "error") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <Card>
          <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
            <p className="text-sm text-destructive">{storeState.message}</p>
            <Button variant="outline" onClick={retryLoad}>
              Réessayer
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const store = storeState.store;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <StoreIcon className="size-6 text-primary" aria-hidden="true" />
            Tableau de bord
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Bonjour {user.name.split(" ")[0]} — boutique « {store.name} » (#{store.slug})
          </p>
        </div>
        <Button variant="outline" className="h-11" onClick={() => navigateTo(`#/boutique/${store.slug}`)}>
          Voir ma boutique
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="mt-6">
        <TabsList className="h-11 w-full justify-start overflow-x-auto sm:w-auto">
          <TabsTrigger value="overview" className="px-4">
            Vue d&apos;ensemble
          </TabsTrigger>
          <TabsTrigger value="products" className="px-4">
            Produits
          </TabsTrigger>
          <TabsTrigger value="orders" className="px-4">
            Commandes
          </TabsTrigger>
          <TabsTrigger value="wallet" className="px-4">
            Portefeuille
          </TabsTrigger>
          <TabsTrigger value="settings" className="px-4">
            Ma boutique
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <OverviewTab storeSlug={store.slug} onOpenOrders={() => setTab("orders")} />
        </TabsContent>
        <TabsContent value="products" className="mt-6">
          <ProductsTab storeSlug={store.slug} />
        </TabsContent>
        <TabsContent value="orders" className="mt-6">
          <OrdersTab storeSlug={store.slug} />
        </TabsContent>
        <TabsContent value="wallet" className="mt-6">
          <WalletTab />
        </TabsContent>
        <TabsContent value="settings" className="mt-6">
          <StoreSettingsTab
            store={store}
            onSaved={(updated) => setStoreState({ status: "ready", store: updated })}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
