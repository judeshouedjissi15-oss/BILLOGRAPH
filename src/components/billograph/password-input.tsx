"use client";

// Champ de saisie de secret (mot de passe, clé API, code secret) avec bouton
// œil : un clic affiche la valeur saisie, un second la masque.
// Accessible : aria-label dynamique + aria-pressed ; le bouton ne soumet jamais
// le formulaire (type="button").

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type PasswordInputProps = Omit<React.ComponentProps<"input">, "type"> & {
  /** Nom du champ pour l'accessibilité (ex : « mot de passe », « clé API »). */
  fieldName?: string;
};

export function PasswordInput({
  className,
  fieldName = "mot de passe",
  ...props
}: PasswordInputProps) {
  const [visible, setVisible] = React.useState(false);

  return (
    <div className="relative">
      <Input
        type={visible ? "text" : "password"}
        className={cn("pr-11", className)}
        {...props}
      />
      <button
        type="button"
        className="absolute inset-y-0 right-0 flex h-full w-11 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none"
        aria-label={visible ? `Masquer le ${fieldName}` : `Afficher le ${fieldName}`}
        aria-pressed={visible}
        onClick={() => setVisible((v) => !v)}
        tabIndex={0}
      >
        {visible ? (
          <EyeOff className="size-4" aria-hidden="true" />
        ) : (
          <Eye className="size-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
