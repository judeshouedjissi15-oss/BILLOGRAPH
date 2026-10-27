"use client";

// Dialogs produit vendeur :
// - ProductCreateDialog : POST multipart /api/products (fichier + image)
// - ProductEditDialog   : PATCH JSON /api/products/:id (pas de re-upload en MVP)

import { useEffect, useState } from "react";
import { FileWarning, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "../lib/api-client";
import { formatBytes } from "@/lib/format";
import { MAX_FILE_SIZE_MB, PRODUCT_MAX_PRICE, CATEGORIES } from "@/lib/constants";
import type { ProductStatus, ProductType, VendorProduct } from "@/types/api";

const DIGITAL_ACCEPT = ".pdf,.zip,.mp3,.mp4,.apk,.epub";
const IMAGE_MAX_MB = 5;

function priceError(priceValue: string): string | null {
  if (priceValue.trim() === "") return "Indiquez un prix (0 = gratuit).";
  const price = Number(priceValue);
  if (!Number.isFinite(price) || price < 0) return "Le prix doit être un nombre positif.";
  if (!Number.isInteger(price)) return "Le prix doit être un nombre entier de FCFA.";
  if (price > PRODUCT_MAX_PRICE) return `Le prix ne peut pas dépasser ${PRODUCT_MAX_PRICE} FCFA.`;
  return null;
}

/* ---------------------------------- CRÉATION ---------------------------------- */

type ProductCreateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
};

