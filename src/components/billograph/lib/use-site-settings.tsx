"use client";

// Synchronisation automatique des réglages publics du site.
// - Charge GET /api/settings au montage ;
// - rafraîchit toutes les 30 s (polling) et au retour sur l'onglet ;
// - expose refresh() pour une propagation IMMÉDIATE après un enregistrement
//   administrateur (Réglages → contenu du site).
// Les composants (landing, header, footer, bandeau d'annonce) consomment le
// contexte : tout changement de réglage apparaît sans rechargement.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { apiFetch } from "./api-client";
import { DEFAULT_TESTIMONIALS, type Testimonial } from "@/lib/testimonials";

export type SiteSettings = {
  commissionPercent: number;
  siteName: string;
  heroTitle: string;
  heroHighlight: string | null;
  heroSubtitle: string;
  announcementEnabled: boolean;
  announcementText: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  whatsappNumber: string | null;
  facebookUrl: string | null;
  authorName: string;
  authorTitle: string;
  authorBio: string;
  footerDescription: string;
  testimonialsTitle: string;
  testimonialsSubtitle: string;
  testimonials: Testimonial[];
};

// Valeurs par défaut = identité BILLOGRAPH (utilisées avant le premier
// chargement et en cas d'indisponibilité de l'API).
export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  commissionPercent: 8,
  siteName: "BILLOGRAPH",
  heroTitle: "Vendez vos produits numériques en toute simplicité",
  heroHighlight: "en toute simplicité",
  heroSubtitle:
    "BILLOGRAPH crée votre boutique en ligne en deux minutes. Livrez automatiquement vos fichiers numériques, gérez votre stock physique et encaissez en FCFA — pensé pour le Bénin et l'Afrique francophone.",
  announcementEnabled: false,
  announcementText: null,
  contactEmail: null,
  contactPhone: null,
  whatsappNumber: null,
  facebookUrl: null,
  authorName: "HOUEDJISSI Judes B.",
  authorTitle: "Auteur & fondateur de BILLOGRAPH",
  authorBio:
    "Passionné de technologie et convaincu du talent des créateurs africains, il a conçu BILLOGRAPH pour offrir au Bénin et à toute l'Afrique francophone une plateforme simple, sûre et 100 % FCFA pour vendre en ligne.\n\nDe l'ouverture de la boutique à la livraison automatique des fichiers, chaque détail a été pensé pour que vous vendiez sans stress — même depuis un simple téléphone.",
  footerDescription:
    "La plateforme e-commerce des entrepreneurs du Bénin et d'Afrique francophone. Vendez vos produits numériques et physiques, encaissez en FCFA.",
  testimonialsTitle: "Ils vendent déjà sur BILLOGRAPH",
  testimonialsSubtitle:
    "Auteurs, formateurs et créateurs d'Afrique francophone racontent leur expérience.",
  testimonials: DEFAULT_TESTIMONIALS,
};

type SiteSettingsContextValue = {
  settings: SiteSettings;
  refresh: () => Promise<void>;
};

const SiteSettingsContext = createContext<SiteSettingsContextValue>({
  settings: DEFAULT_SITE_SETTINGS,
  refresh: async () => {},
});

const POLL_INTERVAL_MS = 30_000;

export function SiteSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SiteSettings>(DEFAULT_SITE_SETTINGS);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const data = await apiFetch<{ settings: SiteSettings }>("/api/settings");
      if (data?.settings) setSettings({ ...DEFAULT_SITE_SETTINGS, ...data.settings });
    } catch {
      // Erreur réseau → conserver les derniers réglages connus.
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  const value = useMemo(() => ({ settings, refresh }), [settings, refresh]);
  return <SiteSettingsContext.Provider value={value}>{children}</SiteSettingsContext.Provider>;
}

export function useSiteSettings() {
  return useContext(SiteSettingsContext);
}
