# Analyse de conformité — Cahier des charges d'administration sécurisée BILLOGRAPH

**Document de référence** : `docs/cahier-des-charges-administration-securisee.pdf`
(BILLOGRAPH — Cahier des charges : Administration centralisée, gestion des rôles et
sécurisation du projet, Version 1.0 — Octobre 2026, propriétaire HOUEDJISSI JUDES B.)

**Objet du présent document** : conformer à l'instruction §16 du cahier des charges
(« Avant de coder, analyser le projet existant et signaler les risques ou dépendances.
Implémenter le système par étapes… »), analyser chaque exigence et indiquer honnêtement
son état : ✅ **Conforme** (implémenté et vérifié) · 🟡 **Partiel** (fondation posée,
poursuite planifiée) · ⬜ **À venir** (non commencé, tracé dans la feuille de route).

**Dernière mise à jour** : après extension de l'attribution des rôles/postes à l'onglet
Utilisateurs (directive du propriétaire) — le sélecteur devant chaque nom couvre
Client, Vendeur et les 9 postes de l'équipe, autorisations appliquées immédiatement.

---

## 1. Présentation du projet

🟡 **Partiel.** La plateforme gère déjà comptes individuels (propriétaire, vendeurs,
clients, collaborateurs) et protège la propriété (compte propriétaire unique non
modifiable via l'API). La collaboration d'équipe avec permissions fines vient d'être
fondée (tranche 1, §4-§5 ci-dessous) ; les tableaux de bord par rôle sont à venir.

## 2. Objectifs du cahier des charges

| Objectif | État | Preuve / emplacement |
|---|---|---|
| Compte distinct pour chaque membre | ✅ | `Admin` → `Équipe` → « Créer un collaborateur » (comptes email+mot de passe individuels, `emailVerified: true` — créés par le propriétaire) |
| Permissions de départ automatiques selon le poste | ✅ | `src/lib/staff.ts` — `STAFF_ROLES[rôle].defaultPermissions` appliquées à la connexion effective |
| Modification précise des permissions par le propriétaire | ✅ | `Admin` → `Équipe` → « Permissions » (accordées / retirées, affichage héritées vs exceptions) + `PATCH /api/admin/staff/[id]` |
| Séparer opérations quotidiennes / actions critiques | 🟡 | Routes critiques déjà protégées par rôle ADMIN (propriétaire) ; workflow d'approbation formalisé à venir (§6 ci-dessous) |
| Empêcher toute auto-promotion (y compris Greffier) | ✅ | Tests d'acceptation §14 passés : 403/409 sur toute tentative (voir §14) |
| Trace vérifiable + révocation rapide | ✅ | Journal d'audit (table `AuditLog`, onglet Audit) + suspension = révocation immédiate des sessions (`db.session.deleteMany`) |

## 3. Principes fondamentaux

### 3.1 Propriété et contrôle — 🟡 Partiel (l'essentiel est conforme)
- ✅ HOUEDJISSI JUDES B. = unique compte ADMIN (rôle technique du SUPER_ADMIN) ;
  le rôle ADMIN n'est **jamais** attribuable via l'API (validation Zod + garde-fous
  serveur, y compris défense en profondeur dans `/api/admin/staff`).
- ✅ Le compte propriétaire est **intouchable via l'API** (`isOwnerEmail()` → 409,
  testé) ; ni le Greffier ni aucun collaborateur ne peut le modifier.
- 🟡 Les « facteurs de récupération » sont aujourd'hui les 2 codes secrets admin
  (`.env`, surchargeables) + mot de passe propriétaire : la récupération ne dépend
  PAS d'un autre administrateur (✅ §8), mais il n'y a pas encore de gestion
  d'alias/facteurs dédiés dans l'interface.
- ⬜ Confirmation indépendante fournisseurs (domaine, hébergement) : hors périmètre
  applicatif — procédure documentée à produire (§9).

