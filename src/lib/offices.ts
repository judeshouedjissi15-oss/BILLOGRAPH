// BILLOGRAPH — Module « MAGNIFIER SON APPEL » : Espace de travail des officiers.
//
// Ce fichier est la CONFIGURATION RÉELLE des offices (postes) de BILLOGRAPH.
// Il définit, pour chaque office : l'appel (mission), les responsabilités,
// les limites d'autorité, les résultats attendus et les modèles de tâches.
// L'espace de travail de chaque officier est construit à partir de CETTE
// configuration — aucune donnée n'est inventée à l'exécution : les tâches,
// objectifs et rapports affichés proviennent toujours de la base de données.
//
// Règle du propriétaire : chaque office peut compter au maximum 5 adjoints
// actifs (plafond contrôlé côté serveur). Certains offices sont des bureaux
// sans adjoint par nature (canHaveAdjoints: false).

export type OfficeRoleKey =
  | "GREFFIER"
  | "DG"
  | "PROGRAMMEUR"
  | "CYBERSECURITE"
  | "COMMUNITY_MANAGER"
  | "PUBLICITE"
  | "MONTEUR"
  | "COMPTABLE"
  | "SECRETAIRE";

export type OfficeTaskTemplate = {
  title: string;
  description: string;
  priority: "BASSE" | "NORMALE" | "HAUTE" | "URGENTE";
  /** Suggère une échéance relative en jours (0 = aucune suggestion). */
  dueInDays: number;
};

export type OfficeDefinition = {
  key: OfficeRoleKey;
  /** Intitulé du poste, tel qu'affiché à l'officier. */
  label: string;
  /** Nom de l'office (bureau / direction). */
  officeName: string;
  /** Ordre d'affichage dans l'administration. */
  order: number;
  /** L'appel : description de la mission de l'office. */
  mission: string;
  /** Responsabilités concrètes confiées à l'officier. */
  responsibilities: string[];
  /** Limites d'autorité : ce que l'officier ne peut PAS faire seul. */
  authorityLimits: string[];
  /** Objectifs et résultats attendus (référentiel affiché à l'officier). */
  expectedResults: string[];
  /** Modèles de tâches réellement configurés pour cet office. */
  taskTemplates: OfficeTaskTemplate[];
  /** L'officier peut encadrer des adjoints (0 à 5). */
  canHaveAdjoints: boolean;
  /** Instructions d'accueil affichées dans « Mon appel et ma mission ». */
  welcomeNote: string;
};

export const MAX_ADJOINTS_PER_ROLE = 5;

export function adjointLimitMessage(officeLabel: string): string {
  return `L'office « ${officeLabel} » compte déjà ${MAX_ADJOINTS_PER_ROLE} adjoints actifs : le plafond du propriétaire est atteint. Retirez un adjoint avant d'en attribuer un nouveau.`;
}

