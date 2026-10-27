// BILLOGRAPH — État de langue d'interface (pur, sans React) :
// même mécanique que la devise (module global + abonnements). Le français est
// la langue par défaut ; le choix est mémorisé dans localStorage (« blg:lang »).

import { LANGUAGES, languageInfo, type LanguageCode } from "@/lib/i18n";

const STORAGE_KEY = "blg:lang";
const DEFAULT_LANG: LanguageCode = "fr";

let state: { lang: LanguageCode; dir: "ltr" | "rtl" } = { lang: DEFAULT_LANG, dir: "ltr" };
let hydrated = false;
const listeners = new Set<() => void>();

function isSupported(code: string | null | undefined): code is LanguageCode {
  return typeof code === "string" && LANGUAGES.some((l) => l.code === code);
}

function notify(): void {
  for (const fn of listeners) fn();
}

/** Change la langue d'interface (sélecteur du header) — re-rend TOUT le site. */
export function changeLanguage(code: string): void {
  if (!isSupported(code) || code === state.lang) return;
  state = { lang: code, dir: languageInfo(code).dir === "rtl" ? "rtl" : "ltr" };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, code);
    } catch {
      /* pas bloquant */
    }
  }
  notify();
}

/** Rejoue le choix mémorisé — no-op côté serveur. */
export function hydrateLanguage(): void {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (isSupported(saved) && saved !== state.lang) {
      state = { lang: saved, dir: languageInfo(saved).dir === "rtl" ? "rtl" : "ltr" };
    }
  } catch {
    /* pas bloquant */
  }
}

export function getLanguage(): LanguageCode {
  return state.lang;
}

export function getLanguageDir(): "ltr" | "rtl" {
  return state.dir;
}

export function subscribeLanguage(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
