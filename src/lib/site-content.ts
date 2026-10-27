// CONTENU PAR DÉFAUT DU SITE — source unique partagée client & serveur.
// Les champs modifiables depuis Paramètres (admin) sont nullables en base :
// null = on retombe sur ces valeurs par défaut. Modifier ces valeurs via
// l'administration se synchronise automatiquement sur tout le site (polling
// + revalidation au focus + invalidation après enregistrement).

export const SITE_NAME_DEFAULT = "BILLOGRAPH";
// AUTEUR DU SITE — présenté brièvement sur la page d'accueil et dans le pied
// de page. Description strictement factuelle, modifiable depuis Paramètres
// (admin) sans toucher au code.
export const AUTHOR_NAME_DEFAULT = "HOUEDJISSI Judes B.";
export const AUTHOR_ROLE_DEFAULT = "Fondateur de BILLOGRAPH";
export const AUTHOR_BIO_DEFAULT =
  "Créateur de BILLOGRAPH, la plateforme e-commerce pensée pour le Bénin et l'Afrique francophone : vendre ses produits numériques et physiques, encaisser en FCFA et livrer ses clients automatiquement.";
// MODÈLE ÉCONOMIQUE : la commission est TOTALE et TOUT COMPRIS — elle couvre
// l'ensemble des frais de la transaction, y compris les frais du prestataire
// de paiement (FedaPay). Le vendeur ne paie aucun frais supplémentaire et
// reçoit (100 − commission) % du prix de vente.
export const COMMISSION_DEFAULT = 10;

// Valeurs par défaut des textes de la page d'accueil et du pied de page.
export const SITE_DEFAULTS = {
  siteName: SITE_NAME_DEFAULT,
  siteTagline: "Nouveau · Made in Bénin",
  heroTitle: "Vendez vos produits numériques en toute simplicité",
  heroSubtitle:
    "BILLOGRAPH crée votre boutique en ligne en deux minutes. Livrez automatiquement vos fichiers numériques, gérez votre stock physique et encaissez en FCFA — pensé pour le Bénin et l'Afrique francophone.",
  featuresTitle: "Tout ce qu'il faut pour vendre",
  featuresSubtitle:
    "Une plateforme complète, du fichier à la notification de vente. Concentrez-vous sur votre contenu, BILLOGRAPH s'occupe du reste.",
  audienceTitle: "Pensé pour les créateurs d'ici",
  audienceSubtitle:
    "Du Cotonou à Parakou, BILLOGRAPH accompagne tous ceux qui créent de la valeur.",
  reviewsTitle: "Ils vendent déjà avec BILLOGRAPH",
  reviewsSubtitle:
    "Auteurs, formateurs et créateurs qui encaissent en FCFA, du Cotonou à Abidjan.",
  ctaTitle: "Prêt à ouvrir votre boutique ?",
  ctaText:
    "Rejoignez les vendeurs qui digitalisent leur activité en FCFA. Gratuit pour commencer, en ligne en deux minutes.",
  footerText:
    "La plateforme e-commerce des entrepreneurs du Bénin et d'Afrique francophone. Vendez vos produits numériques et physiques, encaissez en FCFA.",
  authorName: AUTHOR_NAME_DEFAULT,
  authorRole: AUTHOR_ROLE_DEFAULT,
  authorBio: AUTHOR_BIO_DEFAULT,
} as const;

// Type du contenu renvoyé par GET /api/settings (défauts déjà appliqués
// pour les textes ; les contacts/réseaux peuvent être null = masqués).
export type SiteSettings = {
  siteName: string;
  commissionPercent: number;
  siteTagline: string;
  heroTitle: string;
  heroSubtitle: string;
  featuresTitle: string;
  featuresSubtitle: string;
  audienceTitle: string;
  audienceSubtitle: string;
  reviewsTitle: string;
  reviewsSubtitle: string;
  ctaTitle: string;
  ctaText: string;
  contactEmail: string | null;
  contactPhone: string | null;
  whatsappNumber: string | null;
  socialFacebook: string | null;
  socialInstagram: string | null;
  socialTiktok: string | null;
  socialYoutube: string | null;
  socialTwitter: string | null;
  footerText: string;
  authorName: string;
  authorRole: string;
  authorBio: string;
  reviewsAutoPublish: boolean;
};

// Valeurs de repli instantanées (pendant le premier chargement ou si l'API
// est indisponible) — le rendu ne casse jamais et reste sans décalage.
export const SITE_FALLBACK: SiteSettings = {
  ...SITE_DEFAULTS,
  commissionPercent: COMMISSION_DEFAULT,
  contactEmail: null,
  contactPhone: null,
  whatsappNumber: null,
  socialFacebook: null,
  socialInstagram: null,
  socialTiktok: null,
  socialYoutube: null,
  socialTwitter: null,
  reviewsAutoPublish: false,
};

// Initiales de l'avatar auteur : 1ʳᵉ lettre des deux premiers mots (ex :
// « HOUEDJISSI Judes B. » → « HJ »). Repli générique si nom absent.
export function authorInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "B";
  const first = words[0]?.charAt(0) ?? "";
  const second = words.length > 1 ? words[1]?.charAt(0) ?? "" : "";
  return `${first}${second}`.toUpperCase() || "B";
}

// Palette des avatars d'avis (initiales colorées, sans bleu/indigo).
export const REVIEW_AVATAR_CLASSES = [
  "bg-emerald-600",
  "bg-teal-600",
  "bg-violet-600",
  "bg-rose-600",
  "bg-amber-600",
  "bg-orange-600",
] as const;

export function reviewAvatarClass(index: number): string {
  return REVIEW_AVATAR_CLASSES[index % REVIEW_AVATAR_CLASSES.length];
}