export const OFFICE_DEFS: OfficeDefinition[] = [
  {
    key: "GREFFIER",
    label: "Greffier",
    officeName: "Bureau du Greffe",
    order: 1,
    mission:
      "Le greffe est la mémoire officielle de BILLOGRAPH. Le greffier tient à jour les registres de la plateforme : comptes, décisions du propriétaire, documents signés et pièces importantes. Chaque acte consigné doit être exact, daté et vérifiable.",
    responsibilities: [
      "Consigner les décisions importantes de la plateforme dans le registre du greffe.",
      "Vérifier l'exactitude des informations enregistrées avant toute inscription au registre.",
      "Classer les documents officiels et les rendre retrouvables rapidement.",
      "Préparer les procès-verbaux des réunions tenues avec le propriétaire.",
      "Signaler immédiatement toute irrégularité ou incohérence constatée dans les registres.",
    ],
    authorityLimits: [
      "Le greffier consigne : il ne prend aucune décision commerciale au nom de la plateforme.",
      "Aucun registre ne peut être effacé : toute correction se fait par ajout d'un acte rectificatif daté.",
      "Les documents confidentiels du propriétaire ne sont consignés qu'avec son accord explicite.",
      "Le greffier ne modifie ni les comptes utilisateurs ni les boutiques.",
    ],
    expectedResults: [
      "Registre à jour, sans acte non consigné datant de plus d'une semaine.",
      "Chaque acte retrouvable en moins de 5 minutes lors d'une demande du propriétaire.",
      "Procès-verbaux prêts à valider dans les 48 heures après chaque réunion.",
    ],
    taskTemplates: [
      {
        title: "Mise à jour hebdomadaire du registre",
        description:
          "Relire les événements de la semaine, consigner les actes manquants et vérifier la cohérence des entrées déjà enregistrées.",
        priority: "NORMALE",
        dueInDays: 7,
      },
      {
        title: "Classement des documents officiels",
        description:
          "Trier les documents reçus, les classer selon le plan de classement du greffe et signaler les pièces incomplètes.",
        priority: "NORMALE",
        dueInDays: 3,
      },
      {
        title: "Procès-verbal de réunion",
        description:
          "Rédiger le procès-verbal de la dernière réunion (participants, décisions, échéances) et le soumettre à validation.",
        priority: "HAUTE",
        dueInDays: 2,
      },
    ],
    canHaveAdjoints: true,
    welcomeNote:
      "Bienvenue au Bureau du Greffe. Votre fiabilité est votre signature : consignez avec soin, corrigez avec honnêteté, alertez sans tarder.",
  },
  {
    key: "DG",
    label: "Directeur général",
    officeName: "Direction générale",
    order: 2,
    mission:
      "La Direction générale coordonne l'action de tous les offices de BILLOGRAPH. Elle traduit les orientations du propriétaire en plans de travail clairs, veille à l'exécution des priorités et rend compte fidèlement de l'état réel de la plateforme.",
    responsibilities: [
      "Répartir les priorités du propriétaire entre les offices concernés.",
      "Suivre l'avancement réel des travaux de chaque office et lever les blocages.",
      "Arbitrer les désaccords d'organisation entre offices et rendre compte au propriétaire.",
      "Préparer les points de situation (hebdomadaires et mensuels) à partir de données réelles.",
      "Veiller au respect des limites d'autorité de chaque office.",
    ],
    authorityLimits: [
      "Le directeur général exécute les orientations du propriétaire : il ne fixe pas de nouvelle politique sans mandat.",
      "Il ne modifie ni les paramètres techniques, ni les paiements, ni les comptes utilisateurs.",
      "Aucune décision engageant la plateforme au-delà d'une semaine ne se prend sans accord du propriétaire.",
      "Les rapports de direction reflètent l'état réel : aucun résultat n'est présenté comme acquis sans preuve.",
    ],
    expectedResults: [
      "Chaque priorité du propriétaire reçoit un office responsable et une échéance sous 48 heures.",
      "Point de situation hebdomadaire remis à temps, chiffres réels à l'appui.",
      "Aucun blocage inter-offices non traité de plus de 5 jours ouvrés.",
    ],
    taskTemplates: [
      {
        title: "Point de situation hebdomadaire",
        description:
          "Consolider l'avancement des offices (tâches faites, en cours, bloquées), rédiger la synthèse et la soumettre à validation.",
        priority: "HAUTE",
        dueInDays: 7,
      },
      {
        title: "Répartition des priorités du propriétaire",
        description:
          "Analyser les orientations reçues, désigner l'office responsable de chaque priorité, fixer les échéances et informer les intéressés.",
        priority: "URGENTE",
        dueInDays: 2,
      },
      {
        title: "Revue des blocages inter-offices",
        description:
          "Passer en revue les tâches en attente et les demandes d'aide ouvertes, identifier les blocages et proposer des solutions concrètes.",
        priority: "NORMALE",
        dueInDays: 5,
      },
    ],
    canHaveAdjoints: true,
    welcomeNote:
      "Bienvenue à la Direction générale. Diriger, ici, c'est servir : clarifier, coordonner, rendre compte avec exactitude.",
  },
  {
    key: "PROGRAMMEUR",
    label: "Programmeur",
    officeName: "Bureau des Programmes",
    order: 3,
    mission:
      "Le Bureau des Programmes concourt à la qualité technique des produits numériques publiés sur BILLOGRAPH : contenus, fichiers, applications et procédures. Le programmeur travaille sur ce qui est réellement confié et documente chaque travail achevé.",
    responsibilities: [
      "Préparer et vérifier les fichiers numériques confiés (ebooks, formations, logiciels) avant publication.",
      "Documenter chaque travail technique réalisé pour permettre la reprise par un autre agent.",
      "Tester les fichiers livrés aux acheteurs (ouverture, intégrité, compatibilité) avant validation.",
      "Proposer des améliorations concrètes des produits et procédures au propriétaire.",
      "Consigner les anomalies constatées et suivre leur correction.",
    ],
    authorityLimits: [
      "Le programmeur ne publie rien seul : toute mise en ligne est validée par le propriétaire.",
      "Aucun fichier d'acheteur ni donnée personnelle n'est modifié ni consulté hors besoin de service.",
      "Les outils externes utilisés doivent être autorisés par le propriétaire.",
      "Le programmeur ne touche ni aux paiements ni aux paramètres de la plateforme.",
    ],
    expectedResults: [
      "Zéro fichier livré avec un défaut signalé par un acheteur sur la période.",
      "Chaque travail technique documenté et soumis à validation sous 48 heures après achèvement.",
      "Anomalies consignées avec reproduction précise (étapes, résultat attendu, résultat observé).",
    ],
    taskTemplates: [
      {
        title: "Vérification technique d'un fichier avant publication",
        description:
          "Contrôler l'intégrité du fichier (ouverture, qualité, compatibilité), noter les observations et soumettre le rapport de vérification.",
        priority: "HAUTE",
        dueInDays: 2,
      },
      {
        title: "Documentation d'un travail achevé",
        description:
          "Rédiger la documentation du travail réalisé (objectif, méthode, résultat) pour le classement du bureau.",
        priority: "NORMALE",
        dueInDays: 3,
      },
      {
        title: "Consolidation du registre des anomalies",
        description:
          "Mettre à jour la liste des anomalies signalées, leur état de correction et les vérifications restantes.",
        priority: "NORMALE",
        dueInDays: 7,
      },
    ],
    canHaveAdjoints: true,
    welcomeNote:
      "Bienvenue au Bureau des Programmes. La qualité se prouve : testez, documentez, soumettez — rien n'est livré sur simple supposition.",
  },
  {
    key: "CYBERSECURITE",
    label: "Agent de cybersécurité",
    officeName: "Bureau de la Cybersécurité",
    order: 4,
    mission:
      "Le Bureau de la Cybersécurité veille à la protection des comptes, des données et des accès de BILLOGRAPH. L'agent observe, alerte et recommande : c'est le propriétaire qui décide des mesures à appliquer.",
    responsibilities: [
      "Observer les signaux faibles : tentatives de connexion anormales, comportements suspects signalés.",
      "Vérifier que les bonnes pratiques de sécurité sont respectées dans les procédures documentées.",
      "Formuler des recommandations claires et hiérarchisées au propriétaire.",
      "Documenter chaque observation avec les faits, sans interprétation excessive.",
      "Sensibiliser les officiers aux réflexes de sécurité de base (mots de passe, confidentialité).",
    ],
    authorityLimits: [
      "L'agent de cybersécurité OBSERVE et RECOMMANDE : il ne suspend aucun compte et ne modifie aucun accès.",
      "Aucune donnée personnelle d'utilisateur n'est consultée hors besoin de service autorisé par le propriétaire.",
      "Les outils d'analyse externes doivent être autorisés par le propriétaire.",
      "Aucun test intrusif n'est réalisé sur la plateforme sans mandat écrit du propriétaire.",
    ],
    expectedResults: [
      "Recommandations remises avec niveau de risque et mesures proposées, sous 72 heures après observation.",
      "Zéro alerte de sécurité laissée sans transmission au propriétaire.",
      "Checklist de sécurité à jour et revue chaque mois.",
    ],
    taskTemplates: [
      {
        title: "Revue des bonnes pratiques de sécurité",
        description:
          "Vérifier les procédures documentées (mots de passe, partages de fichiers, postures d'accès), noter les écarts et recommander des corrections.",
        priority: "HAUTE",
        dueInDays: 7,
      },
      {
        title: "Analyse d'un signalement de sécurité",
        description:
          "Documenter les faits observés, évaluer le risque réel, proposer des mesures au propriétaire — sans rien modifier soi-même.",
        priority: "URGENTE",
        dueInDays: 2,
      },
      {
        title: "Note de sensibilisation des officiers",
        description:
          "Rédiger une note courte et concrète sur un réflexe de sécurité essentiel (ex : ne jamais partager un code reçu par email).",
        priority: "NORMALE",
        dueInDays: 10,
      },
    ],
    canHaveAdjoints: true,
    welcomeNote:
      "Bienvenue au Bureau de la Cybersécurité. Votre force : la rigueur factuelle. Observez, documentez, recommandez — la décision reste au propriétaire.",
  },
  {
    key: "COMMUNITY_MANAGER",
    label: "Community manager",
    officeName: "Bureau de la Communauté",
    order: 5,
    mission:
      "Le Bureau de la Communauté entretient le lien vivant entre BILLOGRAPH et ses publics : vendeurs, acheteurs et curieux. Il anime les canaux autorisés, relaie les informations officielles et remonte les besoins réels de la communauté.",
    responsibilities: [
      "Publier les informations officielles validées par le propriétaire sur les canaux autorisés.",
      "Répondre avec courtoisie et exactitude aux questions de la communauté.",
      "Remonter au propriétaire les besoins, questions récurrentes et signaux utiles.",
      "Préparer des contenus simples et vrais (annonces, félicitations, rappels) sans exagération.",
      "Protéger l'image de la plateforme : ton respectueux, faits vérifiés, aucune promesse non autorisée.",
    ],
    authorityLimits: [
      "Aucun contenu n'est publié sans validation du propriétaire (sauf réponses courtes aux questions).",
      "Aucune donnée personnelle d'utilisateur n'est partagée publiquement.",
      "Aucune promotion, prix ou remise n'est annoncé sans mandat du propriétaire.",
      "Les échanges privés restent confidentiels : rien n'est capturé ni diffusé sans accord.",
    ],
    expectedResults: [
      "Toutes les questions légitimes reçoivent une réponse honnête sous 24 heures ouvrées.",
      "Contenus publiés : 100 % validés au préalable, zéro fausse promesse.",
      "Synthèse hebdomadaire des signaux de la communauté remise au propriétaire.",
    ],
    taskTemplates: [
      {
        title: "Rédaction d'un contenu de communauté",
        description:
          "Préparer un contenu simple et vérifiable (annonce, félicitation d'un vendeur, rappel utile) et le soumettre à validation du propriétaire.",
        priority: "NORMALE",
        dueInDays: 5,
      },
      {
        title: "Réponses aux questions de la semaine",
        description:
          "Traiter les questions reçues, répondre avec exactitude et consigner les questions récurrentes pour le propriétaire.",
        priority: "NORMALE",
        dueInDays: 3,
      },
      {
        title: "Synthèse des signaux de la communauté",
        description:
          "Rédiger une synthèse des besoins, suggestions et frustrations entendus — faits réels, sans invention.",
        priority: "HAUTE",
        dueInDays: 7,
      },
    ],
    canHaveAdjoints: true,
    welcomeNote:
      "Bienvenue au Bureau de la Communauté. La confiance se construit mot par mot : soyez exact, chaleureux et fidèle aux faits.",
  },
  {
    key: "PUBLICITE",
    label: "Agent de publicité",
    officeName: "Bureau de la Publicité",
    order: 6,
    mission:
      "Le Bureau de la Publicité fait connaître les produits et la plateforme auprès des vrais publics du Bénin et d'ailleurs. L'agent prépare des campagnes honnêtes, mesurables et validées par le propriétaire avant toute diffusion.",
    responsibilities: [
      "Proposer des idées de campagne concrètes (message, cible, canal, budget indicatif).",
      "Préparer les supports (textes, visuels décrits, calendriers de diffusion) pour validation.",
      "Suivre les résultats réels des diffusions autorisées et en rendre compte chiffres en main.",
      "Veiller à l'honnêteté de chaque message : aucune fausse promesse, aucune statistique inventée.",
      "Coordonner avec le Bureau de la Communauté pour la cohérence des messages.",
    ],
    authorityLimits: [
      "AUCUNE diffusion n'est engagée sans validation explicite du propriétaire (message + canal + budget).",
      "Aucun budget n'est engagé ni promis au nom de la plateforme sans mandat écrit.",
      "Les allégations sont vérifiables : pas de superlatifs non prouvés, pas de faux comptes.",
      "Les outils publicitaires externes doivent être autorisés par le propriétaire.",
    ],
    expectedResults: [
      "Chaque campagne validée dispose d'un objectif mesurable et d'un rapport de résultats réel.",
      "Zéro diffusion non autorisée — le contrôle est systématique.",
      "Propositions prêtes à valider dans les 5 jours ouvrés après demande.",
    ],
    taskTemplates: [
      {
        title: "Proposition de campagne (message, cible, canal)",
        description:
          "Rédiger une proposition complète et honnête : message, audience visée, canal de diffusion, indicateur de succès. Soumettre à validation.",
        priority: "NORMALE",
        dueInDays: 5,
      },
      {
        title: "Rapport de résultats d'une diffusion autorisée",
        description:
          "Consolider les résultats réels (portée, clics, retours), comparer à l'objectif et proposer des ajustements.",
        priority: "HAUTE",
        dueInDays: 3,
      },
      {
        title: "Veille des pratiques publicitaires honnêtes",
        description:
          "Observer ce qui fonctionne autour (sans copier) et noter deux pratiques honnêtes applicables à BILLOGRAPH.",
        priority: "BASSE",
        dueInDays: 10,
      },
    ],
    canHaveAdjoints: true,
    welcomeNote:
      "Bienvenue au Bureau de la Publicité. Faire connaître, oui — mais toujours vrai, toujours validé, toujours mesurable.",
  },
  {
    key: "MONTEUR",
    label: "Monteur",
    officeName: "Bureau du Montage",
    order: 7,
    mission:
      "Le Bureau du Montage prépare les supports visuels et sonores confiés : illustrations de produits, présentations, montages vidéo et audio. Le monteur travaille sur les fichiers réellement confiés et livre un travail propre, testé et documenté.",
    responsibilities: [
      "Réaliser les montages confiés (coupes, sous-titres, habillage, formats) selon les consignes.",
      "Vérifier chaque livrable (lecture complète, son, image, format demandé) avant soumission.",
      "Respecter les délais annoncés et signaler tôt toute difficulté.",
      "Documenter les réglages utiles (piste, police, format) pour la reprise par un autre agent.",
      "Proposer des améliorations simples de qualité (lisibilité, poids des fichiers).",
    ],
    authorityLimits: [
      "Le monteur travaille sur les fichiers CONFIÉS : il ne récupère aucun contenu ailleurs sans autorisation.",
      "Il respecte les droits : aucune musique, police ou image dont la licence n'est pas autorisée.",
      "Il ne publie rien : les livrables sont soumis au propriétaire ou à l'officier concerné.",
      "Il ne modifie pas le sens du contenu : le fond reste celui de l'auteur.",
    ],
    expectedResults: [
      "Zéro livrable retourné pour un défaut technique évitable (son, format, coupe).",
      "Chaque montage documenté (fichiers sources, réglages) pour permettre la reprise.",
      "Livraison dans le délai annoncé ou signalement anticipé du retard.",
    ],
    taskTemplates: [
      {
        title: "Montage d'un support confié",
        description:
          "Réaliser le montage selon les consignes, vérifier la lecture complète (image + son) et soumettre à validation.",
        priority: "NORMALE",
        dueInDays: 3,
      },
      {
        title: "Correction après retours",
        description:
          "Appliquer précisément les corrections demandées, vérifier à nouveau et re-soumettre avec la liste des changements.",
        priority: "HAUTE",
        dueInDays: 2,
      },
      {
        title: "Documentation des réglages du projet",
        description:
          "Consigner fichiers sources, polices, pistes et réglages pour que le projet soit reprenable par un autre agent.",
        priority: "BASSE",
        dueInDays: 5,
      },
    ],
    canHaveAdjoints: true,
    welcomeNote:
      "Bienvenue au Bureau du Montage. La propreté du travail se voit à l'écran et s'entend au son : vérifiez chaque livrable comme s'il allait être diffusé.",
  },
  {
    key: "COMPTABLE",
    label: "Comptable",
    officeName: "Bureau de la Comptabilité",
    order: 8,
    mission:
      "Le Bureau de la Comptabilité tient la trace exacte des flux de la plateforme : commissions encaissées, retraits payés, écarts constatés. Le comptable enregistre ce qui est RÉEL — il ne modifie aucune donnée de transaction.",
    responsibilities: [
      "Consigner périodiquement les totaux réels (ventes payées, commissions, retraits) à partir des données de la plateforme.",
      "Vérifier la cohérence des totaux avant toute remise au propriétaire.",
      "Signaler tout écart ou anomalie constatée (montant, doublon, transaction floue).",
      "Préparer les états périodiques (hebdomadaire et mensuel) lisibles et vérifiables.",
      "Tenir à jour la liste des justificatifs de retraits (références de transfert réels).",
    ],
    authorityLimits: [
      "Le comptable NE MODIFIE AUCUNE transaction, aucun retrait, aucun paiement — il constate et signale.",
      "Aucune décision de remboursement ou de retrait n'est prise sans le propriétaire.",
      "Les chiffres présentés proviennent toujours de la plateforme : aucun montant estimé n'est présenté comme réel.",
      "Les données comptables restent confidentielles : elles ne sortent pas du bureau et du propriétaire.",
    ],
    expectedResults: [
      "État périodique remis à temps avec chiffres réels et écarts signalés.",
      "Zéro écart laissé sans signalement de plus de 48 heures.",
      "Justificatifs de retraits à jour et retrouvables en moins de 5 minutes.",
    ],
    taskTemplates: [
      {
        title: "État périodique des flux",
        description:
          "Consolider les totaux réels de la période (ventes payées, commissions, retraits), vérifier la cohérence et soumettre l'état au propriétaire.",
        priority: "HAUTE",
        dueInDays: 7,
      },
      {
        title: "Vérification des justificatifs de retraits",
        description:
          "Contrôler que chaque retrait payé dispose d'une référence de transfert réelle consignée, signaler les manques.",
        priority: "NORMALE",
        dueInDays: 5,
      },
      {
        title: "Signalement des écarts constatés",
        description:
          "Documenter précisément chaque écart (référence, montant constaté, montant attendu) et le soumettre au propriétaire.",
        priority: "URGENTE",
        dueInDays: 2,
      },
    ],
    canHaveAdjoints: true,
    welcomeNote:
      "Bienvenue au Bureau de la Comptabilité. Votre honneur : l'exactitude. Un chiffre présenté comme réel doit être vérifiable — sinon il ne sort pas.",
  },
  {
    key: "SECRETAIRE",
    label: "Secrétaire",
    officeName: "Bureau du Secrétariat",
    order: 9,
    mission:
      "Le Bureau du Secrétariat organise la vie administrative quotidienne de BILLOGRAPH : courriers, rendez-vous, convocations, suivi des documents en attente. Le secrétaire tient l'agenda propre et les échanges clairs.",
    responsibilities: [
      "Rédiger et mettre en forme les courriers et notes internes demandés.",
      "Tenir le suivi des documents en attente (qui doit quoi, pour quand) et relancer avec courtoisie.",
      "Organiser les rendez-vous et convocations décidés par le propriétaire.",
      "Préparer les ordres du jour des réunions et conserver les décisions notées.",
      "Garder les échanges administratifs clairs, datés et archivés.",
    ],
    authorityLimits: [
      "Le secrétaire ne signe ni n'engage la plateforme : les courriers engageants sont validés par le propriétaire.",
      "Il ne fixe aucune politique : il organise ce qui est décidé.",
      "Les informations personnelles reçues restent confidentielles.",
      "Aucun document n'est détruit : l'archivage est la règle.",
    ],
    expectedResults: [
      "Courriers prêts à valider sous 48 heures après demande.",
      "Aucun document en attente sans suivi à jour (qui, quoi, pour quand).",
      "Réunions préparées (ordre du jour envoyé) au moins 24 heures avant.",
    ],
    taskTemplates: [
      {
        title: "Rédaction d'un courrier ou d'une note",
        description:
          "Rédiger le document demandé (objet clair, propos tenu, ton respectueux) et le soumettre à validation du propriétaire.",
        priority: "NORMALE",
        dueInDays: 2,
      },
      {
        title: "Mise à jour du suivi des documents en attente",
        description:
          "Passer en revue les éléments en attente, relancer avec courtoisie et mettre à jour le tableau de suivi.",
        priority: "NORMALE",
        dueInDays: 5,
      },
      {
        title: "Préparation d'une réunion",
        description:
          "Préparer l'ordre du jour, vérifier la liste des participants et consigner les décisions prises.",
        priority: "HAUTE",
        dueInDays: 3,
      },
    ],
    canHaveAdjoints: false,
    welcomeNote:
      "Bienvenue au Bureau du Secrétariat. L'ordre est un service rendu à tous : clarté, délais tenus, documents retrouvables.",
  },
];

