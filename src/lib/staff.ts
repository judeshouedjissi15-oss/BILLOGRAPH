// BILLOGRAPH — Catalogue officiel des offices (rôles professionnels).
// MATRICE OFFICIELLE (cahier des charges §6) : chaque rôle correspond à un
// poste avec une mission, des permissions de départ explicites et un espace de
// travail professionnel. SUPER_ADMIN n'est PAS dans ce catalogue : le
// propriétaire est l'unique compte ADMIN (rôle de base), intouchable.
//
// RÈGLE ABSOLUE (directive du fondateur) : l'attribution d'un office AJOUTE les
// capacités professionnelles du poste au compte existant — elle ne remplace
// jamais, ne bloque jamais et ne détériore jamais le compte vendeur
// (rôle de base CLIENT | VENDEUR | ADMIN conservé inchangé).

export const MAX_ADJOINTS_PER_ROLE = 5;

export function adjointLimitMessage(roleLabel: string): string {
  return `Le poste « ${roleLabel} » compte déjà ${MAX_ADJOINTS_PER_ROLE} adjoints actifs — chaque rôle est limité à ${MAX_ADJOINTS_PER_ROLE} adjoints (directive du propriétaire). Suspendez ou retirez un adjoint de ce poste pour libérer une place.`;
}

