"use client";

// VUE ACCUEIL (#/) : hero, bande de confiance, fonctionnalités, comment ça marche,
// profils de vendeurs, avis de la communauté, CTA final.
// TOUS LES TEXTES PRINCIPAUX proviennent des Paramètres (admin) et se
// synchronisent automatiquement (useSiteSettings — polling + focus +
// invalidation après enregistrement). La commission affichée est celle
// réellement configurée (ex : 8 %).

import {
  Banknote,
  BarChart3,
  BookOpen,
  Coins,
  FileArchive,
  GraduationCap,
  Music4,
  Package,
  Percent,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Store as StoreIcon,
  Wand2,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { authorInitials } from "@/lib/site-content";
import { goToFeatures, navigateTo } from "./lib/use-hash-route";
import { useSiteSettings } from "./lib/site-data";
import { ReviewsSection } from "./reviews-section";
import type { User } from "@/types/api";

const FEATURES = [
  {
    icon: StoreIcon,
    title: "Boutique personnalisable",
    description:
      "Votre nom, votre description, votre couleur d'accent. Une adresse dédiée à partager partout : WhatsApp, réseaux sociaux, flyers.",
  },
  {
    icon: Zap,
    title: "Livraison automatique des fichiers",
    description:
      "Ebooks, formations, APK, musiques : dès le paiement, votre client reçoit un lien de téléchargement sécurisé, valable 30 jours.",
  },
  {
    icon: Package,
    title: "Produits physiques & stock",
    description:
      "Vendez aussi des articles matériels. Le stock est décrémenté automatiquement à chaque commande, sans survente possible.",
  },
  {
    icon: Banknote,
    title: "Paiements africains en FCFA",
    description:
      "Encaissez en FCFA par Mobile Money (MTN MoMo, Moov) et cartes bancaires via FedaPay — confirmations en temps réel et livraison automatique.",
  },
  {
    icon: BarChart3,
    title: "Tableau de bord temps réel",
    description:
      "Revenus, commandes, top produits, graphique des 30 derniers jours : vous suivez votre activité d'un seul coup d'œil.",
  },
  {
    icon: ShieldCheck,
    title: "Accès client sécurisé 30 jours",
    description:
      "Chaque achat génère un lien unique, limité à 5 téléchargements et protégé contre le partage abusif. La tranquillité, tout simplement.",
  },
];

const STEPS = [
  {
    number: "01",
    title: "Créez votre boutique",
    description:
      "Deux minutes suffisent : nom, description, couleur. Aucun code, aucune carte bancaire requise pour démarrer.",
  },
  {
    number: "02",
    title: "Publiez vos produits",
    description:
      "Numériques (PDF, ZIP, MP3, MP4, APK) ou physiques avec stock. Fixez votre prix en FCFA, publiez en un clic.",
  },
  {
    number: "03",
    title: "Encaissez en FCFA",
    description:
      "Partagez le lien de votre boutique. Chaque vente est tracée, la commission est claire, vos fichiers partent tout seuls.",
  },
];

const AUDIENCES = [
  {
    icon: BookOpen,
    title: "Auteurs & ebooks",
    description: "Vendez vos guides, romans et PDF techniques sans imprimeur ni intermédiaire.",
  },
  {
    icon: GraduationCap,
    title: "Formateurs",
    description: "Distribuez vos formations, supports de cours et enregistrements en automatique.",
  },
  {
    icon: Smartphone,
    title: "Développeurs",
    description: "Monétisez vos APK, scripts et outils logiciels avec des liens sécurisés.",
  },
  {
    icon: FileArchive,
    title: "Créateurs de fichiers",
    description: "Modèles, templates, packs de ressources : livrez vos archives en un lien.",
  },
  {
    icon: Music4,
    title: "Artistes",
    description: "Vendez vos sons, beats et contenus audio à votre communauté directement.",
  },
  {
    icon: Package,
    title: "Commerçants",
    description: "Produits physiques avec gestion de stock et suivi des livraisons inclus.",
  },
];

type LandingProps = {
  user: User | null;
};

export function Landing({ user }: LandingProps) {
  // Réglages auto-synchronisés : toute modification dans l'admin se répercute
  // ici automatiquement (15 s max, ou instantané après enregistrement).
  const { settings } = useSiteSettings();

  const trustItems = [
    { icon: Coins, value: "0 FCFA", label: "pour démarrer, sans abonnement" },
    {
      icon: Percent,
      value: `${settings.commissionPercent} %`,
      label: "de commission par vente, tout compris — frais de paiement inclus",
    },
    { icon: Banknote, value: "FCFA", label: "devise native, montants en CFA" },
    {
      icon: Smartphone,
      value: "Mobile Money & cartes",
      label: "Paiements sécurisés en FCFA via FedaPay",
    },
  ];

  return (
    <div>
      {/* HERO */}
      <section className="relative overflow-hidden border-b bg-gradient-to-b from-primary/10 via-accent/30 to-background">
        {/* Décor futuriste (CSS pur) — couches purement décoratives, ignorées par les lecteurs d'écran */}
        <div className="futuristic-aurora" aria-hidden="true" />
        <div className="futuristic-grid" aria-hidden="true" />
        <div
          aria-hidden="true"
          className="animate-float pointer-events-none absolute left-[7%] top-24 hidden size-20 rounded-full bg-primary/20 blur-2xl sm:block"
        />
        <div
          aria-hidden="true"
          className="animate-float pointer-events-none absolute bottom-20 right-[9%] hidden size-14 rounded-full bg-amber-600/25 blur-xl sm:block"
          style={{ animationDelay: "-3.2s" }}
        />
        <Sparkles
          aria-hidden="true"
          className="animate-float pointer-events-none absolute right-[13%] top-28 hidden size-6 text-primary/50 md:block"
          style={{ animationDelay: "-1.7s" }}
        />
        <div className="relative mx-auto max-w-6xl px-4 py-20 text-center sm:py-28">
          <img
            src="/brand/logo-full.png"
            alt="Logo BILLOGRAPH — la plateforme qui facilite la vente des produits en Afrique francophone"
            width={512}
            height={512}
            className="animate-fade-up mx-auto h-24 w-24 rounded-2xl shadow-lg sm:h-32 sm:w-32"
          />
          <Badge variant="outline" className="animate-pulse-glow mt-8 h-7 gap-1.5 border-primary/30 bg-primary/5 px-3 text-primary">
            <Sparkles className="size-3.5" aria-hidden="true" />
            {settings.siteTagline}
          </Badge>
          <h1
            className="animate-fade-up mx-auto mt-6 max-w-3xl text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl"
            style={{ animationDelay: "120ms" }}
          >
            <span className="text-shimmer">{settings.heroTitle}</span>
          </h1>
          <p
            className="animate-fade-up mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg"
            style={{ animationDelay: "220ms" }}
          >
            {settings.heroSubtitle}
          </p>
          <div
            className="animate-fade-up mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
            style={{ animationDelay: "320ms" }}
          >
            <Button size="lg" className="btn-glow h-12 w-full px-8 text-base sm:w-auto" onClick={() => navigateTo("#/auth")}>
              Créer ma boutique gratuitement
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-12 w-full px-8 text-base sm:w-auto"
              onClick={goToFeatures}
            >
              Découvrir les fonctionnalités
            </Button>
          </div>
          <p
            className="animate-fade-up mt-4 text-xs text-muted-foreground"
            style={{ animationDelay: "420ms" }}
          >
            Sans carte bancaire · Sans abonnement · Commission uniquement sur les ventes
          </p>
        </div>
      </section>

      {/* BANDE DE CONFIANCE */}
      <section className="border-b bg-card" aria-label="Chiffres clés">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-8 lg:grid-cols-4">
          {trustItems.map((item, index) => (
            <div
              key={item.label}
              className="animate-fade-up flex items-center gap-3"
              style={{ animationDelay: `${index * 90}ms` }}
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <item.icon className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="font-bold leading-tight">{item.value}</p>
                <p className="text-xs leading-snug text-muted-foreground">{item.label}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FONCTIONNALITÉS */}
      <section id="features" className="scroll-mt-20 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="animate-fade-up mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              {settings.featuresTitle}
            </h2>
            <p className="mt-4 text-muted-foreground">
              {settings.featuresSubtitle}
            </p>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature, index) => (
              <Card
                key={feature.title}
                className="glow-card animate-fade-up transition-shadow hover:shadow-md"
                style={{ animationDelay: `${index * 90}ms` }}
              >
                <CardContent className="p-6">
                  <span className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <feature.icon className="size-5.5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-4 text-lg font-semibold">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* COMMENT ÇA MARCHE */}
      <section className="border-y bg-muted/40 py-16 sm:py-20" aria-label="Comment ça marche">
        <div className="mx-auto max-w-6xl px-4">
          <div className="animate-fade-up mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Comment ça marche</h2>
            <p className="mt-4 text-muted-foreground">
              Trois étapes, aucune compétence technique requise.
            </p>
          </div>
          <ol className="mt-12 grid gap-8 sm:grid-cols-3 sm:gap-6">
            {STEPS.map((step, index) => (
              <li
                key={step.number}
                className="animate-fade-up relative flex flex-col items-center text-center"
                style={{ animationDelay: `${index * 120}ms` }}
              >
                <span
                  className="animate-pulse-glow flex size-16 items-center justify-center rounded-full bg-primary text-xl font-bold text-primary-foreground shadow-md"
                  style={{ animationDelay: `${index * 450}ms` }}
                >
                  {step.number}
                </span>
                <h3 className="mt-5 text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
                  {step.description}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* POUR QUI ? */}
      <section className="py-16 sm:py-20" aria-label="Pour qui">
        <div className="mx-auto max-w-6xl px-4">
          <div className="animate-fade-up mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              {settings.audienceTitle}
            </h2>
            <p className="mt-4 text-muted-foreground">
              {settings.audienceSubtitle}
            </p>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {AUDIENCES.map((audience, index) => (
              <div
                key={audience.title}
                className="glow-card animate-fade-up flex items-start gap-4 rounded-xl border bg-card p-5 transition-colors hover:border-primary/40"
                style={{ animationDelay: `${index * 80}ms` }}
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  <audience.icon className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <h3 className="font-semibold">{audience.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{audience.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AVIS DE LA COMMUNAUTÉ — réels, modérés, déposés en page */}
      <ReviewsSection
        title={settings.reviewsTitle}
        subtitle={settings.reviewsSubtitle}
        userName={user?.name ?? null}
      />

      {/* AUTEUR DU SITE — présentation brève, modifiable dans l'admin */}
      <section
        id="auteur"
        className="scroll-mt-20 border-t bg-muted/40 py-16 sm:py-20"
        aria-label="À propos de l'auteur"
      >
        <div className="mx-auto max-w-6xl px-4">
          <div className="animate-fade-up mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              À propos de l&apos;auteur
            </h2>
          </div>
          <Card className="glow-card animate-fade-up mx-auto mt-10 max-w-2xl">
            <CardContent className="p-8 text-center sm:p-10">
              <span
                aria-hidden="true"
                className="animate-pulse-glow mx-auto flex size-20 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground shadow-md"
              >
                {authorInitials(settings.authorName)}
              </span>
              <h3 className="mt-5 text-xl font-bold tracking-tight sm:text-2xl">
                {settings.authorName}
              </h3>
              {settings.authorRole ? (
                <Badge variant="outline" className="mt-3 border-primary/30 bg-primary/5 px-3 text-primary">
                  {settings.authorRole}
                </Badge>
              ) : null}
              {settings.authorBio ? (
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
                  {settings.authorBio}
                </p>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="pb-20 pt-4" aria-label="Appel à l'action final">
        <div className="mx-auto max-w-6xl px-4">
          <div className="border-beam animate-fade-up rounded-3xl bg-primary px-6 py-14 text-center text-primary-foreground shadow-lg">
            <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary-foreground/15">
              <Wand2 className="size-6" aria-hidden="true" />
            </span>
            <h2 className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl">
              {settings.ctaTitle}
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-primary-foreground/85">
              {settings.ctaText}
            </p>
            <Button
              size="lg"
              variant="secondary"
              className="mt-8 h-12 px-8 text-base"
              onClick={() => navigateTo("#/auth")}
            >
              Créer ma boutique gratuitement
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
