// BILLOGRAPH — Affichage monétaire dynamique (client).
//
// Tous les montants sont stockés en FCFA (XOF). Cette couche convertit à
// l'affichage vers la devise choisie par l'administrateur
// (PlatformSettings.displayCurrency) au taux configuré, et est synchronisée
// automatiquement : src/components/billograph/lib/site-data.tsx appelle
// setMoneyConfig() à chaque revalidation des réglages publics (polling 15 s).
//
// Sans configuration (avant le premier chargement), tout s'affiche en FCFA :
// le rendu ne casse jamais et bascule proprement quand la devise arrive.
import { convertFromXOF, currencyInfo } from "./currencies";

let displayCurrency = "XOF";
let rates: Record<string, number> = {};
// Locale de formatage des nombres — synchronisée par le sélecteur de langue
// (src/lib/i18n/index.tsx). Défaut français : « 1 000,5 » ; anglais : « 1,000.5 ».
let numberLocale = "fr-FR";

/** Configure la locale de formatage des nombres (appelé par LanguageProvider). */
export function setMoneyLocale(locale: string): void {
  numberLocale = locale || "fr-FR";
}

/** Configure la devise d'affichage + les taux (appelé par useSiteSettings). */
export function setMoneyConfig(currency: string, currencyRates: Record<string, number>): void {
  displayCurrency = currency || "XOF";
  rates = currencyRates ?? {};
}

export function getDisplayCurrency(): string {
  return displayCurrency;
}

/**
 * Formate un montant stocké en XOF vers la devise d'affichage courante.
 * Ex : 5 000 XOF avec EUR (655,957) → « 7,62 € ».
 * Le FCFA (XOF/XAF) conserve le format historique « 1 000 FCFA » (pas de
 * décimales, suffixe usuel des marché ouest-africains).
 */
export function formatMoney(amountXOF: number): string {
  const currency = displayCurrency;
  const converted = convertFromXOF(amountXOF, currency, rates);
  const info = currencyInfo(currency);
  if (currency === "XOF" || currency === "XAF") {
    return `${new Intl.NumberFormat(numberLocale, { maximumFractionDigits: 0 }).format(converted)} FCFA`;
  }
  try {
    return new Intl.NumberFormat(numberLocale, {
      style: "currency",
      currency,
      minimumFractionDigits: info.decimals,
      maximumFractionDigits: info.decimals,
    }).format(converted);
  } catch {
    // Devis exotique non supporté par l'environnement → format manuel.
    return `${new Intl.NumberFormat(numberLocale).format(converted)} ${currency}`;
  }
}