### 3.2 Moindre privilège — ✅ Conforme
- Permissions de départ **minimales** par poste (ex. Programmeur : aucune) ;
- refus par défaut côté serveur (`requireRole`/permissions réévaluées à chaque
  requête, aucun cache) ;
- l'interface masque les actions non autorisées mais ne fait JAMAIS autorité.

### 3.3 Séparation des tâches — 🟡 Partiel
- Distinction consultation / préparation / approbation posée dans le **catalogue de
  permissions** (`finance.payouts.view` / `finance.payouts.approve`…).
- ⬜ Workflow d'approbation à deux personnes (initiateur ≠ approbateur) pour les
  opérations financières critiques : **à venir** (tranche 2 — l'approbation des
  retraits reste celle, vérifiée, de l'onglet Retraits par le propriétaire).

## 4. Hiérarchie et rôles

| Rôle du cahier des charges | Clé technique | Permissions de départ | État |
|---|---|---|---|
| §4.1 Propriétaire — SUPER_ADMIN | `ADMIN` | Toutes (par construction) | ✅ compte unique, intouchable |
| §4.2 Greffier principal | `GREFFIER_PRINCIPAL` | comptes ordinaires (view/create/update/suspend), rôles (view/assign), analytics, logs | ✅ |
| §4.3 Directeur général | `DIRECTEUR_GENERAL` | analytics, rapports financiers (lecture), users (view) | ✅ |
| §4.4 Programmeur | `PROGRAMMEUR` | aucune par défaut | ✅ |
| §4.5 Responsable cybersécurité | `RESPONSABLE_CYBERSECURITE` | logs sécurité | ✅ |
| §4.6 Community Manager | `COMMUNITY_MANAGER` | content.manage | ✅ |
| §4.7 Responsable publicité | `RESPONSABLE_PUBLICITE` | campaigns.manage, analytics | ✅ |
| §4.8 Monteur vidéo | `MONTEUR_VIDEO` | aucune par défaut | ✅ |
| §4.9 Comptable | `COMPTABLE` | transactions/reports/payouts (lecture), analytics | ✅ |
| §4.10 Secrétariat | `SECRETAIRE` | aucune par défaut | ✅ |

### 4-bis. Effectifs par poste — « Chaque rôle doit pouvoir avoir 05 adjoints » ✅ Conforme

**Instruction du propriétaire** (directive reçue lors de l'attribution du cahier des
charges) : chaque poste du catalogue §4.2-§4.10 peut compter jusqu'à **5 adjoints
actifs** simultanément.

| Exigence | Implémentation | État |
|---|---|---|
| Chaque rôle peut avoir 5 adjoints | `MAX_ADJOINTS_PER_ROLE = 5` (`src/lib/staff.ts`) ; 5 créations acceptées par poste | ✅ testé (§14-bis) |
| Attribution des postes depuis l'onglet Utilisateurs (directive du propriétaire) | `PATCH /api/admin/users/[id]` accepte Client, Vendeur et les 9 postes §4.2-§4.10 : le sélecteur « Rôle / Poste » devant chaque nom ouvre les deux groupes (Comptes / Postes de l'équipe avec effectif x/5) ; les autorisations du poste s'appliquent immédiatement et les exceptions de l'ancien poste sont effacées (moindre privilège) ; l'adjoint apparaît aussitôt dans l'onglet Équipe, et sort de la liste au retour vers un compte classique | ✅ testé (15/15) |
| Le plafond est appliqué côté serveur | Comptage des adjoints ACTIFS dans la même transaction que la création (`POST /api/admin/staff`) — toute 6ᵉ création est refusée (HTTP 409, message explicite) | ✅ testé |
| Changement de poste contrôlé | `PATCH /api/admin/staff/[id]` refuse le transfert vers un poste complet (409) | ✅ testé |
| Réactivation contrôlée | La réactivation d'un adjoint suspendu est refusée si son poste compte déjà 5 actifs (409) | ✅ testé |
| Suspendre libère la place | Seuls les comptes ACTIFS comptent dans l'effectif : un adjoint parti est suspendu, le poste redevient disponible | ✅ testé |
| Visibilité claire pour le propriétaire | Onglet Équipe : carte « Effectifs par poste » (x/5 par rôle, rouge si complet), sélecteurs affichant l'effectif et les places restantes, postes complets désactivés | ✅ vérifié navigateur |
| Traçabilité | Audit `STAFF_CREATED`/`STAFF_UPDATED` avec l'effectif du poste après l'opération (`activeAdjointCount`) | ✅ vérifié |