export function getOfficeDef(role: string | null | undefined): OfficeDefinition | null {
  if (!role) return null;
  return OFFICE_DEFS.find((d) => d.key === role) ?? null;
}

export const officeLabel = (role: string): string => getOfficeDef(role)?.label ?? role;

// ── Constantes partagées (statuts, priorités, catégories) ──────────────────

export const TASK_STATUSES = ["TODO", "IN_PROGRESS", "ON_HOLD", "AWAITING_VALIDATION", "DONE"] as const;

export const TASK_STATUS_LABELS: Record<string, string> = {
  TODO: "À faire",
  IN_PROGRESS: "En cours",
  ON_HOLD: "En pause",
  AWAITING_VALIDATION: "À valider",
  DONE: "Terminée",
};

export const TASK_PRIORITIES = ["BASSE", "NORMALE", "HAUTE", "URGENTE"] as const;

export const TASK_PRIORITY_LABELS: Record<string, string> = {
  BASSE: "Basse",
  NORMALE: "Normale",
  HAUTE: "Haute",
  URGENTE: "Urgente",
};

export const OBJECTIVE_PERIODS = ["QUOTIDIEN", "HEBDO", "MENSUEL", "PONCTUEL"] as const;

export const OBJECTIVE_PERIOD_LABELS: Record<string, string> = {
  QUOTIDIEN: "Quotidien",
  HEBDO: "Hebdomadaire",
  MENSUEL: "Mensuel",
  PONCTUEL: "Ponctuel",
};

