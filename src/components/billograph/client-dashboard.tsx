"use client";

import { useState } from "react";
import {
  CircleHelp,
  LayoutDashboard,
  Link2,
  MessageCircle,
  ShoppingBag,
  Store,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { User } from "@/types/api";
import { navigateTo } from "./lib/use-hash-route";
import { WorkspaceSidebar, type WorkspaceNavItem } from "./workspace-sidebar";

const CLIENT_NAV_ITEMS: WorkspaceNavItem[] = [
  { value: "overview", label: "Vue d'ensemble", icon: LayoutDashboard },
  { value: "purchases", label: "Mes achats", icon: ShoppingBag },
  { value: "messages", label: "Messages", icon: MessageCircle },
  { value: "profile", label: "Mon profil", icon: UserRound },
  { value: "affiliate", label: "Marché d'affiliation", icon: Link2 },
  { value: "support", label: "Aide et assistance", icon: CircleHelp },
  { value: "create-store", label: "Créer une boutique", icon: Store },
];

const DESTINATIONS: Record<string, string> = {
  purchases: "#/mes-achats",
  messages: "#/messages",
  profile: "#/profil",
  affiliate: "#/affiliations",
  support: "#/messages",
  "create-store": "#/dashboard/creer-boutique",
};

export function ClientDashboard({ user }: { user: User }) {
  const [active, setActive] = useState("overview");

  const selectItem = (value: string) => {
    setActive(value);
    if (DESTINATIONS[value]) navigateTo(DESTINATIONS[value]);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Mon espace</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Bonjour {user.name.split(" ")[0]} — retrouvez vos achats, vos messages et votre profil.
        </p>
      </div>
      <WorkspaceSidebar items={CLIENT_NAV_ITEMS} value={active} onValueChange={selectItem}>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShoppingBag className="size-4 text-primary" aria-hidden="true" />
                Mes achats
              </CardTitle>
              <CardDescription>Retrouvez le suivi de vos commandes et vos fichiers numériques.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" onClick={() => navigateTo("#/mes-achats")}>Consulter mes achats</Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageCircle className="size-4 text-primary" aria-hidden="true" />
                Messages et assistance
              </CardTitle>
              <CardDescription>Échangez avec les vendeurs et obtenez de l&apos;aide.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" onClick={() => navigateTo("#/messages")}>Ouvrir les messages</Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <UserRound className="size-4 text-primary" aria-hidden="true" />
                Mon profil
              </CardTitle>
              <CardDescription>Gérez vos informations et les paramètres de votre compte.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" onClick={() => navigateTo("#/profil")}>Gérer mon profil</Button>
            </CardContent>
          </Card>
          <Card className="sm:col-span-2 xl:col-span-3">
            <CardHeader>
              <CardTitle>Envie de recommander un produit ?</CardTitle>
              <CardDescription>
                Vous pouvez rejoindre le programme d&apos;affiliation sans créer de boutique.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => navigateTo("#/affiliations")}>
                <Link2 className="size-4" aria-hidden="true" />
                Découvrir le marché d&apos;affiliation
              </Button>
            </CardContent>
          </Card>
          <Card className="sm:col-span-2 xl:col-span-3">
            <CardHeader>
              <CardTitle>Vous souhaitez vendre sur BILLOGRAPH ?</CardTitle>
              <CardDescription>
                Préparez votre boutique et votre profil vendeur à votre rythme. Votre questionnaire sera sauvegardé.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" onClick={() => navigateTo("#/dashboard/creer-boutique")}>
                <Store className="size-4" aria-hidden="true" />
                Créer ma boutique
              </Button>
            </CardContent>
          </Card>
        </div>
      </WorkspaceSidebar>
    </div>
  );
}
