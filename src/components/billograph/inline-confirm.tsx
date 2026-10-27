"use client";

// Confirmation de destruction EN PAGE (aucun dialogue modal) :
// premier clic → arme la confirmation ; deuxième clic → exécute l'action
// (attend sa fin) puis désarme ; « Annuler » désarme sans rien faire.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type InlineConfirmProps = {
  /** Contenu du bouton déclencheur (texte et/ou icône). */
  trigger: React.ReactNode;
  /** Classes du bouton déclencheur. */
  triggerClassName?: string;
  /** Variant du bouton déclencheur. */
  triggerVariant?: "outline" | "ghost" | "default";
  /** Appelée lorsque l'utilisateur confirme — la promesse est attendue avant de désarmer. */
  onConfirm: () => void | Promise<void>;
  /** Libellé du bouton de confirmation (défaut : « Confirmer »). */
  confirmLabel?: string;
  /** Libellé pendant l'action (défaut : « Traitement… »). */
  pendingLabel?: string;
  /** Texte d'avertissement affiché à côté de la confirmation. */
  warnText?: string;
  /** Désactive les boutons pendant l'action (état piloté par le parent). */
  busy?: boolean;
  /** Taille des boutons (défaut : « sm » pour les tableaux). */
  size?: "sm" | "default" | "lg";
  /** Aria-label du déclencheur (accessibilité icône seule). */
  triggerAriaLabel?: string;
};

export function InlineConfirm({
  trigger,
  triggerClassName,
  triggerVariant = "outline",
  onConfirm,
  confirmLabel = "Confirmer",
  pendingLabel = "Traitement…",
  warnText,
  busy = false,
  size = "sm",
  triggerAriaLabel,
}: InlineConfirmProps) {
  const [armed, setArmed] = useState(false);
  const [running, setRunning] = useState(false);
  const inFlight = busy || running;

  const handleConfirmClick = async () => {
    setRunning(true);
    try {
      await onConfirm();
    } finally {
      setRunning(false);
      setArmed(false);
    }
  };

  if (!armed) {
    return (
      <Button
        type="button"
        variant={triggerVariant}
        size={size}
        className={cn(size === "sm" ? "h-9" : "", triggerClassName)}
        aria-label={triggerAriaLabel}
        onClick={() => setArmed(true)}
      >
        {trigger}
      </Button>
    );
  }

  return (
    <span
      className="inline-flex flex-wrap items-center justify-end gap-1.5"
      role="group"
      aria-label="Confirmation requise"
    >
      {warnText && <span className="text-xs text-muted-foreground">{warnText}</span>}
      <Button
        type="button"
        variant="destructive"
        size={size}
        className={cn(size === "sm" ? "h-9" : "")}
        disabled={inFlight}
        onClick={() => void handleConfirmClick()}
      >
        {inFlight ? pendingLabel : confirmLabel}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size={size}
        className={cn(size === "sm" ? "h-9" : "")}
        disabled={inFlight}
        onClick={() => setArmed(false)}
      >
        Annuler
      </Button>
    </span>
  );
}
