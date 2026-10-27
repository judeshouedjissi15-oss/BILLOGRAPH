// BILLOGRAPH — État de devise d'affichage (pur, sans React) :
// importable partout (client ET serveur) sans ramener les hooks React.
// Côté serveur, l'état reste XOF (jamais muté) → les emails restent en FCFA.

type CurrencyState = {
  display: string; // devise affichée ("XOF", "EUR", "USD"…)
  rates: Record<string, number>; // taux administrés : XOF pour 1 unité
  enabled: string[]; // devises proposées au visiteur
};

const STORAGE_KEY = "blg:currency";
let state: CurrencyState = { display: "XOF", rates: {}, enabled: ["XOF"] };
let hydrated = false;
const listeners = new Set<() => void>();

function notify(): void {
  for (const fn of listeners) fn();
}

/** Taux administrés mis à jour (source : /api/settings, auto-synchronisé). */
export function setGlobalCurrencyConfig(rates: Record<string, number>, enabled: string[]): void {
  state = {
    ...state,
    rates: { ...rates },
    enabled: Array.from(new Set(["XOF", ...enabled])),
  };
  // Si la devise choisie n'est plus proposée → retour au FCFA.
  if (!state.enabled.includes(state.display)) {
    state = { ...state, display: "XOF" };
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(STORAGE_KEY, "XOF");
      } catch {
        /* stockage indisponible : pas bloquant */
      }
    }
  }
  notify();
}

/** Change la devise d'affichage (sélecteur du header). */
export function changeDisplayCurrency(code: string): void {
  if (!state.enabled.includes(code)) return;
  state = { ...state, display: code };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, code);
    } catch {
      /* pas bloquant */
    }
  }
  notify();
}

/** Rejoue le choix mémorisé (une seule fois, au premier rendu client). */
export function hydrateDisplayCurrency(): void {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved && state.enabled.includes(saved) && saved !== state.display) {
      state = { ...state, display: saved };
    }
  } catch {
    /* pas bloquant */
  }
}

// Hydratation immédiate (client) : le choix mémorisé est disponible dès le
// premier rendu. No-op côté serveur (window indéfini).
hydrateDisplayCurrency();

export function getDisplayCurrency(): string {
  return state.display;
}

export function getCurrencyRates(): Record<string, number> {
  return state.rates;
}

export function getEnabledCurrencies(): string[] {
  return state.enabled;
}

export function subscribeDisplayCurrency(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
