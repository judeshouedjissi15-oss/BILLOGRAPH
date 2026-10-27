"use client";

// ONGLET PARAMÈTRES (espace administrateur) — TOUT LE CONTENU MODIFIABLE DU SITE :
// - Général : commission plateforme, nom du site, slogan, texte de pied de page.
// - Page d'accueil : badge, titre et sous-titre du héros, titres et sous-titres
//   des sections (fonctionnalités, pour qui, avis), bloc CTA final.
// - Contact & réseaux : email, téléphone, WhatsApp, Facebook, Instagram,
//   TikTok, YouTube, X (Twitter).
// - Avis : publication automatique (sans modération) ou modération manuelle.
// À CHAQUE ENREGISTREMENT : invalidation de la requête « site-settings » →
// synchronisation IMMÉDIATE sur tout le site (landing, header, footer…) sans
// rechargement ; les autres visiteurs sont mis à jour en ~15 s max (polling).
// Un champ laissé vide = retour à la valeur par défaut (placeholder affiché).

import { useCallback, useEffect, useState } from "react";
import { Home, LifeBuoy, MessageSquareQuote, PenLine, Save, Settings, ShieldCheck, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "../lib/api-client";
import { invalidateSiteSettings } from "../lib/site-data";
import { SITE_DEFAULTS } from "@/lib/site-content";
import { SmtpSettingsCard } from "./smtp-settings-card";
import type { AdminPaymentsInfo, PlatformSettingsInfo } from "@/types/api";

// Champs texte éditables regroupés par carte. `textarea` = champ multiligne.
type TextField = {
  key: keyof PlatformSettingsInfo;
  label: string;
  placeholder: string;
  textarea?: boolean;
  hint?: string;
};

const HOME_FIELDS: TextField[] = [
  {
    key: "siteTagline",
    label: "Badge au-dessus du titre",
    placeholder: SITE_DEFAULTS.siteTagline,
  },
  {
    key: "heroTitle",
    label: "Titre principal (héros)",
    placeholder: SITE_DEFAULTS.heroTitle,
    textarea: true,
  },
  {
    key: "heroSubtitle",
    label: "Sous-titre du héros",
    placeholder: SITE_DEFAULTS.heroSubtitle,
    textarea: true,
  },
  {
    key: "featuresTitle",
    label: "Titre — section fonctionnalités",
    placeholder: SITE_DEFAULTS.featuresTitle,
  },
  {
    key: "featuresSubtitle",
    label: "Sous-titre — section fonctionnalités",
    placeholder: SITE_DEFAULTS.featuresSubtitle,
    textarea: true,
  },
  {
    key: "audienceTitle",
    label: "Titre — section « Pour qui ? »",
    placeholder: SITE_DEFAULTS.audienceTitle,
  },
  {
    key: "audienceSubtitle",
    label: "Sous-titre — section « Pour qui ? »",
    placeholder: SITE_DEFAULTS.audienceSubtitle,
    textarea: true,
  },
  {
    key: "reviewsTitle",
    label: "Titre — section avis",
    placeholder: SITE_DEFAULTS.reviewsTitle,
  },
  {
    key: "reviewsSubtitle",
    label: "Sous-titre — section avis",
    placeholder: SITE_DEFAULTS.reviewsSubtitle,
    textarea: true,
  },
  {
    key: "ctaTitle",
    label: "Titre — bloc d'appel à l'action final",
    placeholder: SITE_DEFAULTS.ctaTitle,
  },
  {
    key: "ctaText",
    label: "Texte — bloc d'appel à l'action final",
    placeholder: SITE_DEFAULTS.ctaText,
    textarea: true,
  },
];

const AUTHOR_FIELDS: TextField[] = [
  {
    key: "authorName",
    label: "Nom de l'auteur",
    placeholder: SITE_DEFAULTS.authorName,
    hint: "Affiché sur la page d'accueil et dans le pied de page.",
  },
  {
    key: "authorRole",
    label: "Rôle / titre affiché",
    placeholder: SITE_DEFAULTS.authorRole,
  },
  {
    key: "authorBio",
    label: "Brève description de l'auteur",
    placeholder: SITE_DEFAULTS.authorBio,
    textarea: true,
    hint: "Quelques phrases qui présentent l'auteur du site. Vide = description par défaut.",
  },
];

const CONTACT_FIELDS: TextField[] = [
  {
    key: "contactEmail",
    label: "Email de contact",
    placeholder: "contact@billograph.bj",
    hint: "Affiché dans le pied de page (cliquable). Vide = masqué.",
  },
  {
    key: "contactPhone",
    label: "Téléphone affiché",
    placeholder: "+229 01 97 00 00 00",
    hint: "Affiché dans le pied de page (cliquable). Vide = masqué.",
  },
  {
    key: "whatsappNumber",
    label: "Numéro WhatsApp",
    placeholder: "+2290197000000",
    hint: "Format international. Un lien wa.me est généré dans le pied de page. Vide = masqué.",
  },
];

const SOCIAL_FIELDS: TextField[] = [
  { key: "socialFacebook", label: "Facebook", placeholder: "https://facebook.com/votre-page" },
  { key: "socialInstagram", label: "Instagram", placeholder: "https://instagram.com/votre-compte" },
  { key: "socialTiktok", label: "TikTok", placeholder: "https://tiktok.com/@votre-compte" },
  { key: "socialYoutube", label: "YouTube", placeholder: "https://youtube.com/@votre-chaine" },
  { key: "socialTwitter", label: "X (Twitter)", placeholder: "https://x.com/votre-compte" },
];

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: TextField;
  value: string;
  onChange: (value: string) => void;
}) {
  if (field.textarea) {
    return (
      <Textarea
        id={`settings-${field.key}`}
        rows={2}
        maxLength={600}
        placeholder={field.placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-16 resize-y"
      />
    );
  }
  return (
    <Input
      id={`settings-${field.key}`}
      type={field.key === "contactEmail" ? "email" : field.key === "whatsappNumber" || field.key === "contactPhone" ? "tel" : "text"}
      maxLength={300}
      placeholder={field.placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-11"
    />
  );
}

function FieldGroup({
  title,
  icon: Icon,
  description,
  fields,
  form,
  onChange,
}: {
  title: string;
  icon: LucideIcon;
  description: string;
  fields: TextField[];
  form: Record<string, string>;
  onChange: (key: keyof PlatformSettingsInfo, value: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="size-5 text-primary" aria-hidden="true" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {fields.map((field) => (
          <div key={field.key} className="space-y-2">
            <Label htmlFor={`settings-${field.key}`}>{field.label}</Label>
            <FieldInput field={field} value={form[field.key] ?? ""} onChange={(v) => onChange(field.key, v)} />
            {field.hint ? <p className="text-xs text-muted-foreground">{field.hint}</p> : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function SettingsTab({ readOnly = false }: { readOnly?: boolean } = {}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [commission, setCommission] = useState("");
  const [siteName, setSiteName] = useState("");
  const [footerText, setFooterText] = useState("");
  const [autoPublish, setAutoPublish] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await apiFetch<{ settings: PlatformSettingsInfo; payments: AdminPaymentsInfo }>(
        "/api/admin/settings",
      );
      const s = data.settings;
      setCommission(String(s.commissionPercent));
      setSiteName(s.siteName);
      setFooterText(s.footerText ?? "");
      setAutoPublish(s.reviewsAutoPublish);
      const next: Record<string, string> = {};
      for (const field of [...HOME_FIELDS, ...AUTHOR_FIELDS, ...CONTACT_FIELDS, ...SOCIAL_FIELDS]) {
        next[field.key] = (s[field.key] as string | null) ?? "";
      }
      setForm(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de charger les paramètres.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  const handleChange = (key: keyof PlatformSettingsInfo, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const commissionValue = Number.parseInt(commission, 10);
    if (!Number.isInteger(commissionValue) || commissionValue < 0 || commissionValue > 50) {
      toast({
        variant: "destructive",
        title: "Commission invalide",
        description: "Saisissez un nombre entier entre 0 et 50.",
      });
      return;
    }
    if (siteName.trim().length < 2) {
      toast({
        variant: "destructive",
        title: "Nom du site invalide",
        description: "Le nom du site doit contenir au moins 2 caractères.",
      });
      return;
    }

    setSaving(true);
    try {
      const data = await apiFetch<{ settings: PlatformSettingsInfo; payments: AdminPaymentsInfo }>(
        "/api/admin/settings",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            commissionPercent: commissionValue,
            siteName: siteName.trim(),
            reviewsAutoPublish: autoPublish,
            footerText,
            ...form, // chaîne vide = retour à la valeur par défaut (côté serveur)
          }),
        },
      );

      // SYNCHRONISATION IMMÉDIATE : tous les composants abonnés (landing,
      // header, footer…) se re-rendent instantanément.
      invalidateSiteSettings();

      toast({
        title: "Paramètres enregistrés",
        description: `Commission : ${data.settings.commissionPercent} %. Le site entier est synchronisé automatiquement.`,
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Enregistrement impossible",
        description: err instanceof Error ? err.message : "Réessayez dans un instant.",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Skeleton className="h-96 rounded-xl" aria-busy="true" />;
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" onClick={() => void load()}>
            Réessayer
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* GÉNÉRAL */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="size-5 text-primary" aria-hidden="true" />
            Général
          </CardTitle>
          <CardDescription>
            Identité de la plateforme et règle de rémunération. La commission est une
            commission <strong>tout compris</strong> : elle couvre les frais de paiement
            (FedaPay), le vendeur ne paie aucun frais supplémentaire. Elle ne s&apos;applique
            qu&apos;aux nouvelles commandes payées.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="settings-commission">Commission plateforme totale (%)</Label>
              <Input
                id="settings-commission"
                type="number"
                min={0}
                max={50}
                step={1}
                required
                value={commission}
                onChange={(e) => setCommission(e.target.value)}
                className="h-11"
              />
              <p className="text-xs text-muted-foreground">
                Commission tout compris prélevée sur chaque commande payée (0 à 50) : elle inclut
                les frais de paiement (FedaPay) — le vendeur reçoit le reste, sans frais
                supplémentaire. Actuel : {commission} %.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="settings-site-name">Nom du site</Label>
              <Input
                id="settings-site-name"
                type="text"
                minLength={2}
                maxLength={40}
                required
                placeholder={SITE_DEFAULTS.siteName}
                value={siteName}
                onChange={(e) => setSiteName(e.target.value)}
                className="h-11"
              />
              <p className="text-xs text-muted-foreground">
                Affiché dans le pied de page (© ligne). Vide interdit.
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="settings-footer-text">Texte de marque (pied de page)</Label>
            <Textarea
              id="settings-footer-text"
              rows={2}
              maxLength={600}
              placeholder={SITE_DEFAULTS.footerText}
              value={footerText}
              onChange={(e) => setFooterText(e.target.value)}
              className="min-h-16 resize-y"
            />
            <p className="text-xs text-muted-foreground">
              Description sous le logo dans le pied de page.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* PAGE D'ACCUEIL */}
      <FieldGroup
        title="Page d'accueil — textes"
        icon={Home}
        description="Tous les textes principaux de la page d'accueil. Laissez vide pour revenir au texte par défaut (affiché en gris dans chaque champ)."
        fields={HOME_FIELDS}
        form={form}
        onChange={handleChange}
      />

      {/* AUTEUR DU SITE */}
      <FieldGroup
        title="Auteur du site"
        icon={PenLine}
        description="Présentation de l'auteur affichée sur la page d'accueil et dans le pied de page. Laissez vide pour revenir au texte par défaut."
        fields={AUTHOR_FIELDS}
        form={form}
        onChange={handleChange}
      />

      {/* CONTACT & RÉSEAUX */}
      <FieldGroup
        title="Contact & réseaux sociaux"
        icon={LifeBuoy}
        description="Coordonnées et liens affichés dans le pied de page. Un champ vide masque l'élément correspondant."
        fields={[...CONTACT_FIELDS, ...SOCIAL_FIELDS]}
        form={form}
        onChange={handleChange}
      />

      {/* AVIS */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquareQuote className="size-5 text-primary" aria-hidden="true" />
            Avis de la communauté
          </CardTitle>
          <CardDescription>
            Les visiteurs déposent leurs avis depuis la page d&apos;accueil.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-start justify-between gap-4 rounded-lg border bg-muted/40 p-4">
            <div>
              <Label htmlFor="settings-auto-publish" className="font-medium">
                Publication automatique des avis
              </Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Activé : chaque avis est publié immédiatement. Désactivé (recommandé) : les avis
                attendent votre validation dans l&apos;onglet « Avis ».
              </p>
            </div>
            <Switch
              id="settings-auto-publish"
              checked={autoPublish}
              onCheckedChange={setAutoPublish}
              aria-label="Publication automatique des avis"
            />
          </div>
        </CardContent>
      </Card>

      {/* ENREGISTRER */}
      <div className="sticky bottom-4 z-10 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
          <p className="text-xs text-muted-foreground">
            À l&apos;enregistrement, tout le site se synchronise automatiquement — aucun
            rechargement nécessaire.
          </p>
          <Button type="submit" className="h-11 shrink-0" disabled={saving || readOnly}>
            <Save className="size-4" aria-hidden="true" />
            {saving ? "Enregistrement et synchronisation…" : "Enregistrer et synchroniser"}
          </Button>
        </div>
      </div>
    </form>
  );
}

// Wrapper : la carte SMTP est en dehors du formulaire principal (formulaires séparés).
export function SettingsTabWithSmtp({ readOnly = false }: { readOnly?: boolean } = {}) {
  return (
    <div className="space-y-6">
      <SettingsTab />
      <SmtpSettingsCard />
    </div>
  );
}
