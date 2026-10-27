"use client";

// Onglet "Produits" du dashboard vendeur : liste, création, édition,
// publication/dépublication, archivage, suppression.

import { useCallback, useEffect, useState } from "react";
import {
  Archive,
  Eye,
  EyeOff,
  Package,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "../lib/api-client";
import { navigateTo } from "../lib/use-hash-route";
import { InlineConfirm } from "../inline-confirm";
import { StatusBadge } from "../status-badge";
import { formatXOF } from "@/lib/format";
import type { VendorProduct } from "@/types/api";

type ProductsTabProps = {
  storeSlug: string;
};

function ProductThumb({ product }: { product: VendorProduct }) {
  if (product.imageUrl) {
    return (
       
      <img
        src={product.imageUrl}
        alt={`Couverture du produit ${product.title}`}
        className="size-12 shrink-0 rounded-md border object-cover"
      />
    );
  }
  return (
    <span className="flex size-12 shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground">
      <Package className="size-5" aria-hidden="true" />
    </span>
  );
}

export function ProductsTab({ storeSlug }: ProductsTabProps) {
  const { toast } = useToast();
  const [products, setProducts] = useState<VendorProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await apiFetch<{ products: VendorProduct[] }>("/api/products/mine");
      setProducts(data.products);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de charger vos produits.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, storeSlug]);

  const patchStatus = async (product: VendorProduct, status: VendorProduct["status"], successMessage: string) => {
    setBusyId(product.id);
    try {
      await apiFetch(`/api/products/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      toast({ title: successMessage });
      await load();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Action impossible",
        description: error instanceof Error ? error.message : "Réessayez dans un instant.",
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (product: VendorProduct) => {
    setBusyId(product.id);
    try {
      await apiFetch(`/api/products/${product.id}`, { method: "DELETE" });
      toast({
        title: "Produit supprimé",
        description: `« ${product.title} » a été définitivement retiré.`,
      });
      await load();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Suppression impossible",
        description:
          error instanceof Error && error.message.includes("commande")
            ? "Ce produit apparaît dans des commandes — archivez-le plutôt."
            : error instanceof Error
              ? error.message
              : "Réessayez dans un instant.",
      });
    } finally {
      setBusyId(null);
    }
  };

  const iconButtonClass =
    "size-11 shrink-0 text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-11 w-44 rounded-md" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {products.length} produit(s) dans votre catalogue.
        </p>
        <Button className="h-11" onClick={() => navigateTo("#/dashboard/produit/nouveau")}>
          <Plus className="size-4" aria-hidden="true" />
          Nouveau produit
        </Button>
      </div>

      {error ? (
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
          <CardContent className="flex flex-col items-center gap-4 p-12 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Package className="size-7" aria-hidden="true" />
            </span>
            <div>
              <p className="font-semibold">Votre catalogue est vide</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Créez votre premier produit : ebook, formation, APK, fichier ou article physique.
              </p>
            </div>
            <Button className="h-11" onClick={() => navigateTo("#/dashboard/produit/nouveau")}>
              <Plus className="size-4" aria-hidden="true" />
              Nouveau produit
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="py-0">
          <CardContent className="p-0">
            <div className="max-h-96 overflow-y-auto overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-56">Produit</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Prix</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <ProductThumb product={product} />
                          <div className="min-w-0">
                            <p className="max-w-56 truncate font-medium">{product.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {product.hasFile ? "Fichier joint" : "Sans fichier"}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {product.type === "DIGITAL" ? "Numérique" : "Physique"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatXOF(product.priceXOF)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={product.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        {product.type === "PHYSICAL" ? (product.stock ?? "—") : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className={iconButtonClass}
                            aria-label={`Voir la page publique de ${product.title}`}
                            onClick={() => navigateTo(`#/produit/${product.slug}`)}
                          >
                            <Eye className="size-4" aria-hidden="true" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className={iconButtonClass}
                            aria-label={`Modifier ${product.title}`}
                            onClick={() => navigateTo(`#/dashboard/produit/${product.id}`)}
                          >
                            <Pencil className="size-4" aria-hidden="true" />
                          </Button>
                          {product.status !== "PUBLISHED" ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className={iconButtonClass}
                              aria-label={`Publier ${product.title}`}
                              disabled={busyId === product.id}
                              onClick={() =>
                                void patchStatus(product, "PUBLISHED", "Produit publié")
                              }
                            >
                              <Upload className="size-4" aria-hidden="true" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              className={iconButtonClass}
                              aria-label={`Retirer de la publication ${product.title}`}
                              disabled={busyId === product.id}
                              onClick={() =>
                                void patchStatus(product, "DRAFT", "Produit retiré en brouillon")
                              }
                            >
                              <EyeOff className="size-4" aria-hidden="true" />
                            </Button>
                          )}
                          {product.status !== "ARCHIVED" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className={iconButtonClass}
                              aria-label={`Archiver ${product.title}`}
                              disabled={busyId === product.id}
                              onClick={() =>
                                void patchStatus(product, "ARCHIVED", "Produit archivé")
                              }
                            >
                              <Archive className="size-4" aria-hidden="true" />
                            </Button>
                          )}
                          <InlineConfirm
                            trigger={<Trash2 className="size-4" aria-hidden="true" />}
                            triggerVariant="ghost"
                            triggerClassName="size-11 shrink-0 text-destructive hover:text-destructive hover:bg-transparent"
                            triggerAriaLabel={`Supprimer ${product.title}`}
                            confirmLabel="Supprimer définitivement"
                            pendingLabel="Suppression…"
                            warnText="Irréversible."
                            size="sm"
                            busy={busyId === product.id}
                            onConfirm={() => handleDelete(product)}
                          />
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
