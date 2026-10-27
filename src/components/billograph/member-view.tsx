"use client";

// PROFIL PUBLIC D'UN MEMBRE (#/membre/{id}) — vitrine réelle, personnalisée
// librement par son titulaire depuis « Mon profil » : photo, titre public,
// présentation, ville. Les boutiques et les produits listés proviennent
// réellement de la base (boutiques ACTIVES, produits PUBLIÉS). Aucune donnée
// sensible : email, téléphone et données de compte ne sortent jamais ici.
import { useCallback, useEffect, useState } from "react";
import { MapPin, Package, ShoppingBag, Store as StoreIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "./lib/api-client";
import { navigateTo } from "./lib/use-hash-route";
import { formatXOF } from "@/lib/format";
import { normalizeHexColor } from "./lib/store-colors";

type MemberData = {
  member: {
    id: string;
    name: string;
    role: string;
    avatarUrl: string | null;
    headline: string | null;
    bio: string | null;
    city: string | null;
    memberSince: string;
    stores: {
      id: string;
      name: string;
      slug: string;
      description: string | null;
      color: string;
      productsCount: number;
    }[];
  } | null;
  products: {
    id: string;
    title: string;
    slug: string;
    priceXOF: number;
    type: string;
    imageUrl: string | null;
    storeName: string;
    storeSlug: string;
    storeColor: string;
  }[];
};

export function MemberView({ memberId }: { memberId: string }) {
  const [data, setData] = useState<MemberData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setNotFound(false);
    try {
      const d = await apiFetch<MemberData>(`/api/members/${encodeURIComponent(memberId)}`);
      if (!d.member) {
        setNotFound(true);
        setData(null);
      } else {
        setData(d);
      }
    } catch {
      setNotFound(true);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [memberId]);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-10" aria-busy="true">
        <div className="flex items-center gap-4">
          <Skeleton className="size-24 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-56" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }

  if (notFound || !data?.member) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Profil introuvable</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ce membre n&apos;existe pas ou son profil n&apos;est plus disponible.
        </p>
        <Button className="mt-6 h-11" onClick={() => navigateTo("#/")}>
          Retour à l&apos;accueil
        </Button>
      </div>
    );
  }

  const { member, products } = data;
  const initials = member.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      {/* En-tête du profil */}
      <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
        <Avatar className="size-24 border-2 border-primary/20">
          {member.avatarUrl ? <AvatarImage src={member.avatarUrl} alt={`Photo de ${member.name}`} /> : null}
          <AvatarFallback className="text-xl font-bold">{initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{member.name}</h1>
          {member.headline && (
            <p className="mt-1 text-base font-medium text-primary">{member.headline}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            {member.city && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" aria-hidden="true" />
                {member.city}
              </span>
            )}
            {member.stores.length > 0 && (
              <span className="inline-flex items-center gap-1">
                <StoreIcon className="size-3.5" aria-hidden="true" />
                {member.stores.length} boutique{member.stores.length > 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Présentation personnalisée */}
      {member.bio && (
        <Card className="mt-8">
          <CardContent className="p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              À propos
            </h2>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{member.bio}</p>
          </CardContent>
        </Card>
      )}

      {/* Boutiques réelles du membre */}
      {member.stores.length > 0 && (
        <section className="mt-8" aria-label="Boutiques du membre">
          <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <ShoppingBag className="size-5 text-primary" aria-hidden="true" />
            Boutiques
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {member.stores.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => navigateTo(`#/boutique/${s.slug}`)}
                className="rounded-xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold" style={{ color: s.color }}>
                    {s.name}
                  </p>
                  <Badge variant="secondary">{s.productsCount} produit(s)</Badge>
                </div>
                {s.description && (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{s.description}</p>
                )}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Produits publiés récents */}
      {products.length > 0 && (
        <section className="mt-8" aria-label="Produits publiés du membre">
          <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <Package className="size-5 text-primary" aria-hidden="true" />
            Dernières publications
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => navigateTo(`#/produit/${p.slug}`)}
                className="group overflow-hidden rounded-xl border text-left transition-all hover:-translate-y-0.5 hover:shadow-md"
              >
                <div
                  className="flex h-28 items-center justify-center"
                  style={{ background: `linear-gradient(135deg, ${normalizeHexColor(p.storeColor)}, ${normalizeHexColor(p.storeColor)}dd)` }}
                >
                  {p.imageUrl ? (
                    <img src={p.imageUrl} alt={p.title} className="size-full object-cover" />
                  ) : (
                    <Package className="size-8 text-white/80" aria-hidden="true" />
                  )}
                </div>
                <div className="p-3">
                  <p className="line-clamp-1 text-sm font-semibold group-hover:underline">{p.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{p.storeName}</p>
                  <p className="mt-1 text-sm font-bold text-primary">
                    {p.priceXOF === 0 ? "Gratuit" : formatXOF(p.priceXOF)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {member.stores.length === 0 && products.length === 0 && !member.bio && (
        <Card className="mt-8">
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            Ce membre n&apos;a pas encore personnalisé son profil public ni publié de boutique.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