🟡 **Tableaux de bord par rôle** (§10-§11) : les rôles et permissions existent et sont
contrôlés côté serveur ; l'accès progressif des collaborateurs à des vues dédiées
(selon permissions) est la **tranche 2**. En attendant, un collaborateur connecté
voit l'interface client/vendeur standard — il ne peut RIEN faire côté admin (routes
403 vérifiées).

## 5. Permissions et personnalisation — ✅ Conforme (cœur livré)

- Modèle : permissions de départ du poste + exceptions individuelles
  (`StaffPermission.granted/revoked` en base) — conforme §5.
- ✅ Affichage clair héritées vs exceptions (dialogue « Permissions »).
- ✅ Accorder/retirer chaque permission sans changer le poste.
- ✅ Jamais de rétablissement silencieux : les exceptions persistent (upsert ciblé).
- ✅ Audit de chaque modification : action, auteur, horodatage, valeur **précédente**
  et **nouvelle** (`permissionsBefore/permissionsAfter` — vérifié).
- ✅ Le Greffier ne peut ni modifier les permissions du propriétaire ni
  s'auto-promouvoir (403, testé).
- ✅ Réévaluation à chaque requête côté serveur (`effectivePermissions()` recalculé,
  aucun cache).
- Clés de permissions : catalogue `src/lib/staff.ts` aligné sur §5.1 + fonctions
  réelles du SaaS (19 clés).

## 6. Sécurité financière — 🟡 Partiel

- ✅ Soldes vendeurs et retraits : un administrateur ne peut PAS modifier un solde à
  la main (aucune route de modification directe) ; les retraits suivent le flux
  demander → décider (approuver/rejeter) → notifier, tout audité ; anti
  double-dépense (2e retrait du même solde refusé 422, testé dans
  `scripts/launch-test.sh`).
- ✅ Identifiants de transaction FedaPay conservés (`transactionId`) ;
  confirmation des paiements via webhook signé + double vérification serveur.
- ✅ Secrets de paiement : jamais dans le code ni en clair dans les journaux
  (chiffrés en base via `APP_SECRET`, réponse API masquée).
- ✅ Commission : fixée par le propriétaire uniquement (§ « Paramètres »).
- ⬜ Clés d'idempotence explicites sur les paiements / limites de montants et
  fréquences : partiellement couvert par les contrôles existants, à formaliser.
- ⬜ Double validation (2 personnes) des opérations critiques : à venir (tranche 2).

## 7. Journal d'audit — 🟡 Partiel (solide)

- ✅ Toute action sensible est audité : inscription, confirmation email, connexion
  admin (échecs compris), créations/updates produits, commandes, paiements,
  retraits, config SMTP/paiements, **gestion de l'équipe et permissions
  (before/after)**, téléchargement de l'export du projet.
- ✅ Utilisateur + action + entité + résultat + horodatage + métadonnées (sans
  secrets).
- ✅ Les rôles ordinaires ne peuvent ni supprimer ni réécrire le journal (aucune
  route de suppression ; consultation réservée au propriétaire).
- ⬜ Adresse IP / contexte de session dans chaque entrée : à ajouter.
- ⬜ Politique de conservation + sauvegarde protégée du journal (les sauvegardes
  PostgreSQL relèvent désormais du fournisseur de base).

