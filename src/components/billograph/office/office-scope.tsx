"use client";

// PORTÉE D'OFFICE — quand le PROPRIÉTAIRE (ADMIN) opère dans l'espace
// professionnel, il choisit l'office dans lequel agir (capacités d'officier
// héritées). Ce contexte transmet l'office choisi à toutes les sections :
// chaque appel API reçoit ?officeRole=… et le serveur vérifie réellement les
// droits. Les officiers, eux, opèrent toujours dans LEUR propre office.
import { createContext, useContext } from "react";

export type OfficeScope = {
  /** Clé de l'office choisi (uniquement pour le propriétaire). */
  officeRole: string | null;
  /** true = le propriétaire agit dans un office choisi. */
  asOwner: boolean;
};

export const OfficeScopeContext = createContext<OfficeScope>({
  officeRole: null,
  asOwner: false,
});

export function useOfficeScope(): OfficeScope {
  return useContext(OfficeScopeContext);
}

/**
 * Suffixe d'URL à ajouter aux appels /api/office/* : `?officeRole=…` pour le
 * propriétaire, chaîne vide pour un officier dans son propre office.
 */
export function officeScopeSuffix(scope: OfficeScope): string {
  return scope.officeRole ? `?officeRole=${encodeURIComponent(scope.officeRole)}` : "";
}
