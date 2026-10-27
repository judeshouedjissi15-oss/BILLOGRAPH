// TUNNEL DE VENTE — génération automatique du contenu de la page produit.
// Le vendeur fournit ses informations (accroche, points forts, FAQ, garantie) ;
// BILLOGRAPH génère une page professionnelle. Chaque champ a un repli
// intelligent (par type de produit) : si le vendeur ne renseigne rien, la page
// reste complète, professionnelle et rassurante — zéro effort requis.
// Source unique partagée client (page produit, formulaires vendeur) / serveur (API).

export type TunnelFaqItem = { question: string; answer: string };

const MAX_BENEFITS = 10;
const MAX_BENEFIT_LENGTH = 200;
const MAX_FAQ_ITEMS = 8;

// --- Points forts -----------------------------------------------------------

// Points forts par défaut pour un produit NUMÉRIQUE : ce que la plateforme
// garantit réellement (livraison automatique, jeton 30 j / 5 téléchargements).
function defaultDigitalBenefits(): string[] {
  return [
    "Téléchargement immédiat dès la confirmation du paiement",
    "Lien de téléchargement sécurisé, valable 30 jours (5 téléchargements)",
    "Fichier original fourni par le vendeur, en FCFA et sans abonnement",
  ];
}

// Points forts par défaut pour un produit PHYSIQUE.
function defaultPhysicalBenefits(): string[] {
  return [
    "Produit soigneusement préparé par le vendeur",
    "Livraison organisée directement avec le vendeur après paiement",
    "Paiement sécurisé en FCFA, confirmation immédiate",
  ];
}

// Parse la valeur stockée (JSON array de chaînes) — entrées invalides filtrées.
export function parseBenefits(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => (typeof item === "string" ? item.trim().slice(0, MAX_BENEFIT_LENGTH) : ""))
      .filter((item): item is string => item.length > 0)
      .slice(0, MAX_BENEFITS);
  } catch {
    return [];
  }
}

// Points forts affichés : ceux du vendeur (tableau déjà parsé par l'API),
// sinon les points forts par défaut.
export function resolveBenefits(
  type: string,
  benefits: string[] | null | undefined,
): string[] {
  const items = (benefits ?? [])
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, MAX_BENEFITS);
  if (items.length > 0) return items;
  return type === "PHYSICAL" ? defaultPhysicalBenefits() : defaultDigitalBenefits();
}

// --- FAQ --------------------------------------------------------------------

// FAQ par défaut : réponses honnêtes basées sur le fonctionnement réel
// (paiement FedaPay en FCFA, livraison automatique des fichiers, référence
// de commande traçable, support vendeur).
export function defaultFaq(type: string, storeName: string): TunnelFaqItem[] {
  const items: TunnelFaqItem[] = [
    {
      question: "Comment vais-je recevoir mon achat ?",
      answer:
        type === "PHYSICAL"
          ? `Dès votre paiement confirmé, ${storeName} reçoit votre commande avec votre contact et organise la livraison avec vous.`
          : "Dès la confirmation du paiement, votre lien de téléchargement sécurisé est activé immédiatement et reste valable 30 jours (5 téléchargements).",
    },
    {
      question: "Quels moyens de paiement sont acceptés ?",
      answer:
        "MTN MoMo, Moov Money et cartes bancaires (Visa / Mastercard), en FCFA. Le paiement est traité par un prestataire sécurisé, jamais par le vendeur directement.",
    },
    {
      question: "Le paiement est-il vraiment sécurisé ?",
      answer:
        "Oui. Votre paiement passe par une page de paiement sécurisée et chaque commande possède une référence unique (BLG-…) traçable par le vendeur et la plateforme.",
    },
    {
      question: "Que faire en cas de problème ?",
      answer:
        "Contactez le vendeur avec votre référence de commande : il voit votre achat dans son tableau de bord et peut vous assister. La plateforme suit chaque transaction.",
    },
  ];
  return type === "PHYSICAL"
    ? items
    : [
        items[0],
        items[1],
        items[2],
        {
          question: "Que se passe-t-il si je perds mon fichier ?",
          answer:
            "Retournez sur votre page de commande (lien reçu) : votre téléchargement sécurisé reste accessible 30 jours, jusqu'à 5 fois.",
        },
        items[3],
      ];
}

export function parseFaq(raw: string | null | undefined): TunnelFaqItem[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const items: TunnelFaqItem[] = [];
    for (const entry of parsed) {
      if (typeof entry !== "object" || entry === null) continue;
      const item = entry as Record<string, unknown>;
      const question = typeof item.question === "string" ? item.question.trim().slice(0, 160) : "";
      const answer = typeof item.answer === "string" ? item.answer.trim().slice(0, 600) : "";
      if (question && answer) items.push({ question, answer });
      if (items.length >= MAX_FAQ_ITEMS) break;
    }
    return items;
  } catch {
    return [];
  }
}

// FAQ affichée : celle du vendeur (tableau déjà parsé par l'API), sinon la FAQ
// par défaut du type de produit.
export function resolveFaq(
  type: string,
  faq: TunnelFaqItem[] | null | undefined,
  storeName: string,
): TunnelFaqItem[] {
  const items = (faq ?? []).filter(
    (item) => item.question.trim().length > 0 && item.answer.trim().length > 0,
  );
  if (items.length > 0) return items;
  return defaultFaq(type, storeName);
}

// --- Accroche ----------------------------------------------------------------

// Accroche affichée : celle du vendeur, sinon une accroche générée du titre.
export function resolveHeadline(title: string, salesHeadline: string | null | undefined): string {
  const trimmed = salesHeadline?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : title;
}

// --- Garantie ------------------------------------------------------------------

// Garantie affichée : celle du vendeur, sinon la garantie plateforme.
export const DEFAULT_GUARANTEE =
  "Paiement sécurisé en FCFA. Les fichiers numériques sont livrés automatiquement dès la confirmation du paiement. Chaque commande possède une référence traçable — en cas de question, le vendeur vous accompagne.";

export function resolveGuarantee(guaranteeText: string | null | undefined): string {
  const trimmed = guaranteeText?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : DEFAULT_GUARANTEE;
}