export const OBJECTIVE_STATUSES = ["EN_COURS", "ATTEINT", "ABANDONNE"] as const;

export const OBJECTIVE_STATUS_LABELS: Record<string, string> = {
  EN_COURS: "En cours",
  ATTEINT: "Atteint",
  ABANDONNE: "Abandonné",
};

export const EVENT_TYPES = ["REUNION", "ACTIVITE", "ECHEANCE", "RAPPEL"] as const;

export const EVENT_TYPE_LABELS: Record<string, string> = {
  REUNION: "Réunion",
  ACTIVITE: "Activité",
  ECHEANCE: "Échéance",
  RAPPEL: "Rappel",
};

export const HELP_CATEGORIES = ["ORGANISATION", "RESSOURCES", "TECHNIQUE", "CONFIDENTIEL", "AUTRE"] as const;

export const HELP_CATEGORY_LABELS: Record<string, string> = {
  ORGANISATION: "Organisation",
  RESSOURCES: "Ressources",
  TECHNIQUE: "Technique",
  CONFIDENTIEL: "Confidentiel",
  AUTRE: "Autre",
};

export const TRAINING_CATEGORIES = ["INSTRUCTION", "PROCEDURE", "GUIDE", "DOCUMENT"] as const;

export const TRAINING_CATEGORY_LABELS: Record<string, string> = {
  INSTRUCTION: "Instruction",
  PROCEDURE: "Procédure",
  GUIDE: "Guide",
  DOCUMENT: "Document",
};

export const ACTIVITY_ACTION_LABELS: Record<string, string> = {
  TASK_CREATED: "Tâche créée",
  TASK_UPDATED: "Tâche modifiée",
  TASK_PRIORITY_CHANGED: "Priorité de tâche modifiée",
  TASK_STATUS_CHANGED: "Statut de tâche modifié",
  TASK_SUBMITTED: "Travail soumis",
  TASK_VALIDATED: "Travail validé",
  TASK_RETURNED: "Travail renvoyé",
  TASK_COMMENTED: "Commentaire ajouté",
  OBJECTIVE_CREATED: "Objectif fixé",
  OBJECTIVE_UPDATED: "Objectif mis à jour",
  REPORT_SUBMITTED: "Rapport publié",
  HELP_REQUESTED: "Demande d'aide envoyée",
  EVENT_CREATED: "Événement ajouté",
  EVENT_DELETED: "Événement supprimé",
  TRAINING_UPDATED: "Formation actualisée",
  ADJOINT_ADDED: "Adjoint rattaché",
  ADJOINT_REMOVED: "Adjoint retiré",
};