## 8. Authentification et sessions — ✅ Conforme pour l'essentiel

- ✅ Comptes individuels obligatoires (aucun partage prévu ni nécessaire).
- ✅ **MFA du propriétaire** : mot de passe + 2 codes secrets vérifiés serveur
  (temps constant), tokens de challenge à usage unique, 5 tentatives max, TTL 10 min.
- ✅ Mots de passe scrypt + sel individuel ; inscription protégée (rate-limit,
  anti-énumération 401 générique).
- ✅ Sessions en base (sha256 du token en cookie httpOnly), expiration
  (`SESSION_TTL_DAYS`), révocation immédiate à la suspension (testé).
- ✅ Réauthentification pour les opérations critiques = les 2 codes admin.
- ⬜ Affichage des sessions actives + révocation unitaire à distance (la
  révocabilité totale existe déjà) : écran à venir.
- ⬜ Alertes « connexion inhabituelle » : à venir.

## 9. Protection des actifs et de l'infrastructure — 🟡 Partiel

- ✅ Aucun secret dans le code source ni le dépôt (chasse régulière ; durcissement
  vérifié : `OWNER_PASSWORD`, `ADMIN_CODE_1/2` lus dans l'env, refus d'exécution
  sans).
- ✅ Secrets applicatifs chiffrés en base (AES-256-GCM) ; recommandation .env local.
- ✅ Sauvegardes gérées par le fournisseur PostgreSQL — ⬜ chiffrement et test de
  restauration à formaliser.
- ⬜ Domaine/hébergement/comptes fournisseurs sous contrôle exclusif du propriétaire
  : procédure opératoire à documenter (hors code).
- ⬜ Séparation dev/test/prod complète (les bases et variables de chaque
  environnement Vercel restent à configurer séparément).

## 10. Tableau de bord du propriétaire — ✅ Conforme
Vue d'ensemble (KPI réels : utilisateurs, boutiques, produits, commandes, GMV,
commissions), Utilisateurs, **Équipe (rôles/permissions)**, Boutiques, Produits,
Commandes, Avis, Retraits, Annonce, Audit, Paramètres (SMTP/paiements critiques +
export du projet). Fonction d'urgence : suspension de compte avec révocation de
sessions (✅).

## 11. Tableau de bord du Greffier principal — ⬜ À venir
Les rôles/permissions existent ; la vue dédiée « demandes en attente / tâches » est
tranche 2. Aucune commande de transfert de propriété n'existe nulle part dans le
SaaS (✅ conforme par construction).

## 12. Suspension et départ d'un collaborateur — ✅ Conforme
- ✅ Suspension immédiate + révocation de TOUTES les sessions (testé : 200 → 401).
- ✅ Journalisation de la décision (STAFF_UPDATED avec avant/après).
- ✅ Les accès API sont refusés dès la suspension (vérification du statut à chaque
  requête).
- ⬜ Rotation des secrets externes que le collaborateur aurait connus : procédure à
  documenter (les secrets applicatifs sont chiffrés et ne sont jamais affichés).

## 13. Exigences techniques d'implémentation — ✅ Conforme (méthode suivie)
- ✅ Analyse de l'existant AVANT modification (présent document).
- ✅ Aucune fonctionnalité supprimée ; restauration d'incident vérifiée après
  régression d'environnement.
- ✅ **Migration versionnée** `prisma/migrations/1_rbac_staff_permissions/` + **sauvegarde
  avant changement de schéma** (`backups/backup-avant-rbac-*.db`).
- ✅ Contrôles d'autorisation côté serveur pour chaque route sensible (jamais
  seulement l'UI) ; refus par défaut.
- ✅ Validation des entrées (Zod) partout ; erreurs utiles sans fuite interne.
- ✅ Transactions de base de données pour les changements critiques
  (`db.$transaction` dans PATCH staff).
