"use client";

// MES ACHATS (#/mes-achats) : récupération des téléchargements par email.
// GET /api/downloads/my?email=...

import { useState } from "react";
import { Download, Inbox, MailSearch } from "lucide-react";
import { buttonVariants, Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "./status-badge";
import { apiFetch, apiUrl } from "./lib/api-client";
import { formatDate } from "@/lib/format";
import type { MyPurchases } from "@/types/api";
import { cn } from "@/lib/utils";

export function PurchasesView() {
  const [email, setEmail] = useState("");
  const [searchedEmail, setSearchedEmail] = useState<string | null>(null);
  const [orders, setOrders] = useState<MyPurchases["orders"]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = email.trim();
    setLoading(true);
    setError(null);
    setSearchedEmail(trimmed);
    try {
      const data = await apiFetch<MyPurchases>(apiUrl("/api/downloads/my", { email: trimmed }));
      setOrders(data.orders);
    } catch (err) {
      setOrders([]);
      setError(err instanceof Error ? err.message : "Recherche impossible.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
      <div className="text-center">
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Download className="size-7" aria-hidden="true" />
        </span>
        <h1 className="mt-5 text-3xl font-bold tracking-tight">Mes achats</h1>
        <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
          Saisissez l&apos;email utilisé lors de votre commande pour retrouver vos fichiers
          numériques. Les liens sont valables 30 jours, 5 téléchargements maximum.
        </p>
      </div>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="text-base">Rechercher mes téléchargements</CardTitle>
          <CardDescription>Aucun compte n&apos;est nécessaire.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="purchases-email">Adresse email</Label>
              <Input
                id="purchases-email"
                type="email"
                required
                placeholder="vous@exemple.bj"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11"
              />
            </div>
            <Button type="submit" className="h-11" disabled={loading}>
              <MailSearch className="size-4" aria-hidden="true" />
              {loading ? "Recherche…" : "Rechercher"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Résultats */}
      <div className="mt-6">
        {loading && (
          <div className="space-y-3" aria-busy="true">
            <Skeleton className="h-28 w-full rounded-xl" />
            <Skeleton className="h-28 w-full rounded-xl" />
          </div>
        )}

        {!loading && error && (
          <Card>
            <CardContent className="p-6 text-center text-sm text-destructive">{error}</CardContent>
          </Card>
        )}

        {!loading && !error && searchedEmail !== null && orders.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
              <Inbox className="size-10 text-muted-foreground" aria-hidden="true" />
              <p className="font-semibold">Aucun achat trouvé pour cet email</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Vérifiez l&apos;adresse saisie ou repassez une commande : seules les commandes
                payées contenant des produits numériques apparaissent ici.
              </p>
            </CardContent>
          </Card>
        )}

        {!loading && !error && orders.length > 0 && (
          <ul className="space-y-4">
            {orders.map((order) => (
              <li key={order.reference}>
                <Card>
                  <CardHeader className="flex-row items-center justify-between space-y-0">
                    <div>
                      <CardTitle className="font-mono text-base">{order.reference}</CardTitle>
                      <CardDescription>Commande du {formatDate(order.createdAt)}</CardDescription>
                    </div>
                    <StatusBadge status={order.status} />
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {order.items.map((item, index) => (
                      <div
                        key={`${item.productId}-${index}`}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/50 p-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{item.title}</p>
                          {item.download ? (
                            <p className="text-xs text-muted-foreground">
                              Restants :{" "}
                              {Math.max(0, item.download.maxDownloads - item.download.downloadCount)}
                              /{item.download.maxDownloads} · expire le{" "}
                              {formatDate(item.download.expiresAt)}
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              Fichier indisponible pour cet article.
                            </p>
                          )}
                        </div>
                        {item.download ? (
                          <a
                            href={`/api/downloads?token=${item.download.token}`}
                            download
                            className={cn(buttonVariants({ size: "sm" }), "h-9")}
                          >
                            <Download className="size-4" aria-hidden="true" />
                            Télécharger
                          </a>
                        ) : null}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
