// BILLOGRAPH — Constantes métier partagées (client & serveur)

export const ROLES = {
  CLIENT: "CLIENT",
  VENDEUR: "VENDEUR",
  ADMIN: "ADMIN",
} as const;
export type Role = keyof typeof ROLES;

export const USER_STATUSES = ["ACTIVE", "SUSPENDED"] as const;

export const PRODUCT_TYPES = ["DIGITAL", "PHYSICAL"] as const;
export const PRODUCT_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;

export const ORDER_STATUSES = [
  "PENDING",
  "PAID",
  "FAILED",
  "CANCELLED",
  "REFUNDED",
  "DELIVERED",
] as const;

export const PAYMENT_STATUSES = ["INITIATED", "PENDING", "SUCCESS", "FAILED"] as const;

export const STORE_STATUSES = ["ACTIVE", "SUSPENDED"] as const;

// Moyens de paiement affichés au client. FedaPay est l'unique prestataire
// d'encaissement réel (Mobile Money Bénin + cartes, devise XOF) — les produits
// gratuits ne passent par aucun prestataire (provider "FREE" côté serveur).
export const PAYMENT_METHODS = [
  { id: "FEDAPAY", label: "Mobile Money & Carte bancaire", note: "MTN MoMo, Moov Money, Visa / Mastercard — paiement sécurisé via FedaPay" },
] as const;
export type PaymentMethodId = (typeof PAYMENT_METHODS)[number]["id"];

export const CATEGORIES = [
  { id: "ebook", label: "Ebooks & guides" },
  { id: "formation", label: "Formations" },
  { id: "logiciel", label: "Logiciels & APK" },
  { id: "fichier", label: "Fichiers numériques" },
  { id: "physique", label: "Produits physiques" },
  { id: "autre", label: "Autre" },
] as const;

export const MAX_FILE_SIZE_MB = 25;
export const DOWNLOAD_MAX_COUNT = 5; // téléchargements max par jeton
export const DOWNLOAD_TTL_DAYS = 30; // validité du lien de téléchargement
export const SESSION_TTL_DAYS = 7;

export const PRODUCT_MIN_PRICE = 0; // 0 = produit gratuit autorisé
export const PRODUCT_MAX_PRICE = 10_000_000; // 10 000 000 FCFA

// RETRAITS VENDEUR — le paiement réel du retrait est effectué par la plateforme
// (transfert Mobile Money ou virement) puis consigné par l'administrateur.
export const WITHDRAWAL_STATUSES = ["PENDING", "APPROVED", "PAID", "REJECTED"] as const;
export const WITHDRAWAL_METHODS = [
  { id: "MOBILE_MONEY", label: "Mobile Money (MTN MoMo / Moov Money)" },
  { id: "BANK_TRANSFER", label: "Virement bancaire" },
] as const;
export type WithdrawalMethodId = (typeof WITHDRAWAL_METHODS)[number]["id"];
export const MIN_WITHDRAWAL_XOF = 2_000; // montant minimum de retrait (FCFA)

// NOTIFICATIONS — types affichés par la cloche du header.
export const NOTIFICATION_TYPES = [
  "SALE",
  "PAYMENT",
  "WITHDRAWAL",
  "WITHDRAWAL_REQUEST",
  "SYSTEM",
] as const;
