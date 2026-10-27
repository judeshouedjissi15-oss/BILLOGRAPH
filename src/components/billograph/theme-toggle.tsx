"use client";

// Bascule mode clair / mode sombre (next-themes, attribute="class").
// Avant hydratation : placeholder neutre (aucune icône → pas de mismatch SSR).
// Le garde « hydraté » passe par useSyncExternalStore (snapshot serveur = false,
// snapshot client = true) : équivalent au classique useState+useEffect mais
// conforme à la règle lint react-hooks/set-state-in-effect.

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

// Store factice : l'état « hydraté » ne change jamais après le premier rendu client.
const noopSubscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

function useHydrated(): boolean {
  return useSyncExternalStore(noopSubscribe, getClientSnapshot, getServerSnapshot);
}

export function ThemeToggle() {
  const hydrated = useHydrated();
  const { resolvedTheme, setTheme } = useTheme();

  // Avant hydratation : placeholder neutre de 44px (cible tactile) sans icône.
  if (!hydrated) {
    return <span aria-hidden="true" className="inline-block size-11" />;
  }

  const isDark = resolvedTheme === "dark";
  const ariaLabel = isDark ? "Passer en mode clair" : "Passer en mode sombre";

  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-11"
      aria-label={ariaLabel}
      aria-pressed={isDark}
      title={ariaLabel}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {isDark ? (
        <Sun className="size-5" aria-hidden="true" />
      ) : (
        <Moon className="size-5" aria-hidden="true" />
      )}
    </Button>
  );
}

// Ligne « Apparence » pour le panneau de menu mobile (le panneau reste ouvert après bascule).
export function ThemeMobileLine({ className }: { className?: string }) {
  const hydrated = useHydrated();
  const { resolvedTheme, setTheme } = useTheme();

  // Le panneau mobile ne s'ouvre qu'après interaction (donc après hydratation) ;
  // garde-fou si jamais il était rendu avant.
  if (!hydrated) return null;

  const isDark = resolvedTheme === "dark";
  const label = isDark ? "Mode clair" : "Mode sombre";

  return (
    <button
      type="button"
      className={className}
      aria-label={`Apparence : ${label.toLowerCase()}`}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {isDark ? (
        <Sun className="size-4" aria-hidden="true" />
      ) : (
        <Moon className="size-4" aria-hidden="true" />
      )}
      {label}
    </button>
  );
}
