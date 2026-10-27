"use client";

// Vues de repli : connexion requise (redirection vers #/auth) et squelette de page.

import { useEffect } from "react";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { navigateTo } from "./lib/use-hash-route";

export function LoginRequired() {
  useEffect(() => {
    const timer = setTimeout(() => navigateTo("#/auth"), 1200);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
        <LogIn className="size-7" aria-hidden="true" />
      </span>
      <h1 className="mt-6 text-2xl font-bold tracking-tight">Connexion requise</h1>
      <p className="mt-2 text-muted-foreground">
        Cette espace est réservé aux comptes connectés. Redirection vers la page de connexion…
      </p>
      <Button className="mt-6 h-11" onClick={() => navigateTo("#/auth")}>
        Se connecter maintenant
      </Button>
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-10" aria-busy="true" aria-label="Chargement">
      <Skeleton className="h-10 w-72" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}
