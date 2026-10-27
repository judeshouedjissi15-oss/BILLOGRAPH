// Schémas de validation Zod — la validation est TOUJOURS refaite côté serveur.
import { z } from "zod";
import {
  PRODUCT_MAX_PRICE,
  PRODUCT_MIN_PRICE,
  MIN_WITHDRAWAL_XOF,
} from "@/lib/constants";

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Le nom doit contenir au moins 2 caractères").max(80),
  email: z.string().trim().toLowerCase().email("Email invalide").max(160),
  password: z.string().min(8, "Le mot de passe doit contenir au moins 8 caractères").max(128),
});

// CONNEXION : l'identifiant est tolérant (email OU identifiant propriétaire
// comme « HJBILEDE@05 ») — pas de validation .email() ici, la vérification se
// fait en base avec le mot de passe. Message d'échec générique côté route.
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(3, "Identifiant requis").max(160),
  password: z.string().min(1, "Mot de passe requis"),
});

// Challenge admin à deux codes secrets : le client renvoie le token opaque
// reçu du serveur + le code de l'étape courante. Aucune indication sur les
// codes attendus — la vérification est 100 % serveur.
export const adminChallengeSchema = z.object({
  token: z.string().trim().min(32, "Token invalide").max(128),
  code: z.string().trim().min(1, "Code requis").max(120),
});

export const storeCreateSchema = z.object({
  name: z.string().trim().min(2, "Nom de boutique requis").max(80),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Slug invalide (lettres minuscules, chiffres et tirets)")
    .min(3)
    .max(60)
    .optional(),
  description: z.string().trim().max(600).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Couleur hexadécimale attendue (ex: #0B7A6B)")
    .optional(),
  phone: z.string().trim().max(30).optional(),
});

export const productCreateSchema = z.object({
  title: z.string().trim().min(3, "Titre requis (3 caractères minimum)").max(120),
  description: z.string().trim().max(4000).optional(),
  type: z.enum(["DIGITAL", "PHYSICAL"]),
  category: z.string().trim().max(40).default("autre"),
  priceXOF: z
    .number()
    .int("Le prix doit être un entier (FCFA)")
    .min(PRODUCT_MIN_PRICE)
    .max(PRODUCT_MAX_PRICE),
  status: z.enum(["DRAFT", "PUBLISHED"]).default("DRAFT"),
  stock: z.number().int().min(0).max(1_000_000).optional(),
});

export const productUpdateSchema = productCreateSchema.partial().extend({
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
});

export const checkoutSchema = z.object({
  slug: z.string().trim().min(1),
  quantity: z.number().int().min(1).max(20).default(1),
  customer: z.object({
    name: z.string().trim().min(2, "Nom requis").max(80),
    email: z.string().trim().toLowerCase().email("Email invalide"),
    phone: z.string().trim().max(30).optional(),
  }),
  paymentMethod: z.string().trim().min(2).max(30).default("FEDAPAY"),
});

// Le rôle ADMIN n'est jamais attribuable via cette API : le compte propriétaire
// est le seul administrateur (désigné en base).
export const adminUserUpdateSchema = z.object({
  role: z.enum(["CLIENT", "VENDEUR"]).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
});

// Mise à jour des réglages plateforme — partielle : au moins un champ requis.
// Les secrets FedaPay sont nullable : null = effacer la valeur stockée. Les
// valeurs ne sont JAMAIS journalisées dans l'audit (seulement la liste des
// champs modifiés).
// CONTENU DU SITE : chaque champ texte est nullable — null/chaîne vide =
// retour à la valeur par défaut du code (voir src/lib/site-content.ts).
// Les URLs de réseaux sociaux doivent être http(s) si renseignées.
export const optionalText = (max: number) =>
  z.string().trim().max(max).transform((v) => (v === "" ? null : v)).nullable().optional();

export const optionalUrl = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((v) => v === "" || /^https?:\/\/\S+\.\S+/.test(v), "URL invalide (http(s)://…)")
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

export const optionalEmail = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Adresse email invalide")
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

export const adminSettingsUpdateSchema = z
  .object({
    commissionPercent: z.number().int().min(0).max(50).optional(),
    siteName: z.string().trim().min(2, "Nom du site requis (2 caractères minimum)").max(40).optional(),
    siteTagline: optionalText(80),
    heroTitle: optionalText(140),
    heroSubtitle: optionalText(400),
    featuresTitle: optionalText(120),
    featuresSubtitle: optionalText(400),
    audienceTitle: optionalText(120),
    audienceSubtitle: optionalText(400),
    reviewsTitle: optionalText(120),
    reviewsSubtitle: optionalText(400),
    ctaTitle: optionalText(120),
    ctaText: optionalText(400),
    contactEmail: optionalEmail(160),
    contactPhone: optionalText(30),
    whatsappNumber: optionalText(30),
    socialFacebook: optionalUrl(300),
    socialInstagram: optionalUrl(300),
    socialTiktok: optionalUrl(300),
    socialYoutube: optionalUrl(300),
    socialTwitter: optionalUrl(300),
    footerText: optionalText(600),
    // Présentation de l'auteur du site (page d'accueil + pied de page).
    authorName: optionalText(80),
    authorRole: optionalText(120),
    authorBio: optionalText(600),
    reviewsAutoPublish: z.boolean().optional(),
    fedapaySecretKey: z
      .string()
      .trim()
      .max(200)
      .nullable()
      .optional()
      // Garde-fou anti-erreur courante : FedaPay fournit DEUX clés (publique pk_…
      // et secrète sk_…). Seule la clé secrète est utilisée par BILLOGRAPH — une
      // clé publique collée ici ferait échouer tous les paiements silencieusement.
      .refine(
        (value) =>
          value === undefined || value === null || value === "" || !value.startsWith("pk_"),
        {
          message:
            "Ceci est la CLÉ PUBLIQUE FedaPay (pk_…), qui n'est pas utilisée par BILLOGRAPH. Le champ « Clé secrète API » attend la clé secrète commençant par sk_ (sk_sandbox_… ou sk_live_…).",
        },
      )
      .refine(
        (value) =>
          value === undefined || value === null || value === "" || value.startsWith("sk_"),
        {
          message:
            "La clé secrète FedaPay commence par sk_ (sk_sandbox_… ou sk_live_…). Copiez-la depuis votre dashboard FedaPay → API.",
        },
      ),
    fedapayWebhookSecret: z.string().trim().max(300).nullable().optional(),
    fedapayEnvironment: z.enum(["sandbox", "live"]).nullable().optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "Au moins un champ à mettre à jour est requis",
  });

// DÉPÔT D'AVIS (public) — modéré par l'admin avant publication
// (sauf si reviewsAutoPublish est activé dans Paramètres).
export const reviewCreateSchema = z.object({
  name: z.string().trim().min(2, "Votre nom est requis (2 caractères minimum)").max(60),
  role: z.string().trim().max(60).optional(),
  city: z.string().trim().max(60).optional(),
  rating: z
    .number()
    .int()
    .min(1, "Note requise (1 à 5 étoiles)")
    .max(5, "La note maximale est 5"),
  content: z
    .string()
    .trim()
    .min(10, "Votre avis doit contenir au moins 10 caractères")
    .max(600, "600 caractères maximum"),
});

// MODÉRATION D'AVIS (admin) — approuver ou rejeter. La suppression passe par
// DELETE /api/admin/reviews/:id.
export const adminReviewUpdateSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
});

