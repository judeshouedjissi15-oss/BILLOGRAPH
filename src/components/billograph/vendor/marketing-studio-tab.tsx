"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, LoaderCircle, Megaphone, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "../lib/api-client";
import type { VendorProduct } from "@/types/api";

type Format = "FACEBOOK" | "WHATSAPP" | "DESCRIPTION" | "TIKTOK";
type Tone = "PROFESSIONNEL" | "CONVIVIAL" | "PERSUASIF" | "DIRECT";

const FORMATS: { value: Format; label: string; description: string }[] = [
  { value: "FACEBOOK", label: "Publication Facebook", description: "Une publication structurée avec accroche et appel à l'action." },
  { value: "WHATSAPP", label: "Message WhatsApp", description: "Un message court à envoyer à un prospect." },
  { value: "DESCRIPTION", label: "Description commerciale", description: "Un texte détaillé pour présenter et vendre le produit." },
  { value: "TIKTOK", label: "Script vidéo TikTok", description: "Un scénario court, scène par scène, à filmer avec un téléphone." },
];

const TONES: { value: Tone; label: string }[] = [
  { value: "PERSUASIF", label: "Persuasif" },
  { value: "PROFESSIONNEL", label: "Professionnel" },
  { value: "CONVIVIAL", label: "Convivial" },
  { value: "DIRECT", label: "Direct" },
];

export function MarketingStudioTab() {
  const { toast } = useToast();
  const [products, setProducts] = useState<VendorProduct[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [format, setFormat] = useState<Format>("FACEBOOK");
  const [tone, setTone] = useState<Tone>("PERSUASIF");
  const [audience, setAudience] = useState("");
  const [content, setContent] = useState("");
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [productsError, setProductsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiFetch<{ products: VendorProduct[] }>("/api/products/mine");
        if (cancelled) return;
        const available = data.products.filter((product) => product.status !== "ARCHIVED");
        setProducts(available);
        setSelectedProductId(available.find((product) => product.status === "PUBLISHED")?.id ?? available[0]?.id ?? "");
      } catch (loadError) {
        if (!cancelled) {
          setProductsError(loadError instanceof Error ? loadError.message : "Impossible de charger vos produits.");
        }
      } finally {
        if (!cancelled) setLoadingProducts(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === selectedProductId) ?? null,
    [products, selectedProductId],
  );
  const selectedFormat = FORMATS.find((item) => item.value === format) ?? FORMATS[0];

  const generate = async () => {
    if (!selectedProduct || generating) return;
    setGenerating(true);
    setError(null);
    try {
      const result = await apiFetch<{ content: string }>("/api/vendor/marketing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: selectedProduct.id,
          format,
          tone,
          audience: audience.trim() || undefined,
        }),
      });
      setContent(result.content);
      toast({
        title: "Contenu marketing généré",
        description: "Relisez le texte avant de le publier ou de l'envoyer.",
      });
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : "La génération a échoué. Réessayez.");
    } finally {
      setGenerating(false);
    }
  };

  const copyContent = async () => {
    if (!content.trim()) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(content);
      } else {
        const field = document.createElement("textarea");
        field.value = content;
        field.setAttribute("readonly", "");
        field.style.position = "fixed";
        field.style.opacity = "0";
        document.body.appendChild(field);
        field.select();
        const copied = document.execCommand("copy");
        field.remove();
        if (!copied) throw new Error("Copie indisponible dans ce navigateur.");
      }
      toast({
        title: "Contenu copié",
        description: "Vous pouvez maintenant le coller dans votre canal de vente.",
      });
    } catch (copyError) {
      toast({
        variant: "destructive",
        title: "Copie impossible",
        description: copyError instanceof Error ? copyError.message : "Réessayez.",
      });
    }
  };

  if (loadingProducts) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  if (productsError) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
          <p className="text-sm text-destructive">{productsError}</p>
          <Button variant="outline" onClick={() => window.location.reload()}>Recharger</Button>
        </CardContent>
      </Card>
    );
  }

  if (products.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
          <Megaphone className="size-9 text-muted-foreground" aria-hidden="true" />
          <p className="font-semibold">Ajoutez d'abord un produit</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Le Studio marketing crée des contenus à partir des informations de votre catalogue. Créez un produit, même en brouillon, puis revenez ici.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <Megaphone className="size-5 text-primary" aria-hidden="true" />
          <h2 className="text-xl font-semibold tracking-tight">Studio marketing IA</h2>
          <Badge variant="secondary">BILLOGRAPH</Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Transformez les informations d'un produit en contenu prêt à partager. Vous gardez le contrôle avant publication.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Préparer mon contenu</CardTitle>
            <CardDescription>Choisissez un produit et le canal à alimenter.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="marketing-product">Produit</Label>
              <Select
                value={selectedProductId}
                onValueChange={(value) => { setSelectedProductId(value); setContent(""); setError(null); }}
              >
                <SelectTrigger id="marketing-product" className="h-11">
                  <SelectValue placeholder="Choisir un produit" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.title} {product.status === "PUBLISHED" ? "— Publié" : "— Brouillon"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedProduct && (
                <p className="text-xs text-muted-foreground">
                  {selectedProduct.type === "DIGITAL" ? "Produit numérique" : "Produit physique"} · {selectedProduct.category}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="marketing-format">Type de contenu</Label>
              <Select value={format} onValueChange={(value) => { setFormat(value as Format); setContent(""); }}>
                <SelectTrigger id="marketing-format" className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FORMATS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{selectedFormat.description}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="marketing-tone">Ton commercial</Label>
              <Select value={tone} onValueChange={(value) => setTone(value as Tone)}>
                <SelectTrigger id="marketing-tone" className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TONES.map((item) => (
                    <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="marketing-audience">Public cible (facultatif)</Label>
              <Input
                id="marketing-audience"
                value={audience}
                onChange={(event) => setAudience(event.target.value)}
                placeholder="Ex. étudiants, jeunes entrepreneurs..."
                maxLength={240}
                className="h-11"
              />
            </div>

            <Button className="h-11 w-full" onClick={() => void generate()} disabled={!selectedProduct || generating}>
              {generating
                ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                : <Sparkles className="size-4" aria-hidden="true" />}
              {generating ? "Génération en cours…" : content ? "Régénérer le contenu" : "Générer mon contenu"}
            </Button>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <p className="text-xs text-muted-foreground">
              La génération est limitée à 8 demandes par vendeur toutes les 10 minutes. Vérifiez toujours les informations avant publication.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div>
              <CardTitle className="text-base">Votre contenu</CardTitle>
              <CardDescription>Vous pouvez corriger le texte avant de le copier.</CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-10 shrink-0"
              onClick={() => void copyContent()}
              disabled={!content.trim()}
            >
              <Copy className="size-4" aria-hidden="true" />
              Copier
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="Votre contenu généré apparaîtra ici. Choisissez un produit et cliquez sur « Générer mon contenu »."
              rows={18}
              className="min-h-[360px] resize-y leading-relaxed"
              aria-label="Contenu marketing généré"
            />
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>{content.length} caractères</span>
              {content.trim() && (
                <span className="inline-flex items-center gap-1">
                  <Check className="size-3" aria-hidden="true" />
                  Modifiable avant partage
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