export function ProductCreateDialog({ open, onOpenChange, onCreated }: ProductCreateDialogProps) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<ProductType>("DIGITAL");
  const [category, setCategory] = useState<string>(CATEGORIES[0].id);
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [publishNow, setPublishNow] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Aperçu de l'image de couverture + nettoyage de l'URL objet.
  useEffect(() => {
    if (!image) {
      setImagePreview(null);
      return;
    }
    const url = URL.createObjectURL(image);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setType("DIGITAL");
    setCategory(CATEGORIES[0].id);
    setPrice("");
    setStock("");
    setPublishNow(true);
    setFile(null);
    setImage(null);
  };

  const handleFileChange = (selected: File | null) => {
    if (selected && selected.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      toast({
        variant: "destructive",
        title: "Fichier trop volumineux",
        description: `La taille maximale est de ${MAX_FILE_SIZE_MB} Mo.`,
      });
      return;
    }
    setFile(selected);
  };

  const handleImageChange = (selected: File | null) => {
    if (selected) {
      if (!selected.type.startsWith("image/")) {
        toast({
          variant: "destructive",
          title: "Format invalide",
          description: "Choisissez une image (JPG, PNG, WebP…).",
        });
        return;
      }
      if (selected.size > IMAGE_MAX_MB * 1024 * 1024) {
        toast({
          variant: "destructive",
          title: "Image trop volumineuse",
          description: `La taille maximale est de ${IMAGE_MAX_MB} Mo.`,
        });
        return;
      }
    }
    setImage(selected);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const priceProblem = priceError(price);
    if (priceProblem) {
      toast({ variant: "destructive", title: "Prix invalide", description: priceProblem });
      return;
    }
    if (type === "PHYSICAL" && publishNow && stock.trim() === "") {
      toast({
        variant: "destructive",
        title: "Stock requis",
        description: "Indiquez le stock disponible pour publier un produit physique.",
      });
      return;
    }
    if (type === "DIGITAL" && publishNow && !file) {
      toast({
        variant: "destructive",
        title: "Fichier numérique requis",
        description: "Ajoutez le fichier à livrer avant de publier (PDF, ZIP, MP3, MP4, APK…).",
      });
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.set("title", title.trim());
      formData.set("description", description.trim());
      formData.set("type", type);
      formData.set("category", category);
      formData.set("priceXOF", String(Number(price)));
      formData.set("status", publishNow ? "PUBLISHED" : "DRAFT");
      if (type === "PHYSICAL") formData.set("stock", String(Number(stock || "0")));
      if (file) formData.set("file", file);
      if (image) formData.set("image", image);

      await apiFetch("/api/products", { method: "POST", body: formData });

      toast({
        title: "Produit créé",
        description: publishNow
          ? "Votre produit est en ligne dans votre boutique."
          : "Votre produit a été enregistré en brouillon.",
      });
      resetForm();
      onCreated();
      onOpenChange(false);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Création impossible",
        description: error instanceof Error ? error.message : "Réessayez dans un instant.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nouveau produit</DialogTitle>
          <DialogDescription>
            Les produits numériques sont livrés automatiquement après paiement.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="product-title">Titre *</Label>
            <Input
              id="product-title"
              required
              minLength={2}
              maxLength={120}
              placeholder="Ex : Guide complet du marketing WhatsApp"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-11"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="product-description">Description</Label>
            <Textarea
              id="product-description"
              rows={4}
              maxLength={4000}
              placeholder="Décrivez votre produit, son contenu, ses bénéfices…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="product-type">Type *</Label>
              <Select value={type} onValueChange={(value) => setType(value as ProductType)}>
                <SelectTrigger id="product-type" className="h-11 w-full">
                  <SelectValue placeholder="Choisir un type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DIGITAL">Numérique (fichier)</SelectItem>
                  <SelectItem value="PHYSICAL">Physique (stock)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-category">Catégorie *</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="product-category" className="h-11 w-full">
                  <SelectValue placeholder="Choisir une catégorie" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="product-price">Prix (FCFA) *</Label>
              <Input
                id="product-price"
                type="number"
                inputMode="numeric"
                min={0}
                step={100}
                required
                placeholder="Ex : 5000 (0 = gratuit)"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="h-11"
              />
            </div>
            {type === "PHYSICAL" && (
              <div className="space-y-2">
                <Label htmlFor="product-stock">Stock disponible</Label>
                <Input
                  id="product-stock"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  placeholder="Ex : 25"
                  value={stock}
                  onChange={(e) => setStock(e.target.value)}
                  className="h-11"
                />
              </div>
            )}
          </div>

          {type === "DIGITAL" && (
            <div className="space-y-2">
              <Label htmlFor="product-file">Fichier numérique (max {MAX_FILE_SIZE_MB} Mo)</Label>
              <Input
                id="product-file"
                type="file"
                accept={DIGITAL_ACCEPT}
                onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
                className="h-11 file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:text-sm file:text-primary-foreground"
              />
              {file ? (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Paperclip className="size-3.5" aria-hidden="true" />
                  {file.name} · {formatBytes(file.size)}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Formats acceptés : PDF, ZIP, MP3, MP4, APK, EPUB.
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="product-image">Image de couverture (max {IMAGE_MAX_MB} Mo)</Label>
            <Input
              id="product-image"
              type="file"
              accept="image/*"
              onChange={(e) => handleImageChange(e.target.files?.[0] ?? null)}
              className="h-11 file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:text-sm"
            />
            {imagePreview && (
               
              <img
                src={imagePreview}
                alt="Aperçu de la couverture choisie"
                className="mt-2 aspect-video w-full rounded-lg border object-cover"
              />
            )}
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <Label htmlFor="product-publish" className="cursor-pointer">
                Publier maintenant
              </Label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Sinon, le produit reste en brouillon (visible uniquement par vous).
              </p>
            </div>
            <Switch id="product-publish" checked={publishNow} onCheckedChange={setPublishNow} />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Enregistrement…" : "Créer le produit"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------------- ÉDITION ---------------------------------- */

type ProductEditDialogProps = {
  product: VendorProduct | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
};

export function ProductEditDialog({ product, onOpenChange, onSaved }: ProductEditDialogProps) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>(CATEGORIES[0].id);
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [status, setStatus] = useState<ProductStatus>("DRAFT");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (product) {
      setTitle(product.title);
      setDescription(product.description ?? "");
      setCategory(product.category);
      setPrice(String(product.priceXOF));
      setStock(product.stock === null ? "" : String(product.stock));
      setStatus(product.status);
    }
  }, [product]);

  const handleSave = async () => {
    if (!product) return;
    const priceProblem = priceError(price);
    if (priceProblem) {
      toast({ variant: "destructive", title: "Prix invalide", description: priceProblem });
      return;
    }
    if (product.type === "PHYSICAL" && status === "PUBLISHED" && stock.trim() === "") {
      toast({
        variant: "destructive",
        title: "Stock requis",
        description: "Indiquez le stock disponible pour publier un produit physique.",
      });
      return;
    }

    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        description: description.trim(),
        category,
        priceXOF: Number(price),
        status,
      };
      if (product.type === "PHYSICAL") body.stock = Number(stock || "0");

      await apiFetch(`/api/products/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      toast({ title: "Produit mis à jour", description: "Les modifications sont enregistrées." });
      onSaved();
      onOpenChange(false);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Mise à jour impossible",
        description: error instanceof Error ? error.message : "Réessayez dans un instant.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={product !== null}
      onOpenChange={(open) => {
        if (!open) onOpenChange(false);
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Modifier le produit</DialogTitle>
          <DialogDescription>
            Seuls les textes, le prix, le stock et le statut sont modifiables en MVP.
          </DialogDescription>
        </DialogHeader>

        {product && (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/40 p-3 text-sm">
              <p className="flex items-center gap-2 font-medium">
                <Paperclip className="size-4 text-primary" aria-hidden="true" />
                {product.fileName ? product.fileName : "Aucun fichier numérique"}
              </p>
              {product.fileSize ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Taille : {formatBytes(product.fileSize)}
                </p>
              ) : null}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleSave();
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label htmlFor="edit-title">Titre *</Label>
                <Input
                  id="edit-title"
                  required
                  minLength={2}
                  maxLength={120}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="h-11"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-description">Description</Label>
                <Textarea
                  id="edit-description"
                  rows={4}
                  maxLength={4000}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="edit-category">Catégorie</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger id="edit-category" className="h-11 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-price">Prix (FCFA) *</Label>
                  <Input
                    id="edit-price"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={100}
                    required
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="h-11"
                  />
                </div>
              </div>

              {product.type === "PHYSICAL" && (
                <div className="space-y-2">
                  <Label htmlFor="edit-stock">Stock disponible</Label>
                  <Input
                    id="edit-stock"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    value={stock}
                    onChange={(e) => setStock(e.target.value)}
                    className="h-11"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="edit-status">Statut</Label>
                <Select value={status} onValueChange={(value) => setStatus(value as ProductStatus)}>
                  <SelectTrigger id="edit-status" className="h-11 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DRAFT">Brouillon</SelectItem>
                    <SelectItem value="PUBLISHED">Publié</SelectItem>
                    <SelectItem value="ARCHIVED">Archivé</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <p className="flex items-start gap-2 rounded-lg bg-accent p-3 text-xs text-accent-foreground">
                <FileWarning className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                Pour changer le fichier numérique ou l&apos;image, supprimez ce produit et
                recréez-le (possible tant qu&apos;il n&apos;a pas de commande payée).
              </p>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                  Annuler
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Enregistrement…" : "Enregistrer"}
                </Button>
              </DialogFooter>
            </form>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