// Vérification de paiement par référence (POST /api/payments/verify).
export const paymentVerifySchema = z.object({
  reference: z.string().trim().min(4).max(30),
});

// DEMANDE DE RETRAIT VENDEUR — montant entier FCFA (minimum plateforme),
// destination = numéro Mobile Money ou coordonnées bancaires.
export const withdrawalRequestSchema = z.object({
  amountXOF: z
    .number()
    .int("Le montant doit être un entier (FCFA)")
    .min(MIN_WITHDRAWAL_XOF, `Le retrait minimum est de ${MIN_WITHDRAWAL_XOF} FCFA`)
    .max(50_000_000, "Montant de retrait trop élevé"),
  method: z.enum(["MOBILE_MONEY", "BANK_TRANSFER"]),
  destination: z
    .string()
    .trim()
    .min(6, "Destination requise (numéro ou coordonnées bancaires)")
    .max(120),
});

// DÉCISION ADMIN SUR UN RETRAIT :
//  - approve    : PENDING → APPROVED (pré-validation avant transfert)
//  - mark_paid  : PENDING/APPROVED → PAID (référence du transfert réel requise)
//  - reject     : PENDING/APPROVED → REJECTED (motif requis, fonds libérés)
export const withdrawalDecisionSchema = z.object({
  action: z.enum(["approve", "mark_paid", "reject"]),
  providerRef: z.string().trim().max(120).optional(),
  adminNote: z.string().trim().max(500).optional(),
});

