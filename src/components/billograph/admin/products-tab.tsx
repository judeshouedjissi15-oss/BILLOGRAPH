"use client";

// Onglet "Produits" de l'espace admin : TOUS les produits de TOUTES les
// boutiques — y compris brouillons et archivés (visibilité totale sur le
// travail des vendeurs). Filtres : statut, boutique, recherche par titre.
// GET /api/admin/products?status=&storeId=&q=&limit=

import { useCallback, useEffect, useState } from "react";
import { PackageSearch, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebouncedValue } from "../lib/use-debounced-value";
import { apiFetch, apiUrl } from "../lib/api-client";
import { navigateTo } from "../lib/use-hash-route";
import { StatusBadge } from "../status-badge";
import { formatDate, formatXOF, productStatusLabel } from "@/lib/format";
import { PRODUCT_STATUSES } from "@/lib/constants";
import type { AdminProduct, AdminStore } from "@/types/api";

export function ProductsTab() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [storeFilter, setStoreFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 350);

  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [stores, setStores] = useState<AdminStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await apiFetch<{ products: AdminProduct[] }>(
        apiUrl("/api/admin/products", {
          status: statusFilter === "all" ? undefined : statusFilter,
          storeId: storeFilter === "all" ? undefined : storeFilter,
          q: debouncedSearch || undefined,
          limit: 200,
        }),
      );
      setProducts(data.products);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de charger les produits.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, storeFilter, debouncedSearch]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  // Liste des boutiques pour le filtre (chargée une seule fois).
  useEffect(() => {
    void apiFetch<{ stores: AdminStore[] }>("/api/admin/stores")
      .then((data) => setStores(data.stores))
      .catch(() => setStores([]));
  }, []);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="admin-products-status">Statut</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger id="admin-products-status" className="h-11 w-full">
              <SelectValue placeholder="Tous les statuts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              {PRODUCT_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {productStatusLabel(status)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="admin-products-store">Boutique</Label>
          <Select value={storeFilter} onValueChange={setStoreFilter}>
            <SelectTrigger id="admin-products-store" className="h-11 w-full">
              <SelectValue placeholder="Toutes les boutiques" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les boutiques</SelectItem>
              {stores.map((store) => (
                <SelectItem key={store.id} value={store.id}>
                  {store.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="admin-products-search">Recherche</Label>
          <Input
            id="admin-products-search"
            type="text"
            placeholder="Titre du produit…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11"
          />
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{products.length} produit(s)</p>

      {loading ? (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-12 w-full rounded-md" />
          <Skeleton className="h-12 w-full rounded-md" />
          <Skeleton className="h-12 w-full rounded-md" />
        </div>
      ) : error ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" onClick={() => void load()}>
              Réessayer
            </Button>
          </CardContent>
        </Card>
      ) : products.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
            <PackageSearch className="size-10 text-muted-foreground" aria-hidden="true" />
            <p className="font-semibold">Aucun produit trouvé</p>
            <p className="text-sm text-muted-foreground">Ajustez les filtres ci-dessus.</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="py-0">
          <CardContent className="p-0">
            <div className="max-h-96 overflow-y-auto overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produit</TableHead>
                    <TableHead>Boutique</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Prix</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Créé le</TableHead>
                    <TableHead className="text-right">Voir</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell className="max-w-52">
                        <span className="block truncate font-medium" title={product.title}>
                          {product.title}
                        </span>
                        {product.type === "PHYSICAL" && product.stock !== null ? (
                          <span className="text-xs text-muted-foreground">
                            Stock : {product.stock}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="max-w-40 truncate text-sm">
                        {product.store.name}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {product.type === "DIGITAL" ? "Numérique" : "Physique"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatXOF(product.priceXOF)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={product.status} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {formatDate(product.createdAt)}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end">
                          {product.status === "PUBLISHED" ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-9"
                              aria-label={`Voir la page de vente de ${product.title}`}
                              onClick={() => navigateTo(`#/produit/${product.slug}`)}
                            >
                              <Eye className="size-4" aria-hidden="true" />
                              Page
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
