// Témoignages de vendeurs affichés sur la page d'accueil (section « Témoignages »).
// Source unique partagée client/serveur :
// - liste par défaut (identique au modèle validé par le propriétaire) ;
// - parsing défensif du JSON stocké dans PlatformSettings.testimonialsJson
//   (null → défauts ; [] explicite → section masquée ; entrées invalides filtrées).
// Modifiable depuis Admin → Réglages → Témoignages, synchronisation automatique.

export const TESTIMONIAL_COLORS = [
  "blue",
  "teal",
  "purple",
  "red",
  "green",
  "amber",
  "pink",
] as const;

export type TestimonialColor = (typeof TESTIMONIAL_COLORS)[number];

export type Testimonial = {
  quote: string;
  name: string;
  role: string;
  location: string;
  badge: string;
  color: TestimonialColor;
  stars: number; // 1 à 5
};

// Classes de présentation par couleur — carte d'accueil ET aperçu admin.
// (classes statiques requises par Tailwind : aucune construction dynamique)
export const TESTIMONIAL_STYLE: Record<
  TestimonialColor,
  { avatar: string; badge: string }
> = {
  blue: {
    avatar: "bg-blue-600 text-white",
    badge:
      "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300",
  },
  teal: {
    avatar: "bg-teal-600 text-white",
    badge:
      "border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-500/30 dark:bg-teal-500/10 dark:text-teal-300",
  },
  purple: {
    avatar: "bg-purple-600 text-white",
    badge:
      "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-500/30 dark:bg-purple-500/10 dark:text-purple-300",
  },
  red: {
    avatar: "bg-red-600 text-white",
    badge:
      "border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300",
  },
  green: {
    avatar: "bg-green-600 text-white",
    badge:
      "border-green-200 bg-green-50 text-green-700 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300",
  },
  amber: {
    avatar: "bg-amber-500 text-white",
    badge:
      "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
  },
  pink: {
    avatar: "bg-pink-600 text-white",
    badge:
      "border-pink-200 bg-pink-50 text-pink-700 dark:border-pink-500/30 dark:bg-pink-500/10 dark:text-pink-300",
  },
};

// Liste par défaut — fidèle au modèle validé (page d'accueil BILLOGRAPH).
export const DEFAULT_TESTIMONIALS: Testimonial[] = [
  {
    quote:
      "J'ai vendu mon premier ebook en moins de 24 heures après mon inscription. La génération automatique de la page de vente m'a fait gagner une semaine de travail.",
    name: "Aïcha B.",
    role: "Auteure",
    location: "Cotonou, Bénin",
    badge: "Guide business digital",
    color: "blue",
    stars: 5,
  },
  {
    quote:
      "Le tunnel IA a compris que pour une formation à 75 000 FCFA, il fallait construire la confiance avec des preuves et une garantie. Mon taux de conversion a doublé.",
    name: "Kwame O.",
    role: "Formateur",
    location: "Abidjan, Côte d'Ivoire",
    badge: "Formation marketing IA",
    color: "teal",
    stars: 5,
  },
  {
    quote:
      "Enfin une plateforme qui propose MTN MoMo et Moov Money nativement. Mes clients à Lomé payent en 3 clics depuis leur téléphone, sans friction.",
    name: "Fatou D.",
    role: "Coach business",
    location: "Lomé, Togo",
    badge: "Template Notion créateur",
    color: "purple",
    stars: 5,
  },
  {
    quote:
      "J'apprécie surtout la transparence sur les commissions. Je sais exactement combien BILLOGRAPH prélève, combien part en frais de paiement et combien me reste. Rien n'est caché.",
    name: "Yao K.",
    role: "Consultant",
    location: "Abidjan, Côte d'Ivoire",
    badge: "Coaching 1-on-1",
    color: "red",
    stars: 5,
  },
];

const isColor = (value: unknown): value is TestimonialColor =>
  (TESTIMONIAL_COLORS as readonly string[]).includes(String(value));

const clampStars = (value: unknown): number => {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 5;
  return Math.min(5, Math.max(1, n));
};

const text = (value: unknown, max: number): string =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

// Normalise un élément inconnu en témoignage valide (null si incomplet).
function normalize(raw: unknown): Testimonial | null {
  if (typeof raw !== "object" || raw === null) return null;
  const item = raw as Record<string, unknown>;
  const quote = text(item.quote, 500);
  const name = text(item.name, 80);
  const role = text(item.role, 120);
  const location = text(item.location, 120);
  const badge = text(item.badge, 60);
  if (!quote || !name || !role || !location || !badge) return null;
  return {
    quote,
    name,
    role,
    location,
    badge,
    color: isColor(item.color) ? item.color : "blue",
    stars: clampStars(item.stars ?? 5),
  };
}

// Parse la valeur stockée en base :
// - null / absent / JSON illisible / pas un tableau → liste par défaut ;
// - entrées invalides → filtrées ;
// - tableau vide explicite [] → [] (la section est masquée sur l'accueil).
export function parseTestimonials(raw: string | null | undefined): Testimonial[] {
  if (raw === null || raw === undefined || raw.trim() === "") return DEFAULT_TESTIMONIALS;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_TESTIMONIALS;
    return parsed.map(normalize).filter((t): t is Testimonial => t !== null);
  } catch {
    return DEFAULT_TESTIMONIALS;
  }
}

// Initiales de l'avatar, déduites du nom (« Aïcha B. » → AB, « Kwame O. » → KO).
export function deriveInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}
