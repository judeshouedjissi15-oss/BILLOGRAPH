"use client";

// DONNÉES DU SITE AUTO-SYNCHRONISÉES — TanStack Query.
// - useSiteSettings()  : contenu modifiable (Paramètres admin) — revalidé
//   toutes les 15 s, au focus de la fenêtre et immédiatement après chaque
//   enregistrement admin (invalidation) → TOUT le site se met à jour sans
//   rechargement.
// - usePublicReviews() : avis approuvés de la page d'accueil — revalidé toutes
//   les 30 s, au focus, et après chaque modération admin (invalidation).
// Pendant le premier chargement, les valeurs par défaut (SITE_FALLBACK)
// garantissent un rendu instantané sans décalage de mise en page.

import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api-client";
import { SITE_FALLBACK, type SiteSettings } from "@/lib/site-content";
import type { ReviewItem } from "@/types/api";

const SETTINGS_KEY = ["site-settings"] as const;
const REVIEWS_KEY = ["public-reviews"] as const;

// Client de requête unique de l'application (SPA par hash — une seule instance).
export const siteQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});

export function SiteDataProvider({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={siteQueryClient}>{children}</QueryClientProvider>;
}

/** Invalide les réglages → tous les composants abonnés se re-rendent immédiatement. */
export function invalidateSiteSettings(): void {
  void siteQueryClient.invalidateQueries({ queryKey: SETTINGS_KEY });
}

/** Invalide les avis publics (après modération admin par exemple). */
export function invalidatePublicReviews(): void {
  void siteQueryClient.invalidateQueries({ queryKey: REVIEWS_KEY });
}

export function useSiteSettings() {
  const query = useQuery<SiteSettings>({
    queryKey: SETTINGS_KEY,
    queryFn: () => apiFetch<SiteSettings>("/api/settings"),
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
    placeholderData: SITE_FALLBACK,
  });

  return {
    settings: query.data ?? SITE_FALLBACK,
    isSyncing: query.isFetching,
    error: query.error as Error | null,
  };
}

export function usePublicReviews() {
  const query = useQuery<ReviewItem[]>({
    queryKey: REVIEWS_KEY,
    queryFn: async () => {
      const data = await apiFetch<{ reviews: ReviewItem[] }>("/api/reviews");
      return data.reviews;
    },
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 20_000,
    placeholderData: [],
  });

  return {
    reviews: query.data ?? [],
    isSyncing: query.isFetching,
    error: query.error as Error | null,
  };
}