- ✅ Documentation : ce document + `docs/cahier-des-charges-…pdf` + GUIDE-VS-CODE.md.

## 14. Tests d'acceptation obligatoires — ✅ Passés (API réelle, session réelle)

Exécutés après implémentation (compte de test « Collaborateur Test E2E », supprimé ensuite) :

| Test (§14) | Résultat |
|---|---|
| Un utilisateur standard ne peut pas modifier son rôle/permissions | ✅ `PATCH /api/admin/staff/[self]` par le Greffier → **403** |
| Le Greffier principal ne peut pas se promouvoir ni toucher au propriétaire | ✅ auto-permission → **403** ; compte propriétaire → 403/409 (protégé) |
| Aucun non-autorisé ne consulte les données protégées | ✅ `GET /api/admin/staff` par Greffier → **403** ; routes admin → 401 sans session |
| Les modifications de permissions prennent effet côté serveur et sont consignées | ✅ effective recalculée immédiatement ; audit `STAFF_UPDATED` avec `permissionsBefore/After` |
| Les opérations financières sensibles nécessitent les approbations prévues | ✅ approbation de retrait réservée au propriétaire (rôle), audité |
| Les soldes/transactions ne sont pas modifiables directement | ✅ aucune route de modification directe de solde |
| Les journaux d'audit ne peuvent pas être supprimés par les rôles ordinaires | ✅ aucune route de suppression d'audit |
| La suspension révoque effectivement sessions et accès | ✅ session du greffier suspendu : **200 → 401** immédiat |
| Les contrôles sont testés sur l'API et le serveur | ✅ tous les tests ci-dessus sont des appels API directs (pas seulement l'interface) |

## 15. Livrables attendus — 🟡 Avancement

| Livrable (§15) | État |
|---|---|
| Matrice des rôles et permissions par défaut | ✅ `src/lib/staff.ts` (catalogue + table §4) |
| Écrans d'administration utilisateurs, rôles, permissions | ✅ onglets Utilisateurs + Équipe (création, permissions, suspension) |
| Tableau de bord propriétaire | ✅ (§10) |
| Tableau de bord Greffier principal | ⬜ tranche 2 |
| Workflow de validation des opérations financières sensibles | 🟡 base posée (retraits) ; double validation 2-personnes à venir |
| Journal d'audit consultable et protégé | ✅ |
| Tests automatisés d'autorisation et de sécurité | 🟡 E2E manuels (curl + navigateur) exécutés et consignés ; suite automatisée à venir |
| Documentation technique + procédures | ✅ README, GUIDE-VS-CODE, ce document ; ⬜ procédure de sauvegarde/restauration chiffrée + départ collaborateur à finaliser |

## 16. Risques signalés & dépendances (instruction §16)

1. **Environnement d'exécution instable** : des restaurations de sandbox ont déjà
   reculé le code/base/.env (documenté dans le journal de développement). Atténuations
   en place : commits réguliers, `scripts/doctor.ts` au démarrage, sauvegardes
   `backups/`, secrets hors code source. Recommandation : hébergement propre (VPS)
   avec Git distant + sauvegardes chiffrées.
2. **Migration SQLite → PostgreSQL** : le schéma et les migrations PostgreSQL sont
   préparés ; les données SQLite locales ne sont pas transférées automatiquement.
3. **Workflow d'approbation à 2 personnes** : la double validation exige au moins 2
   comptes actifs par procédure — à implémenter en tranche 2 avec notifications.
4. **Écrans par permission** : tant que la tranche 2 n'est pas livrée, les
   collaborateurs n'ont pas de vue admin dédiée (ils ne peuvent rien faire côté
   admin — sécurisé, mais fonctionnellement limité).

---

*Conformité vérifiée par tests API réels (sessions réelles, compte de test supprimé
ensuite) et par navigation complète. Aucune fonctionnalité existante n'a été
supprimée ; aucune donnée réelle n'a été purgée.*
