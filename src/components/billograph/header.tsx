"use client";

// Header sticky : logo, navigation, état de session (menu déroulant)
// + panneau de menu mobile INTÉGRÉ au site (pas de tiroir modal).

import { useState } from "react";
import {
  ChevronDown,
  Gift,
  HandHeart,
  LayoutDashboard,
  Link2,
  LogOut,
  MessageCircle,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Logo } from "./logo";
import { NotificationsBell } from "./notifications-bell";
import { ThemeMobileLine, ThemeToggle } from "./theme-toggle";
import { goToFeatures, navigateTo, type HashRoute } from "./lib/use-hash-route";
import type { User } from "@/types/api";
import { cn } from "@/lib/utils";

type HeaderProps = {
  route: HashRoute;
  user: User | null;
  userLoading: boolean;
  onLogout: () => Promise<void>;
};

function initialsOf(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((word) => word[0] ?? "")
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

function MenuGridIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className="size-5 text-primary"
      aria-hidden="true"
    >
      <circle cx="5" cy="5" r="2" />
      <circle cx="12" cy="5" r="2" />
      <circle cx="19" cy="5" r="2" />
      <circle cx="5" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
      <circle cx="5" cy="19" r="2" />
      <circle cx="12" cy="19" r="2" />
      <circle cx="19" cy="19" r="2" />
    </svg>
  );
}

