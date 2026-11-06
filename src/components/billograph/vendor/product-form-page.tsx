"use client";

// PAGE PRODUIT VENDEUR — vraie page, pas de dialogue :
// - #/dashboard/produit/nouveau → création (Blob direct en production, multipart en local)
// - #/dashboard/produit/{id}    → édition (PATCH JSON /api/products/:id, pas de re-upload en MVP)

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, FileWarning, Loader2, Package, Paperclip, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "../lib/api-client";
import { cleanupPrivateBlobs, uploadPrivateBlob } from "../lib/blob-upload";
import {
  discardLargeProductFile,
  uploadLargeProductFile,
  type UploadedProductFile,
} from "../lib/large-file-upload";
import { navigateTo } from "../lib/use-hash-route";
import { formatBytes, formatXOF } from "@/lib/format";
import {
  MAX_PRODUCT_FILES,
  PRODUCT_FILE_MAX_GB,
  PRODUCT_MAX_PRICE,
  PRODUCT_PURCHASE_LABELS,
  CATEGORIES,
} from "@/lib/constants";
import type { ProductStatus, ProductType, Store, VendorProduct } from "@/types/api";

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

function dateToLocalInput(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

type PageState =
  | { status: "loading" }
  | { status: "no-store" }
  | { status: "ready" }
  | { status: "not-found" }
  | { status: "error"; message: string };

type ProductFormPageProps = {
  productId: string | null; // null = création
};

export function ProductFormPage({ productId }: ProductFormPageProps) {
  const { toast } = useToast();
  const [state, setState] = useState<PageState>({ status: "loading" });
  const [product, setProduct] = useState<VendorProduct | null>(null);

  const isEdit = productId !== null;

  const [reloadToken, setReloadToken] = useState(0);

  // Chargement : setState uniquement après un await, avec garde d'annulation.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const storeData = await apiFetch<{ store: Store | null }>("/api/stores/mine");
        if (cancelled) return;
        if (!storeData.store) {
          setState({ status: "no-store" });
          return;
        }
        if (isEdit) {
          const data = await apiFetch<{ products: VendorProduct[] }>("/api/products/mine");
          if (cancelled) return;
          const found = data.products.find((p) => p.id === productId) ?? null;
          if (!found) {
            setState({ status: "not-found" });
            return;
          }
          setProduct(found);
        }
        setState({ status: "ready" });
      } catch (error) {
        if (cancelled) return;
        const status = (error as { status?: number }).status;
        if (status === 401) {
          navigateTo("#/auth");
          return;
        }
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Erreur de chargement.",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isEdit, productId, reloadToken]);

  const retry = () => {
    setState({ status: "loading" });
    setReloadToken((token) => token + 1);
  };

  const goBack = () => navigateTo(isEdit ? "#/dashboard/produits" : "#/dashboard/produits");

  if (state.status === "loading") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10" aria-busy="true">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="mt-8 h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (state.status === "no-store") {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <Package className="size-7" aria-hidden="true" />
        </span>
        <h1 className="mt-6 text-2xl font-bold tracking-tight">Créez d&apos;abord votre boutique</h1>
        <p className="mt-2 text-muted-foreground">
          Un produit appartient à une boutique. Créez la vôtre depuis votre tableau de bord.
        </p>
        <Button className="mt-6 h-11" onClick={() => navigateTo("#/dashboard")}>
          Aller au tableau de bord
        </Button>
      </div>
    );
  }

  if (state.status === "not-found") {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <Package className="size-7" aria-hidden="true" />
        </span>
        <h1 className="mt-6 text-2xl font-bold tracking-tight">Produit introuvable</h1>
        <p className="mt-2 text-muted-foreground">
          Ce produit n&apos;existe pas ou n&apos;appartient pas à votre boutique.
        </p>
        <Button className="mt-6 h-11" onClick={goBack}>
          Retour aux produits
        </Button>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <Card>
          <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
            <p className="text-sm text-destructive">{state.message}</p>
            <Button variant="outline" onClick={retry}>
              Réessayer
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:py-10">
      {/* Fil d'Ariane */}
      <nav
        aria-label="Fil d'Ariane"
        className="mb-6 flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
      >
        <button type="button" className="hover:text-primary" onClick={() => navigateTo("#/dashboard")}>
          Tableau de bord
        </button>
        <span aria-hidden="true">/</span>
        <button type="button" className="hover:text-primary" onClick={goBack}>
          Produits
        </button>
        <span aria-hidden="true">/</span>
        <span className="text-foreground">{isEdit ? "Modifier le produit" : "Nouveau produit"}</span>
      </nav>

      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {isEdit ? "Modifier le produit" : "Nouveau produit"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isEdit
              ? "Vos textes et votre prix apparaissent sur la page de vente publique."
              : "Renseignez ces informations et ajoutez une belle couverture : votre page de vente sera créée automatiquement."}
          </p>
        </div>
        <Button variant="ghost" className="h-10 hidden gap-1.5 px-2 text-sm sm:inline-flex" onClick={goBack}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          Retour
        </Button>
      </div>

      {isEdit && product ? (
        <ProductEditForm product={product} onSaved={goBack} />
      ) : (
        <ProductCreateForm onCreated={goBack} />
      )}
    </div>
  );
}