// ---------------------------------------------------------------------------
// CATALOGUE DES PERMISSIONS — actions distinctes (consultation, création,
// modification, validation) accordées par poste et ajustables par le
// propriétaire depuis l'administration. Le contrôle est TOUJOURS exécuté côté
// serveur (src/lib/auth.ts → requirePermission).
// ---------------------------------------------------------------------------
export const PERMISSIONS = {
  "users.read": { label: "Consulter les comptes (hors secrets)", famille: "Comptes" },
  "users.manage": { label: "Suspendre / réactiver les comptes non propriétaires", famille: "Comptes" },
  "stores.read": { label: "Consulter les boutiques", famille: "Boutiques" },
  "stores.manage": { label: "Suspendre / réactiver les boutiques", famille: "Boutiques" },
  "products.read": { label: "Consulter le catalogue produits (toutes boutiques)", famille: "Catalogue" },
  "products.moderate": { label: "Dépublier / archiver un produit", famille: "Catalogue" },
  "orders.read": { label: "Consulter les commandes (toutes boutiques)", famille: "Opérations" },
  "finance.read": { label: "Consulter les rapports financiers (CA, commissions)", famille: "Finances" },
  "finance.reconcile": { label: "Préparer les rapprochements et demandes soumis à approbation", famille: "Finances" },
  "withdrawals.read": { label: "Consulter les demandes de retrait", famille: "Finances" },
  "reviews.read": { label: "Consulter les avis clients", famille: "Communauté" },
  "reviews.moderate": { label: "Modérer les avis", famille: "Communauté" },
  "audit.read": { label: "Consulter le journal d'audit", famille: "Sécurité" },
  "security.read": { label: "Consulter les événements de sécurité", famille: "Sécurité" },
  "privacy.read": { label: "Suivre les demandes de confidentialité", famille: "Sécurité" },
  "dev.read": { label: "Consulter les tâches techniques et la documentation", famille: "Technique" },
  "infra.read": { label: "Consulter l'état des services et des déploiements", famille: "Technique" },
  "community.manage": { label: "Gérer les publications et interactions communautaires", famille: "Contenus" },
  "content.manage": { label: "Gérer les contenus et ressources éditoriales", famille: "Contenus" },
  "publicity.manage": { label: "Gérer les campagnes publicitaires", famille: "Contenus" },
  "tasks.work": { label: "Recevoir et traiter des tâches professionnelles", famille: "Travail" },
  "tasks.delegate": { label: "Déléguer des tâches aux adjoints du même poste", famille: "Travail" },
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;
export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as PermissionKey[];

export function isPermissionKey(key: string): key is PermissionKey {
  return Object.prototype.hasOwnProperty.call(PERMISSIONS, key);
}

// ---------------------------------------------------------------------------
// CATALOGUE DES OFFICES — matrice officielle des 21 postes.
// workspace :
//  - "configured" : l'espace professionnel affiche déjà des modules RÉELS
//    branchés sur la base (comptes, commandes, finances, audit, sécurité…).
//  - "planned" : l'espace s'affiche normalement (tâches réelles + mission),
//    avec une mention explicite « espace de travail à configurer » — le compte
//    n'est JAMAIS bloqué et l'espace vendeur reste accessible.
// ---------------------------------------------------------------------------
export type StaffRoleSpec = {
  key: string;
  label: string;
  mission: string;
  workspace: "configured" | "planned";
  defaultPermissions: PermissionKey[];
};

export const STAFF_ROLES: StaffRoleSpec[] = [
  {
    key: "GREFFIER_PRINCIPAL",
    label: "Greffier principal",
    mission:
      "Assister le propriétaire dans l'administration et coordonner les travaux administratifs.",
    workspace: "configured",
    defaultPermissions: ["users.read", "users.manage", "stores.read", "tasks.work", "tasks.delegate"],
  },
  {
    key: "DIRECTEUR_GENERAL",
    label: "Directeur général",
    mission: "Piloter les activités et coordonner les équipes.",
    workspace: "configured",
    defaultPermissions: ["orders.read", "stores.read", "users.read", "reviews.read", "tasks.work", "tasks.delegate"],
  },
  {
    key: "PROGRAMMEUR",
    label: "Programmeur",
    mission: "Concevoir, corriger et maintenir les fonctionnalités autorisées de la plateforme.",
    workspace: "planned",
    defaultPermissions: ["dev.read", "tasks.work"],
  },
  {
    key: "BACKEND_DEVELOPER",
    label: "Développeur backend",
    mission: "Développer et maintenir la logique serveur, les API et les intégrations autorisées.",
    workspace: "planned",
    defaultPermissions: ["dev.read", "tasks.work"],
  },
  {
    key: "DEVOPS_ENGINEER",
    label: "Ingénieur DevOps",
    mission: "Maintenir les environnements et les procédures de déploiement autorisés.",
    workspace: "planned",
    defaultPermissions: ["infra.read", "tasks.work"],
  },
  {
    key: "QA_SECURITY_TESTER",
    label: "Testeur qualité et sécurité",
    mission: "Vérifier la qualité et la sécurité des fonctionnalités.",
    workspace: "planned",
    defaultPermissions: ["dev.read", "tasks.work"],
  },
  {
    key: "RESPONSABLE_CYBERSECURITE",
    label: "Responsable cybersécurité",
    mission: "Surveiller les risques, les accès et les incidents de sécurité.",
    workspace: "configured",
    defaultPermissions: ["security.read", "audit.read", "tasks.work"],
  },
  {
    key: "DATA_PRIVACY_OFFICER",
    label: "Responsable de la confidentialité des données",
    mission: "Suivre les questions de confidentialité et de protection des informations.",
    workspace: "planned",
    defaultPermissions: ["privacy.read", "tasks.work"],
  },
  {
    key: "INCIDENT_MANAGER",
    label: "Responsable des incidents",
    mission: "Coordonner le traitement des incidents techniques ou opérationnels.",
    workspace: "planned",
    defaultPermissions: ["orders.read", "tasks.work", "tasks.delegate"],
  },
  {
    key: "BACKUP_MANAGER",
    label: "Responsable des sauvegardes",
    mission: "Assurer le suivi des sauvegardes et de la restauration autorisée.",
    workspace: "planned",
    defaultPermissions: ["infra.read", "tasks.work"],
  },
  {
    key: "INTERNAL_AUDITOR",
    label: "Auditeur interne",
    mission: "Vérifier les opérations et produire des constats indépendants.",
    workspace: "configured",
    defaultPermissions: ["audit.read", "finance.read", "tasks.work"],
  },
  {
    key: "FINANCE_MANAGER",
    label: "Responsable financier",
    mission: "Superviser le suivi financier et préparer les décisions financières autorisées.",
    workspace: "configured",
    defaultPermissions: ["finance.read", "finance.reconcile", "withdrawals.read", "orders.read", "tasks.work"],
  },
  {
    key: "COMPTABLE",
    label: "Comptable",
    mission: "Tenir le suivi comptable et préparer les rapprochements.",
    workspace: "configured",
    defaultPermissions: ["finance.read", "finance.reconcile", "orders.read", "withdrawals.read", "tasks.work"],
  },
  {
    key: "OPERATIONS_CONTROLLER",
    label: "Contrôleur des opérations",
    mission: "Suivre les activités, les contrôles internes et la réalisation des tâches.",
    workspace: "configured",
    defaultPermissions: ["orders.read", "products.read", "stores.read", "tasks.work"],
  },
  {
    key: "SELLER_MANAGER",
    label: "Responsable des vendeurs",
    mission: "Accompagner les vendeurs et gérer les demandes liées à leurs comptes.",
    workspace: "configured",
    defaultPermissions: ["users.read", "stores.read", "orders.read", "reviews.read", "tasks.work"],
  },
  {
    key: "CUSTOMER_SUPPORT",
    label: "Support client",
    mission: "Résoudre les demandes des clients dans les limites des autorisations accordées.",
    workspace: "configured",
    defaultPermissions: ["orders.read", "reviews.read", "tasks.work"],
  },
  {
    key: "COMMUNITY_MANAGER",
    label: "Community manager",
    mission: "Gérer les communications et les interactions sur les canaux autorisés.",
    workspace: "planned",
    defaultPermissions: ["community.manage", "reviews.read", "tasks.work"],
  },
  {
    key: "CONTENT_MANAGER",
    label: "Responsable des contenus",
    mission: "Organiser les contenus et les ressources éditoriales.",
    workspace: "planned",
    defaultPermissions: ["content.manage", "tasks.work"],
  },
  {
    key: "RESPONSABLE_PUBLICITE",
    label: "Responsable publicité",
    mission: "Préparer, gérer et suivre les campagnes publicitaires autorisées.",
    workspace: "planned",
    defaultPermissions: ["publicity.manage", "tasks.work"],
  },
  {
    key: "MONTEUR_VIDEO",
    label: "Monteur vidéo",
    mission: "Produire et livrer les ressources audiovisuelles confiées.",
    workspace: "planned",
    defaultPermissions: ["tasks.work"],
  },
  {
    key: "SECRETARIAT",
    label: "Secrétariat",
    mission: "Gérer les documents, communications et tâches administratives autorisées.",
    workspace: "planned",
    defaultPermissions: ["users.read", "tasks.work"],
  },
];

export const STAFF_ROLE_KEYS = STAFF_ROLES.map((r) => r.key);

const STAFF_ROLE_MAP: Record<string, StaffRoleSpec> = Object.fromEntries(
  STAFF_ROLES.map((r) => [r.key, r])
);

/** Retrouve un rôle du catalogue (évite les doublons sous un autre nom). */
export function staffRole(key: string): StaffRoleSpec | undefined {
  return STAFF_ROLE_MAP[key];
}

export function isStaffRole(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(STAFF_ROLE_MAP, key);
}

export function roleLabel(key: string): string {
  return STAFF_ROLE_MAP[key]?.label ?? key;
}

export function defaultPermissionsFor(key: string): PermissionKey[] {
  return STAFF_ROLE_MAP[key]?.defaultPermissions ?? [];
}

/**
 * Permissions EFFECTIVES d'une attribution : la liste stockée (ajustée par le
 * propriétaire) prime ; repli sûr sur les permissions par défaut du poste si
 * la liste est vide, absente ou corrompue. Les clés inconnues sont ignorées.
 */
export function effectivePermissions(storedJson: string | null | undefined, role: string): PermissionKey[] {
  const defaults = defaultPermissionsFor(role);
  if (!storedJson || storedJson.trim() === "" || storedJson === "[]") return [...defaults];
  try {
    const parsed: unknown = JSON.parse(storedJson);
    if (!Array.isArray(parsed)) return [...defaults];
    const valid = parsed.filter((p): p is PermissionKey => typeof p === "string" && isPermissionKey(p));
    return valid.length > 0 ? Array.from(new Set(valid)) : [...defaults];
  } catch {
    return [...defaults];
  }
}

// ---------------------------------------------------------------------------
// TÂCHES PROFESSIONNELLES — états et priorités réels.
// ---------------------------------------------------------------------------
export const STAFF_TASK_STATUSES = ["TODO", "IN_PROGRESS", "DONE", "CANCELLED"] as const;
export type StaffTaskStatus = (typeof STAFF_TASK_STATUSES)[number];

export const STAFF_TASK_STATUS_LABELS: Record<StaffTaskStatus, string> = {
  TODO: "À faire",
  IN_PROGRESS: "En cours",
  DONE: "Terminée",
  CANCELLED: "Annulée",
};

export const STAFF_TASK_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export type StaffTaskPriority = (typeof STAFF_TASK_PRIORITIES)[number];

export const STAFF_TASK_PRIORITY_LABELS: Record<StaffTaskPriority, string> = {
  LOW: "Basse",
  NORMAL: "Normale",
  HIGH: "Haute",
  URGENT: "Urgente",
};
