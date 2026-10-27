// BILLOGRAPH — Catalogue multi-devises (partagé client & serveur, sans secret).
//
// PRINCIPE : tous les montants sont STOCKÉS en FCFA (XOF, entiers). La devise
// d'affichage est un paramètre plateforme (PlatformSettings.displayCurrency) ;
// la conversion se fait au taux édité par l'administrateur :
//   taux = combien de FCFA vaut 1 unité de la devise (ex: EUR 655,957).
//
// HONNÊTETÉ : le taux EUR est ancré (arrimage officiel FCFA/EUR) ; les autres
// taux par défaut sont indicatifs et DOIVENT être revus par l'admin. Les prix
// encaissés réellement dépendent du prestataire (FedaPay/Wave en XOF, Stripe
// dans sa devise configurée) — la conversion d'affichage est transparente et
// assumée comme telle.

export type CurrencyInfo = {
  code: string; // code ISO 4217
  label: string; // libellé français
  decimals: number; // décimales d'affichage (0 pour le FCFA)
};

// Devises proposées — couverture Afrique de l'Ouest + internationales majeures.
export const CURRENCIES: CurrencyInfo[] = [
  { code: "XOF", label: "FCFA (XOF) — Afrique de l'Ouest", decimals: 0 },
  { code: "XAF", label: "FCFA (XAF) — Afrique centrale", decimals: 0 },
  { code: "EUR", label: "Euro (EUR)", decimals: 2 },
  { code: "USD", label: "Dollar américain (USD)", decimals: 2 },
  { code: "GBP", label: "Livre sterling (GBP)", decimals: 2 },
  { code: "CAD", label: "Dollar canadien (CAD)", decimals: 2 },
  { code: "CHF", label: "Franc suisse (CHF)", decimals: 2 },
  { code: "MAD", label: "Dirham marocain (MAD)", decimals: 2 },
  { code: "NGN", label: "Naira nigérian (NGN)", decimals: 0 },
  { code: "GHS", label: "Cedi ghanéen (GHS)", decimals: 2 },
];

export const CURRENCY_CODES = CURRENCIES.map((c) => c.code) as [string, ...string[]];

export function isSupportedCurrency(code: string): boolean {
  return CURRENCIES.some((c) => c.code === code);
}

export function currencyInfo(code: string): CurrencyInfo {
  return CURRENCIES.find((c) => c.code === code) ?? CURRENCIES[0];
}

// Taux par défaut : FCFA pour 1 unité de devise.
// EUR = arrimage officiel 655,957. Les autres sont indicatifs (à éditer par
// l'admin dans Paramètres → Devises) — jamais présentés comme un taux de marché.
export const DEFAULT_CURRENCY_RATES: Record<string, number> = {
  XOF: 1,
  XAF: 1,
  EUR: 655.957,
  USD: 610,
  GBP: 775,
  CAD: 448,
  CHF: 690,
  MAD: 61,
  NGN: 0.38,
  GHS: 40,
};

// Map brute stockée en base (JSON édité par l'admin) → map complète et sûre :
// valeurs invalides ou absentes → taux par défaut. Ne plante jamais.
export function resolveCurrencyRates(raw: Record<string, unknown> | null | undefined): Record<string, number> {
  const rates: Record<string, number> = { ...DEFAULT_CURRENCY_RATES };
  if (!raw || typeof raw !== "object") return rates;
  for (const [code, value] of Object.entries(raw)) {
    if (!isSupportedCurrency(code)) continue;
    const num = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(num) && num > 0 && num <= 10_000_000) {
      rates[code] = num;
    }
  }
  return rates;
}

// Convertit un montant XOF vers la devise cible, arrondi selon ses décimales.
export function convertFromXOF(amountXOF: number, currency: string, rates: Record<string, number>): number {
  if (currency === "XOF") return amountXOF;
  const rate = rates[currency] ?? DEFAULT_CURRENCY_RATES[currency] ?? 1;
  if (!Number.isFinite(rate) || rate <= 0) return amountXOF;
  const info = currencyInfo(currency);
  const converted = amountXOF / rate;
  const factor = 10 ** info.decimals;
  return Math.round(converted * factor) / factor;
}