/* ---------------------------------- CRÉATION ---------------------------------- */

export function AdminProductCreateForm({
  storeId,
  onCreated,
}: {
  storeId: string;
  onCreated: () => void;
}) {
  return <ProductCreateForm storeId={storeId} onCreated={onCreated} />;
}

function ProductCreateForm({
  storeId,
  onCreated,
}: {
  storeId?: string;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<ProductType>("DIGITAL");
  const [category, setCategory] = useState<string>(CATEGORIES[0].id);
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [publishNow, setPublishNow] = useState(true);
  const [files, setFiles] = useState<File[]>([]);
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [salePrice, setSalePrice] = useState("");
  const [saleStartsAt, setSaleStartsAt] = useState("");
  const [saleEndsAt, setSaleEndsAt] = useState("");
  const [purchaseLabel, setPurchaseLabel] = useState<string>("Acheter maintenant");
  const [affiliateEnabled, setAffiliateEnabled] = useState(true);
  const [affiliatePercent, setAffiliatePercent] = useState("10");
  const [affiliateInstructions, setAffiliateInstructions] = useState("");
  const [affiliateTerms, setAffiliateTerms] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [promoDiscountPercent, setPromoDiscountPercent] = useState("10");
  const [promoStartsAt, setPromoStartsAt] = useState("");
  const [promoEndsAt, setPromoEndsAt] = useState("");
  const [promoMaxUses, setPromoMaxUses] = useState("");
  const [fileProgress, setFileProgress] = useState<{ name: string; percent: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [generatingCopy, setGeneratingCopy] = useState(false);

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

  const handleFilesChange = (selected: FileList | null) => {
    const nextFiles = Array.from(selected ?? []);
    if (nextFiles.length > MAX_PRODUCT_FILES) {
      toast({
        variant: "destructive",
        title: "Trop de fichiers",
        description: `Vous pouvez joindre ${MAX_PRODUCT_FILES} fichiers au maximum.`,
      });
      return;
    }
    const maxBytes = PRODUCT_FILE_MAX_GB * 1024 * 1024 * 1024;
    const tooLarge = nextFiles.find((selectedFile) => selectedFile.size > maxBytes);
    if (tooLarge) {
      toast({
        variant: "destructive",
        title: "Fichier trop volumineux",
        description: `${tooLarge.name} dépasse la limite de ${PRODUCT_FILE_MAX_GB} Go.`,
      });
      return;
    }
    setFiles(nextFiles);
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

  const generateSalesCopy = async () => {
    if (title.trim().length < 3 || description.trim().length < 10) {
      toast({
        variant: "destructive",
        title: "Informations insuffisantes",
        description: "Ajoutez un titre et quelques caractéristiques vérifiables avant la génération.",
      });
      return;
    }

    setGeneratingCopy(true);
    try {
      const generated = await apiFetch<{ title: string; description: string }>(
        "/api/vendor/ai/sales-page",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            description: description.trim(),
            type,
            category,
            ...(price.trim() ? { priceXOF: Number(price) } : {}),
          }),
        },
      );
      setTitle(generated.title);
      setDescription(generated.description);
      toast({
        title: "Texte généré",
        description: "Relisez et modifiez le contenu avant d’enregistrer ou publier le produit.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Génération impossible",
        description: error instanceof Error ? error.message : "Réessayez dans un instant.",
      });
    } finally {
      setGeneratingCopy(false);
    }
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
    if (type === "DIGITAL" && publishNow && files.length === 0) {
      toast({
        variant: "destructive",
        title: "Fichier numérique requis",
        description: "Ajoutez au moins un fichier à livrer avant de publier.",
      });
      return;
    }
    if (salePrice.trim() && (priceError(salePrice) || Number(salePrice) >= Number(price))) {
      toast({
        variant: "destructive",
        title: "Prix promotionnel invalide",
        description: "Le prix promotionnel doit être inférieur au prix normal.",
      });
      return;
    }
    if (saleStartsAt && saleEndsAt && new Date(saleEndsAt) <= new Date(saleStartsAt)) {
      toast({
        variant: "destructive",
        title: "Période invalide",
        description: "La fin de promotion doit être après son début.",
      });
      return;
    }

    setSubmitting(true);
    const uploadedKeys: string[] = [];
    const uploadedLargeFiles: UploadedProductFile[] = [];
    try {
      for (const selectedFile of files) {
        setFileProgress({ name: selectedFile.name, percent: 0 });
        const uploadedFile = await uploadLargeProductFile(selectedFile, (percent) =>
          setFileProgress({ name: selectedFile.name, percent }),
        );
        uploadedLargeFiles.push(uploadedFile);
      }
      const directImage = image ? await uploadPrivateBlob(image, "product-image") : null;
      if (directImage) uploadedKeys.push(directImage.key);
      const payload = {
        title: title.trim(),
        description: description.trim(),
        type,
        category,
        ...(storeId ? { storeId } : {}),
        priceXOF: Number(price),
        salePriceXOF: salePrice.trim() ? Number(salePrice) : null,
        saleStartsAt: saleStartsAt ? new Date(saleStartsAt).toISOString() : null,
        saleEndsAt: saleEndsAt ? new Date(saleEndsAt).toISOString() : null,
        purchaseLabel,
        affiliateEnabled,
        affiliatePercent: Number(affiliatePercent),
        affiliateInstructions: affiliateInstructions.trim(),
        affiliateTerms: affiliateTerms.trim(),
        promoCode: promoCode.trim().toUpperCase() || undefined,
        promoDiscountPercent: promoCode.trim() ? Number(promoDiscountPercent) : undefined,
        promoStartsAt: promoStartsAt ? new Date(promoStartsAt).toISOString() : undefined,
        promoEndsAt: promoEndsAt ? new Date(promoEndsAt).toISOString() : undefined,
        promoMaxUses: promoMaxUses.trim() ? Number(promoMaxUses) : undefined,
        status: publishNow ? "PUBLISHED" : "DRAFT",
        ...(type === "PHYSICAL" ? { stock: Number(stock || "0") } : {}),
        files: uploadedLargeFiles,
      };
      if (image && !directImage) {
        const formData = new FormData();
        Object.entries(payload).forEach(([key, value]) => {
          if (key === "files") formData.set(key, JSON.stringify(value));
          else if (value !== undefined && value !== null) formData.set(key, String(value));
        });
        formData.set("image", image);
        await apiFetch("/api/products", { method: "POST", body: formData });
      } else {
        await apiFetch("/api/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, image: directImage }),
        });
      }

      toast({
        title: "Produit créé",
        description: publishNow
          ? "Votre produit est en ligne dans votre boutique."
          : "Votre produit a été enregistré en brouillon.",
      });
      onCreated();
    } catch (error) {
      await cleanupPrivateBlobs(uploadedKeys);
      for (const uploadedFile of uploadedLargeFiles) {
        try {
          await discardLargeProductFile(uploadedFile.key);
        } catch (cleanupError) {
          console.error(`Impossible de supprimer le fichier temporaire ${uploadedFile.name}:`, cleanupError);
        }
      }
      toast({
        variant: "destructive",
        title: "Création impossible",
        description: error instanceof Error ? error.message : "Réessayez dans un instant.",
      });
    } finally {
      setFileProgress(null);
      setSubmitting(false);
    }
  };

  return (
    <Card className="mt-6">
      <CardContent className="p-5 sm:p-6">
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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="product-description">Description et points forts</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void generateSalesCopy()}
                disabled={
                  generatingCopy ||
                  submitting ||
                  title.trim().length < 3 ||
                  description.trim().length < 10
                }
              >
                {generatingCopy ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Sparkles className="size-4" aria-hidden="true" />
                )}
                {generatingCopy ? "Génération…" : "Améliorer avec l’IA"}
              </Button>
            </div>
            <Textarea
              id="product-description"
              rows={6}
              maxLength={4000}
              placeholder={"À qui s'adresse ce produit ? Quel problème résout-il ?\nQue contient-il et quels sont ses avantages ?"}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Renseignez des faits vérifiables. Le texte généré reste modifiable et ne sera publié qu&apos;après votre validation.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="product-type">Type *</Label>
              <Select
                value={type}
                onValueChange={(value) => {
                  const nextType = value as ProductType;
                  setType(nextType);
                  if (nextType !== "DIGITAL") setFiles([]);
                }}
              >
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

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="product-sale-price">Prix promotionnel (FCFA, facultatif)</Label>
              <Input
                id="product-sale-price"
                type="number"
                min={0}
                step={100}
                value={salePrice}
                onChange={(event) => setSalePrice(event.target.value)}
                className="h-11"
                placeholder="Ex. 3 500"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-button-label">Texte du bouton d&apos;achat</Label>
              <Select value={purchaseLabel} onValueChange={setPurchaseLabel}>
                <SelectTrigger id="product-button-label" className="h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRODUCT_PURCHASE_LABELS.map((label) => (
                    <SelectItem key={label} value={label}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="product-sale-start">Début de la promotion (facultatif)</Label>
              <Input id="product-sale-start" type="datetime-local" value={saleStartsAt} onChange={(event) => setSaleStartsAt(event.target.value)} className="h-11" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-sale-end">Fin de la promotion (facultatif)</Label>
              <Input id="product-sale-end" type="datetime-local" value={saleEndsAt} onChange={(event) => setSaleEndsAt(event.target.value)} className="h-11" />
            </div>
          </div>

          <div className="space-y-3 rounded-xl border p-4">
            <div>
              <p className="font-medium">Affiliation</p>
              <p className="text-xs text-muted-foreground">Autorisez les membres à promouvoir ce produit contre une commission que vous financez.</p>
            </div>
            <div className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="product-promo-code">Code promotionnel (facultatif)</Label>
                <Input id="product-promo-code" maxLength={40} value={promoCode} onChange={(event) => setPromoCode(event.target.value.toUpperCase())} placeholder="EXEMPLE10" className="h-11 uppercase" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="product-promo-discount">Réduction du code (%)</Label>
                <Input id="product-promo-discount" type="number" min={1} max={90} value={promoDiscountPercent} onChange={(event) => setPromoDiscountPercent(event.target.value)} className="h-11" disabled={!promoCode.trim()} />
              </div>
            </div>
            <div className="grid gap-4 rounded-xl border p-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="product-promo-start">Début du code</Label>
                <Input id="product-promo-start" type="datetime-local" value={promoStartsAt} onChange={(event) => setPromoStartsAt(event.target.value)} className="h-11" disabled={!promoCode.trim()} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="product-promo-end">Fin du code</Label>
                <Input id="product-promo-end" type="datetime-local" value={promoEndsAt} onChange={(event) => setPromoEndsAt(event.target.value)} className="h-11" disabled={!promoCode.trim()} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="product-promo-uses">Nombre max. d&apos;utilisations</Label>
                <Input id="product-promo-uses" type="number" min={1} max={1000000} value={promoMaxUses} onChange={(event) => setPromoMaxUses(event.target.value)} className="h-11" disabled={!promoCode.trim()} placeholder="Illimité" />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="product-affiliate-percent">Commission affilié (%)</Label>
                <Input id="product-affiliate-percent" type="number" min={1} max={50} value={affiliatePercent} onChange={(event) => setAffiliatePercent(event.target.value)} className="h-11" />
              </div>
              <div className="flex items-center justify-between gap-4 rounded-lg bg-muted/50 p-3">
                <Label htmlFor="product-affiliate-enabled" className="cursor-pointer">Autoriser l&apos;affiliation</Label>
                <Switch id="product-affiliate-enabled" checked={affiliateEnabled} onCheckedChange={setAffiliateEnabled} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Gain affilié estimé : {formatXOF(Math.floor((Number(price) || 0) * (Number(affiliatePercent) || 0) / 100))} par vente confirmée, avant les éventuels frais configurés.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="product-affiliate-instructions">Instructions de promotion (facultatif)</Label>
                <Textarea
                  id="product-affiliate-instructions"
                  maxLength={1200}
                  rows={3}
                  value={affiliateInstructions}
                  onChange={(event) => setAffiliateInstructions(event.target.value)}
                  disabled={!affiliateEnabled}
                  placeholder="Arguments, public visé, informations à mettre en avant…"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="product-affiliate-terms">Conditions d&apos;affiliation (facultatif)</Label>
                <Textarea
                  id="product-affiliate-terms"
                  maxLength={1200}
                  rows={3}
                  value={affiliateTerms}
                  onChange={(event) => setAffiliateTerms(event.target.value)}
                  disabled={!affiliateEnabled}
                  placeholder="Règles particulières applicables aux promotions."
                />
              </div>
            </div>
          </div>

          {type === "DIGITAL" && (
            <div className="space-y-2">
              <Label htmlFor="product-file">Fichiers à livrer (jusqu&apos;à {MAX_PRODUCT_FILES}, {PRODUCT_FILE_MAX_GB} Go chacun)</Label>
              <Input
                id="product-file"
                type="file"
                accept={DIGITAL_ACCEPT}
                multiple
                onChange={(e) => handleFilesChange(e.target.files)}
                className="h-11 file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:text-sm file:text-primary-foreground"
              />
              <p className="text-xs text-muted-foreground">Formats acceptés : PDF, ZIP, MP3, MP4, APK, EPUB. Les fichiers sont envoyés directement vers le stockage sécurisé.</p>
              {files.length > 0 && (
                <ul className="space-y-2">
                  {files.map((selectedFile) => (
                    <li key={`${selectedFile.name}-${selectedFile.size}`} className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2 text-xs">
                      <span className="min-w-0 truncate">{selectedFile.name}</span>
                      <span className="shrink-0 text-muted-foreground">{formatBytes(selectedFile.size)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {fileProgress && (
                <div className="space-y-1" aria-live="polite">
                  <div className="flex justify-between gap-2 text-xs text-muted-foreground">
                    <span className="truncate">Envoi de {fileProgress.name}</span>
                    <span>{fileProgress.percent} %</span>
                  </div>
                  <progress className="h-2 w-full accent-primary" max={100} value={fileProgress.percent} />
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="product-image">Visuel de couverture (max {IMAGE_MAX_MB} Mo)</Label>
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

          <div className="flex items-center justify-end gap-2 border-t pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigateTo("#/dashboard/produits")}
              disabled={submitting}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Enregistrement…" : "Créer le produit"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/* ---------------------------------- ÉDITION ---------------------------------- */

function ProductEditForm({
  product,
  onSaved,
}: {
  product: VendorProduct;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [title, setTitle] = useState(product.title);
  const [description, setDescription] = useState(product.description ?? "");
  const [category, setCategory] = useState<string>(product.category);
  const [price, setPrice] = useState(String(product.priceXOF));
  const [salePrice, setSalePrice] = useState(product.salePriceXOF == null ? "" : String(product.salePriceXOF));
  const [saleStartsAt, setSaleStartsAt] = useState(dateToLocalInput(product.saleStartsAt));
  const [saleEndsAt, setSaleEndsAt] = useState(dateToLocalInput(product.saleEndsAt));
  const [purchaseLabel, setPurchaseLabel] = useState(product.purchaseLabel ?? "Acheter maintenant");
  const [affiliateEnabled, setAffiliateEnabled] = useState(product.affiliateEnabled ?? true);
  const [affiliatePercent, setAffiliatePercent] = useState(String(product.affiliatePercent ?? 10));
  const [affiliateInstructions, setAffiliateInstructions] = useState(product.affiliateInstructions ?? "");
  const [affiliateTerms, setAffiliateTerms] = useState(product.affiliateTerms ?? "");
  const [stock, setStock] = useState(product.stock === null ? "" : String(product.stock));
  const [status, setStatus] = useState<ProductStatus>(product.status);
  const [submitting, setSubmitting] = useState(false);

  const handleSave = async () => {
    const priceProblem = priceError(price);
    if (priceProblem) {
      toast({ variant: "destructive", title: "Prix invalide", description: priceProblem });
      return;
    }
    if (salePrice.trim() && (priceError(salePrice) || Number(salePrice) >= Number(price))) {
      toast({ variant: "destructive", title: "Prix promotionnel invalide", description: "Le prix promotionnel doit être inférieur au prix normal." });
      return;
    }
    if (saleStartsAt && saleEndsAt && new Date(saleEndsAt) <= new Date(saleStartsAt)) {
      toast({ variant: "destructive", title: "Période invalide", description: "La fin de promotion doit être après son début." });
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
        salePriceXOF: salePrice.trim() ? Number(salePrice) : null,
        saleStartsAt: saleStartsAt ? new Date(saleStartsAt).toISOString() : null,
        saleEndsAt: saleEndsAt ? new Date(saleEndsAt).toISOString() : null,
        purchaseLabel,
        affiliateEnabled,
        affiliatePercent: Number(affiliatePercent),
        affiliateInstructions: affiliateInstructions.trim(),
        affiliateTerms: affiliateTerms.trim(),
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
    <Card className="mt-6">
      <CardContent className="space-y-4 p-5 sm:p-6">
        <div className="rounded-lg border bg-muted/40 p-3 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <Paperclip className="size-4 text-primary" aria-hidden="true" />
            {product.files?.length
              ? `${product.files.length} fichier(s) numérique(s)`
              : product.fileName ?? "Aucun fichier numérique"}
          </p>
          {product.files?.length ? (
            <ul className="mt-2 space-y-1">
              {product.files.map((file) => (
                <li key={file.id} className="flex justify-between gap-3 text-xs text-muted-foreground">
                  <span className="truncate">{file.name}</span>
                  <span className="shrink-0">{formatBytes(file.size)}</span>
                </li>
              ))}
            </ul>
          ) : product.fileSize ? (
            <p className="mt-1 text-xs text-muted-foreground">Taille : {formatBytes(product.fileSize)}</p>
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
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="edit-sale-price">Prix promotionnel (FCFA, facultatif)</Label>
              <Input id="edit-sale-price" type="number" min={0} step={100} value={salePrice} onChange={(event) => setSalePrice(event.target.value)} className="h-11" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-button-label">Texte du bouton</Label>
              <Select value={purchaseLabel} onValueChange={setPurchaseLabel}>
                <SelectTrigger id="edit-button-label" className="h-11 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRODUCT_PURCHASE_LABELS.map((label) => <SelectItem key={label} value={label}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="edit-sale-start">Début de promotion</Label>
              <Input id="edit-sale-start" type="datetime-local" value={saleStartsAt} onChange={(event) => setSaleStartsAt(event.target.value)} className="h-11" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-sale-end">Fin de promotion</Label>
              <Input id="edit-sale-end" type="datetime-local" value={saleEndsAt} onChange={(event) => setSaleEndsAt(event.target.value)} className="h-11" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="edit-affiliate-percent">Commission affilié (%)</Label>
              <Input id="edit-affiliate-percent" type="number" min={1} max={50} value={affiliatePercent} onChange={(event) => setAffiliatePercent(event.target.value)} className="h-11" />
            </div>
            <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
              <Label htmlFor="edit-affiliate-enabled">Autoriser l&apos;affiliation</Label>
              <Switch id="edit-affiliate-enabled" checked={affiliateEnabled} onCheckedChange={setAffiliateEnabled} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="edit-affiliate-instructions">Instructions de promotion</Label>
              <Textarea id="edit-affiliate-instructions" maxLength={1200} rows={3} value={affiliateInstructions} onChange={(event) => setAffiliateInstructions(event.target.value)} disabled={!affiliateEnabled} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-affiliate-terms">Conditions d&apos;affiliation</Label>
              <Textarea id="edit-affiliate-terms" maxLength={1200} rows={3} value={affiliateTerms} onChange={(event) => setAffiliateTerms(event.target.value)} disabled={!affiliateEnabled} />
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
            Pour changer le fichier numérique ou l&apos;image, supprimez ce produit et recréez-le
            (possible tant qu&apos;il n&apos;a pas de commande payée).
          </p>

          <div className="flex items-center justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={onSaved} disabled={submitting}>
              Annuler
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Enregistrement…
                </>
              ) : (
                "Enregistrer"
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
