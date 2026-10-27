"use client";

// Routeur SPA par hash — l'utilisateur ne voit que la route `/`.
// Le hash courant est parsé en { name, param } typé.

import { useEffect, useState } from "react";

export type HashRouteName =
  | "home"
  | "auth"
  | "dashboard"
  | "boutique"
  | "produit"
  | "commande"
  | "purchases"
  | "admin"
  | "professionnel"
  | "profil"
  | "membre"
  | "checkout"
  | "product-new"
  | "product-edit"
  | "vendor-order"
  | "legal"
  | "verify-email"
  | "rechmial"
  | "not-found";

export type HashRoute = { name: HashRouteName; param: string | null };

export function parseHash(rawHash: string): HashRoute {
  const clean = rawHash
    .replace(/^#/, "")
    .replace(/^\/+/, "")
    .split(/[?#]/)[0]
    .replace(/\/+$/, "");

  if (clean === "") return { name: "home", param: null };

  const segments = clean.split("/").filter(Boolean);
  const head = segments[0];
  const param = segments.slice(1).join("/") || null;

  switch (head) {
    case "auth":
      return { name: "auth", param: null };
    case "dashboard": {
      // Sous-pages du tableau de bord (vraies pages, pas de dialogues) :
      // #/dashboard/produits · #/dashboard/commandes · #/dashboard/produit/nouveau
      // #/dashboard/produit/{id} · #/dashboard/commande/{reference}
      if (param === "produits" || param === "commandes") {
        return { name: "dashboard", param };
      }
      if (param === "produit/nouveau") return { name: "product-new", param: null };
      if (param?.startsWith("produit/")) {
        const productId = param.slice("produit/".length);
        return productId ? { name: "product-edit", param: productId } : { name: "not-found", param: null };
      }
      if (param?.startsWith("commande/")) {
        const reference = param.slice("commande/".length);
        return reference ? { name: "vendor-order", param: reference } : { name: "not-found", param: null };
      }
      return { name: "dashboard", param: null };
    }
    case "commander":
      return param ? { name: "checkout", param } : { name: "not-found", param: null };
    case "boutique":
      return param ? { name: "boutique", param } : { name: "not-found", param: null };
    case "produit":
      return param ? { name: "produit", param } : { name: "not-found", param: null };
    case "commande":
      return param ? { name: "commande", param } : { name: "not-found", param: null };
    case "mes-achats":
      return { name: "purchases", param: null };
    case "admin":
      return { name: "admin", param: null };
    case "professionnel":
      // Espace professionnel de l'officier (module « Magnifier son appel »).
      return { name: "professionnel", param: param || null };
    case "profil":
      // MON PROFIL — photo de profil et informations du compte (tous rôles).
      return { name: "profil", param: null };
    case "membre":
      // PROFIL PUBLIC d'un membre — personnalisation libre + boutiques réelles.
      return param ? { name: "membre", param } : { name: "not-found", param: null };
    case "cgu":
    case "confidentialite":
    case "remboursement":
      return { name: "legal", param: head };
    case "verifier-email":
      // Lien reçu par email : #/verifier-email/{jeton}
      return param ? { name: "verify-email", param } : { name: "not-found", param: null };
    case "rechmial":
      // Rechmial IA — assistante d'analyse (utilisateurs connectés).
      return { name: "rechmial", param: null };
    default:
      return { name: "not-found", param: null };
  }
}

/** Change le hash (et notifie même si identique, pour re-déclencher les effets). */
export function navigateTo(hash: string) {
  if (typeof window === "undefined") return;
  if (window.location.hash === hash) {
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else {
    window.location.hash = hash;
  }
}

/** Défile doucement vers un élément par id (ex : "features"). */
export function scrollToId(id: string) {
  if (typeof document === "undefined") return;
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** Navigation "Fonctionnalités" : retourne à l'accueil si besoin puis scrolle vers #features. */
export function goToFeatures() {
  const onHome =
    typeof window === "undefined" ? true : parseHash(window.location.hash).name === "home";
  if (onHome) {
    scrollToId("features");
  } else {
    navigateTo("#/");
    window.setTimeout(() => scrollToId("features"), 350);
  }
}

/** Navigation "Avis de la communauté" : retourne à l'accueil si besoin puis scrolle vers #avis. */
export function goToReviews() {
  const onHome =
    typeof window === "undefined" ? true : parseHash(window.location.hash).name === "home";
  if (onHome) {
    scrollToId("avis");
  } else {
    navigateTo("#/");
    window.setTimeout(() => scrollToId("avis"), 350);
  }
}

export function useHashRoute(): HashRoute {
  const [route, setRoute] = useState<HashRoute>({ name: "home", param: null });

  useEffect(() => {
    const update = () => setRoute(parseHash(window.location.hash));
    update();
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);

  return route;
}
