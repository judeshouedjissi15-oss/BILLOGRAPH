"use client";

import { useEffect, useState } from "react";
import { Copy, Link2, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "../lib/api-client";
import type { VendorProduct } from "@/types/api";

const SOURCES = [
  { value: "facebook", label: "Facebook" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "google", label: "Google" },
  { value: "email", label: "Email" },
  { value: "other", label: "Autre" },
];

export function CampaignLinksTab() {
  const { toast } = useToast();
  const [products, setProducts] = useState<VendorProduct[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [source, setSource] = useState("facebook");
  const [medium, setMedium] = useState("social");
  const [campaign, setCampaign] = useState("");
  const [content, setContent] = useState("");
  const [term, setTerm] = useState("");
  const [campaignUrl, setCampaignUrl] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ products: VendorProduct[] }>("/api/products/mine")
      .then((data) => {
        if (cancelled) return;
        const published = data.products.filter((product) => product.status === "PUBLISHED");
        setProducts(published);
        setSelectedProductId(published[0]?.id ?? "");
      })
      .catch((error) => {
        if (!cancelled) toast({
          variant: "destructive",
          title: "Produits indisponibles",
          description: error instanceof Error ? error.message : "Impossible de charger vos produits.",
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [toast]);

  const selectedProduct = products.find((product) => product.id === selectedProductId);

  const generateLink = () => {
    if (!selectedProduct) {
      toast({ variant: "destructive", title: "Choisissez un produit", description: "Publiez d'abord un produit pour créer son lien de campagne." });
      return;
    }
    if (!campaign.trim()) {
      toast({ variant: "destructive", title: "Nom de campagne requis", description: "Donnez un nom à votre campagne pour pouvoir mesurer ses résultats." });
      return;
    }
    const params = new URLSearchParams({
      utm_source: source.trim().toLowerCase(),
      utm_medium: medium.trim().toLowerCase() || "social",
      utm_campaign: campaign.trim(),
    });
    if (content.trim()) params.set("utm_content", content.trim());
    if (term.trim()) params.set("utm_term", term.trim());
    const link = window.location.origin + "/#/produit/" + encodeURIComponent(selectedProduct.slug) + "?" + params.toString();
    setCampaignUrl(link);
  };

  const copyLink = async () => {
    if (!campaignUrl) return;
    try {
      await navigator.clipboard.writeText(campaignUrl);
      toast({ title: "Lien copié", description: "Vous pouvez maintenant le partager sur vos réseaux." });
    } catch {
      toast({ variant: "destructive", title: "Copie impossible", description: "Sélectionnez le lien puis copiez-le manuellement." });
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <Card>
        <CardHeader>
          <CardTitle>Créer un lien de campagne</CardTitle>
          <CardDescription>
            Créez un lien différent pour Facebook, WhatsApp, TikTok ou vos publicités. BILLOGRAPH attribuera les commandes payées à la bonne source.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="campaign-product">Produit publié</Label>
              <select id="campaign-product" className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm" value={selectedProductId} onChange={(event) => { setSelectedProductId(event.target.value); setCampaignUrl(""); }} disabled={loading || products.length === 0}>
                {products.length === 0 ? <option value="">Aucun produit publié</option> : products.map((product) => <option key={product.id} value={product.id}>{product.title}</option>)}
              </select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="campaign-source">Source</Label>
                <select id="campaign-source" className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm" value={source} onChange={(event) => { setSource(event.target.value); setCampaignUrl(""); }}>
                  {SOURCES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="campaign-medium">Type de trafic</Label>
                <Input id="campaign-medium" value={medium} maxLength={120} onChange={(event) => { setMedium(event.target.value); setCampaignUrl(""); }} placeholder="social, cpc, email…" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="campaign-name">Nom de la campagne *</Label>
              <Input id="campaign-name" value={campaign} maxLength={180} onChange={(event) => { setCampaign(event.target.value); setCampaignUrl(""); }} placeholder="Ex. lancement-novembre-2026" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="campaign-content">Version du contenu (facultatif)</Label>
                <Input id="campaign-content" value={content} maxLength={180} onChange={(event) => { setContent(event.target.value); setCampaignUrl(""); }} placeholder="Ex. video-1, affiche-A" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="campaign-term">Mot-clé (facultatif)</Label>
                <Input id="campaign-term" value={term} maxLength={180} onChange={(event) => { setTerm(event.target.value); setCampaignUrl(""); }} placeholder="Ex. ebook-marketing" />
              </div>
            </div>
            <Button type="button" className="h-11" onClick={generateLink} disabled={loading || products.length === 0}>
              <Link2 className="size-4" aria-hidden="true" />
              Générer mon lien
            </Button>
            {campaignUrl && (
              <div className="space-y-2 rounded-xl border bg-muted/30 p-4">
                <Label htmlFor="campaign-generated-link">Lien de campagne</Label>
                <Input id="campaign-generated-link" value={campaignUrl} readOnly className="h-11 font-mono text-xs" onFocus={(event) => event.currentTarget.select()} />
                <Button type="button" variant="outline" onClick={() => void copyLink()}>
                  <Copy className="size-4" aria-hidden="true" />
                  Copier le lien
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Megaphone className="size-5" aria-hidden="true" />Mesure des campagnes</CardTitle>
          <CardDescription>Comment exploiter les liens de suivi.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>1. Choisissez le produit que vous souhaitez promouvoir.</p>
          <p>2. Sélectionnez la source où vous publierez le lien.</p>
          <p>3. Donnez un nom à votre campagne et générez le lien.</p>
          <p>4. Utilisez ce lien uniquement pour cette campagne.</p>
          <p>Les commandes payées apparaîtront dans « Origine des ventes » sur votre vue d&apos;ensemble.</p>
        </CardContent>
      </Card>
    </div>
  );
}
