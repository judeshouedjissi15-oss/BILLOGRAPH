"use client";

// Bouton à confirmation INTÉGRÉE DANS LA PAGE — aucune fenêtre modale.
// Premier clic : le bouton se transforme en groupe inline « Confirmer / Annuler »
// directement à l'endroit où l'utilisateur a cliqué. Le flux reste celui du
// site (aucun overlay, aucun dialogue).

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type InlineConfirmButtonProps = {
  /** Libellé accessible du bouton d'origine (ex : "Suspendre le compte d'Awa"). */
  label: string;
  /** Libellé du bouton de confirmation (ex : "Confirmer la suspension"). */
  confirmLabel?: string;
  /** Libellé affiché pendant le traitement. */
  busyLabel?: string;
  /** Action confirmée (peut être asynchrone). */
  onConfirm: () => Promise<void> | void;
  disabled?: boolean;
  /** Apparence du bouton d'origine. */
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
  /** Contenu du bouton d'origine (texte et/ou icône). */
  children: React.ReactNode;
};

export function InlineConfirmButton({
  label,
  confirmLabel = "Confirmer",
  busyLabel = "Traitement…",
  onConfirm,
  disabled = false,
  variant = "outline",
  size = "sm",
  className,
  children,
}: InlineConfirmButtonProps) {
  const [phase, setPhase] = useState<"idle" | "confirm" | "busy">("idle");

  if (phase === "idle") {
    return (
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        disabled={disabled}
        aria-label={label}
        onClick={() => setPhase("confirm")}
      >
        {children}
      </Button>
    );
  }

  const handleConfirm = async () => {
    setPhase("busy");
    try {
      await onConfirm();
    } finally {
      setPhase("idle");
    }
  };

  return (
    <span
      role="group"
      aria-label={`Confirmation : ${label}`}
      className="inline-flex flex-wrap items-center justify-end gap-1.5"
    >
      <Button
        type="button"
        variant="destructive"
        size="sm"
        className="h-9"
        disabled={phase === "busy"}
        onClick={() => void handleConfirm()}
      >
        {phase === "busy" ? (
          <>
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            {busyLabel}
          </>
        ) : (
          confirmLabel
        )}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-9 shrink-0"
        aria-label="Annuler"
        disabled={phase === "busy"}
        onClick={() => setPhase("idle")}
      >
        <X className="size-4" aria-hidden="true" />
      </Button>
    </span>
  );
}