// CONFIRMATION D'EMAIL — consommation du lien reçu par le compte.
export const verifyEmailSchema = z.object({
  token: z.string().trim().min(32, "Lien de confirmation invalide").max(128),
});

// VÉRIFICATION PAR CODE — l'utilisateur saisit le code à 6 chiffres reçu par
// email. À succès, le serveur confirme le compte ET ouvre la session
// (redirection directe vers le tableau de bord).
export const verifyCodeSchema = z.object({
  email: z.string().trim().toLowerCase().email("Email invalide").max(160),
  code: z.string().trim().regex(/^\d{6}$/, "Le code de confirmation doit contenir exactement 6 chiffres"),
});

// RENVOI DE L'EMAIL DE CONFIRMATION (réponse générique côté route — pas
// d'énumération d'emails).
export const resendVerificationSchema = z.object({
  email: z.string().trim().toLowerCase().email("Email invalide").max(160),
});

// CONFIGURATION SMTP RÉELLE (admin) — le mot de passe est chiffré avant
// stockage ; un envoi de test vérifie la configuration avec un email réel.
export const smtpConfigSchema = z.object({
  host: z.string().trim().min(3, "Serveur SMTP requis").max(160),
  port: z.number().int().min(1).max(65535).default(587),
  secure: z.boolean().default(false), // true = SSL/TLS direct (465), false = STARTTLS
  user: z.string().trim().min(3, "Utilisateur SMTP requis").max(160),
  password: z.string().max(200).optional(), // vide = conserver le mot de passe existant
  fromName: z.string().trim().min(2, "Nom d'expéditeur requis").max(80),
  fromEmail: z.string().trim().email("Adresse d'expédition invalide").max(160),
  siteUrl: z
    .string()
    .trim()
    .max(200)
    .refine((v) => v === "" || /^https?:\/\/.+/.test(v), "URL invalide (https://…)")
    .optional(),
});

// CONFIGURATION BREVO (admin) — API transactionnelle recommandée : une clé
// API `xkeysib-…` suffit, sans serveur SMTP à régler. La clé est chiffrée
// avant stockage ; vide = conserver la clé existante. Garde-fous anti-erreur
// (même esprit que la clé FedaPay) : une pk_/sk_ FedaPay ou un mot de passe
// SMTP ne doit jamais passer pour une clé Brevo.
export const brevoConfigSchema = z.object({
  provider: z.literal("brevo"),
  brevoApiKey: z
    .string()
    .trim()
    .max(200)
    .optional()
    .refine(
      (v) => v == null || v === "" || v.startsWith("xkeysib-"),
      "Une clé API Brevo commence toujours par « xkeysib-… ». Ceci n'est pas une clé Brevo — copiez la clé API dans Brevo → SMTP & API → Clés API.",
    )
    .refine(
      (v) => v == null || v === "" || (!v.startsWith("pk_") && !v.startsWith("sk_")),
      "Ceci est une clé FedaPay (pk_… / sk_…), qui sert aux paiements — pas aux emails. Collez ici votre clé API Brevo (elle commence par xkeysib-…).",
    ),
  fromName: z.string().trim().min(2, "Nom d'expéditeur requis").max(80),
  fromEmail: z.string().trim().email("Adresse d'expédition invalide").max(160),
  siteUrl: z
    .string()
    .trim()
    .max(200)
    .refine((v) => v === "" || /^https?:\/\/.+/.test(v), "URL invalide (https://…)")
    .optional(),
});

// Union acceptée par PATCH /api/admin/smtp : le fournisseur est déduit du
// champ `provider` (« brevo ») — tout le reste = SMTP générique.
export const emailConfigSchema = z.union([brevoConfigSchema, smtpConfigSchema]);

export const smtpTestSchema = z.object({
  to: z.string().trim().email("Adresse de test invalide").max(160),
});

// « Mon profil » — informations personnelles de base (le rôle et le statut ne
// sont PAS modifiables ici — seul l'administrateur gère les statuts).
export const profileUpdateSchema = z.object({
  name: z.string().trim().min(2, "Le nom doit contenir au moins 2 caractères").max(80),
  phone: optionalText(30),
  // PROFIL PUBLIC — personnalisation libre du profil vendeur (et de tout compte).
  headline: optionalText(120),
  bio: optionalText(2000),
  city: optionalText(120),
});

// Changement de mot de passe : l'actuel est requis (preuve d'identité),
// le nouveau suit les mêmes règles qu'à l'inscription.
export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, "Mot de passe actuel requis").max(128),
  newPassword: z.string().min(8, "Le nouveau mot de passe doit contenir au moins 8 caractères").max(128),
});
