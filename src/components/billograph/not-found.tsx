"use client";

// Vue générique pour tout hash inconnu.

import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { navigateTo } from "./lib/use-hash-route";

export function NotFoundView() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-accent text-accent-foreground">
        <Compass className="size-7" aria-hidden="true" />
      </span>
      <h1 className="mt-6 text-3xl font-bold tracking-tight">Page introuvable</h1>
      <p className="mt-2 text-muted-foreground">
        La page que vous cherchez n&apos;existe pas ou a été déplacée.
      </p>
      <Button className="mt-6 h-11" onClick={() => navigateTo("#/")}>
        Retour à l&apos;accueil
      </Button>
    </div>
  );
}
