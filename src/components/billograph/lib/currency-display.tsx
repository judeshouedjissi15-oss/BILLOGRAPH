"use client";

// BILLOGRAPH — Devise d'affichage (côté client) : hook React + réexports.
// useSyncExternalStore : s'abonne proprement au store de devise sans setState
// dans les effets, avec snapshot serveur "XOF" (pas de décalage d'hydratation).
import { useSyncExternalStore } from "react";
import {
  getDisplayCurrency,
  subscribeDisplayCurrency,
} from "@/lib/currency-state";

export {
  setGlobalCurrencyConfig,
  changeDisplayCurrency,
  hydrateDisplayCurrency,
  getDisplayCurrency,
  getCurrencyRates,
  getEnabledCurrencies,
  subscribeDisplayCurrency,
} from "@/lib/currency-state";

/** Hook : re-rend le composant (et l'arbre abonné) à chaque changement de devise. */
export function useDisplayCurrency(): string {
  return useSyncExternalStore(
    (onStoreChange) => subscribeDisplayCurrency(onStoreChange),
    () => getDisplayCurrency(),
    () => "XOF",
  );
}