export function Header({ route, user, userLoading, onLogout }: HeaderProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const goHome = () => navigateTo("#/");
  const goMarket = () => navigateTo("#/market");
  const goLab = () => navigateTo("#/lab");
  const goAuth = () => navigateTo("#/auth");
  const goPurchases = () => navigateTo("#/mes-achats");
  const goDashboard = () => navigateTo("#/dashboard");
  const goAdmin = () => navigateTo("#/admin");
  const goMessages = () => navigateTo("#/messages");
  const goProfessionnel = () => navigateTo("#/professionnel");
  const goProfil = () => navigateTo("#/profil");
  const goAffiliates = () => navigateTo("#/affiliations");
  const goReferrals = () => navigateTo("#/parrainage");

  const closeThen = (action: () => void) => {
    setMobileOpen(false);
    action();
  };

  const handleLogout = async () => {
    setMobileOpen(false);
    await onLogout();
    navigateTo("#/");
  };

  const navLinkClass = (active: boolean) =>
    cn(
      "inline-flex h-11 items-center rounded-md px-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
      active ? "text-primary" : "text-muted-foreground",
    );

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
        <button
          type="button"
          onClick={goHome}
          className="flex h-11 items-center rounded-md px-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          aria-label="BILLOGRAPH — retour à l'accueil"
        >
          <Logo />
        </button>

        {/* La navigation publique disparaît après connexion; le logo ramène au site public. */}
        {!user && (
          <nav className="hidden items-center gap-1 md:flex" aria-label="Navigation principale">
            <button type="button" className={navLinkClass(route.name === "home")} onClick={goHome}>
              Accueil
            </button>
            <button type="button" className={navLinkClass(route.name === "market")} onClick={goMarket}>
              Marché
            </button>
            <button type="button" className={navLinkClass(route.name === "lab")} onClick={goLab}>
              Outils gratuits
            </button>
            <button type="button" className={navLinkClass(false)} onClick={goToFeatures}>
              Fonctionnalités
            </button>
            <button
              type="button"
              className={navLinkClass(route.name === "purchases")}
              onClick={goPurchases}
            >
              <ShoppingBag className="mr-1.5 size-4" aria-hidden="true" />
              Mes achats
            </button>
          </nav>
        )}

        {/* Espace de droite */}
        <div className="flex items-center gap-2">
          {/* Bascule sombre/clair : visible en toutes circonstances */}
          <ThemeToggle />
          {userLoading ? (
            <Skeleton className="h-11 w-40 rounded-md" />
          ) : user ? (
            <>
              <NotificationsBell />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-10"
                aria-label="Ouvrir les messages"
                onClick={goMessages}
              >
                <MessageCircle className="size-5" aria-hidden="true" />
              </Button>
              <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="h-11 gap-2 px-2"
                  aria-label={`Menu du compte ${user.name}`}
                >
                  <Avatar className="size-8">
                    {user.avatarUrl ? (
                      <AvatarImage src={user.avatarUrl} alt={`Photo de profil de ${user.name}`} />
                    ) : null}
                    <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
                      {initialsOf(user.name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden max-w-32 truncate text-sm font-medium sm:inline">
                    {user.name}
                  </span>
                  <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel>
                  <p className="truncate text-sm font-semibold">{user.name}</p>
                  <p className="truncate text-xs font-normal text-muted-foreground">{user.email}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={goDashboard} className="h-10 cursor-pointer">
                  <LayoutDashboard className="size-4" aria-hidden="true" />
                  Tableau de bord
                </DropdownMenuItem>
                <DropdownMenuItem onClick={goAffiliates} className="h-10 cursor-pointer">
                  <Link2 className="size-4" aria-hidden="true" />
                  Marché d&apos;affiliation
                </DropdownMenuItem>
                <DropdownMenuItem onClick={goReferrals} className="h-10 cursor-pointer">
                  <Gift className="size-4" aria-hidden="true" />
                  Parrainage
                </DropdownMenuItem>
                {user.officeActive && (
                  <DropdownMenuItem onClick={goProfessionnel} className="h-10 cursor-pointer">
                    <HandHeart className="size-4" aria-hidden="true" />
                    Mon espace professionnel
                    {user.officeLabel ? ` (${user.officeLabel})` : ""}
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={goMarket} className="h-10 cursor-pointer">
                  <Search className="size-4" aria-hidden="true" />
                  Découvrir le marché
                </DropdownMenuItem>
                <DropdownMenuItem onClick={goLab} className="h-10 cursor-pointer">
                  <Sparkles className="size-4" aria-hidden="true" />
                  Outils gratuits
                </DropdownMenuItem>
                <DropdownMenuItem onClick={goHome} className="h-10 cursor-pointer">
                  <Store className="size-4" aria-hidden="true" />
                  Visiter le site public
                </DropdownMenuItem>
                <DropdownMenuItem onClick={goProfil} className="h-10 cursor-pointer">
                  <UserRound className="size-4" aria-hidden="true" />
                  Mon profil
                </DropdownMenuItem>
                {(user.role === "ADMIN" || user.officeActive) && (
                  <DropdownMenuItem onClick={goAdmin} className="h-10 cursor-pointer">
                    <ShieldCheck className="size-4" aria-hidden="true" />
                    {user.role === "ADMIN"
                      ? "Espace admin"
                      : user.officeRole === "GREFFIER"
                        ? "Administration (lecture seule)"
                        : "Espace admin"}
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="h-10 cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="size-4" aria-hidden="true" />
                  Déconnexion
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            </>
          ) : (
            <div className="hidden items-center gap-2 md:flex">
              <Button variant="ghost" className="h-11" onClick={goAuth}>
                Connexion
              </Button>
              <Button className="h-11" onClick={goAuth}>
                <Sparkles className="size-4" aria-hidden="true" />
                Créer ma boutique
              </Button>
            </div>
          )}

          {/* Menu mobile : panneau intégré sous le header (pas de dialogue) */}
          <Button
            variant="outline"
            size="icon"
            className="size-11 md:hidden"
            aria-label={mobileOpen ? "Fermer le menu" : "Ouvrir le menu"}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((open) => !open)}
          >
            <MenuGridIcon />
          </Button>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t bg-background md:hidden">
          <nav className="mx-auto max-w-6xl px-4 py-3" aria-label="Menu mobile">
            {!user && (
              <>
                <button
                  type="button"
                  className="flex h-11 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-medium hover:bg-accent"
                  onClick={() => closeThen(goHome)}
                >
                  <Store className="size-4" aria-hidden="true" />
                  Accueil
                </button>
                <button
                  type="button"
                  className="flex h-11 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-medium hover:bg-accent"
                  onClick={() => closeThen(goMarket)}
                >
                  <Search className="size-4" aria-hidden="true" />
                  Marché
                </button>
                <button
                  type="button"
                  className="flex h-11 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-medium hover:bg-accent"
                  onClick={() => closeThen(goLab)}
                >
                  <Sparkles className="size-4" aria-hidden="true" />
                  Outils gratuits
                </button>
                <button
                  type="button"
                  className="flex h-11 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-medium hover:bg-accent"
                  onClick={() => closeThen(goToFeatures)}
                >
                  <Sparkles className="size-4" aria-hidden="true" />
                  Fonctionnalités
                </button>
                <button
                  type="button"
                  className="flex h-11 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-medium hover:bg-accent"
                  onClick={() => closeThen(goPurchases)}
                >
                  <ShoppingBag className="size-4" aria-hidden="true" />
                  Mes achats
                </button>
              </>
            )}
            {user && (
              <button
                type="button"
                className="flex h-11 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-medium hover:bg-accent"
                onClick={() => closeThen(goMarket)}
              >
                <Search className="size-4" aria-hidden="true" />
                Découvrir le marché
              </button>
            )}
            {user && (
              <button
                type="button"
                className="flex h-11 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-medium hover:bg-accent"
                onClick={() => closeThen(goDashboard)}
              >
                <LayoutDashboard className="size-4" aria-hidden="true" />
                Tableau de bord
              </button>
            )}
            {user && (
              <button
                type="button"
                className="flex h-11 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-medium hover:bg-accent"
                onClick={() => closeThen(goAffiliates)}
              >
                <Link2 className="size-4" aria-hidden="true" />
                Marché d&apos;affiliation
              </button>
            )}
            {user && (
              <button
                type="button"
                className="flex h-11 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-medium hover:bg-accent"
                onClick={() => closeThen(goReferrals)}
              >
                <Gift className="size-4" aria-hidden="true" />
                Parrainage
              </button>
            )}
            {user && (
              <button
                type="button"
                className="flex h-11 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-medium hover:bg-accent"
                onClick={() => closeThen(goMessages)}
              >
                <MessageCircle className="size-4" aria-hidden="true" />
                Messages
              </button>
            )}
            {user?.officeActive && (
              <button
                type="button"
                className="flex h-11 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-medium hover:bg-accent"
                onClick={() => closeThen(goProfessionnel)}
              >
                <HandHeart className="size-4" aria-hidden="true" />
                Espace professionnel
              </button>
            )}
            {user && (
              <button
                type="button"
                className="flex h-11 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-medium hover:bg-accent"
                onClick={() => closeThen(goProfil)}
              >
                <UserRound className="size-4" aria-hidden="true" />
                Mon profil
              </button>
            )}
            {user?.role === "ADMIN" && (
              <button
                type="button"
                className="flex h-11 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-medium hover:bg-accent"
                onClick={() => closeThen(goAdmin)}
              >
                <ShieldCheck className="size-4" aria-hidden="true" />
                Espace admin
              </button>
            )}
            {user && user.role !== "ADMIN" && user.officeActive && user.officeRole === "GREFFIER" && (
              <button
                type="button"
                className="flex h-11 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-medium hover:bg-accent"
                onClick={() => closeThen(goAdmin)}
              >
                <ShieldCheck className="size-4" aria-hidden="true" />
                Administration (lecture seule)
              </button>
            )}
            {/* Apparence : bascule sombre/clair (le panneau reste ouvert) */}
            <div className="mt-3 border-t pt-3">
              <ThemeMobileLine className="flex h-11 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-medium hover:bg-accent" />
            </div>
            <div className="mt-3 flex flex-col gap-2 border-t pt-3">
              {!user ? (
                <>
                  <Button className="h-11" onClick={() => closeThen(goAuth)}>
                    <Sparkles className="size-4" aria-hidden="true" />
                    Créer ma boutique
                  </Button>
                  <Button variant="outline" className="h-11" onClick={() => closeThen(goAuth)}>
                    Connexion
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  className="h-11 text-destructive hover:text-destructive"
                  onClick={handleLogout}
                >
                  <LogOut className="size-4" aria-hidden="true" />
                  Déconnexion
                </Button>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
