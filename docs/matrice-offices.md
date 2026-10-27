# Matrice officielle des offices et autorisations — BILLOGRAPH

> Source de vérité du code : `src/lib/staff.ts` (catalogue) et `src/lib/auth.ts` (`requirePermission`, exécution serveur).
> Règle absolue (directive du fondateur) : **l'attribution d'un office ajoute les capacités du poste au compte existant — elle ne remplace jamais, ne bloque jamais et ne détériore jamais le compte vendeur** (rôle de base CLIENT | VENDEUR | ADMIN inchangé).
> Le propriétaire (HOUEDJISSI Judes B.) demeure l'unique SUPER_ADMIN : le rôle ADMIN n'est attribuable par aucune API et le compte propriétaire ne reçoit pas d'office.

## Architecture des comptes

| Couche | Stockage | Rôle |
|---|---|---|
| Identité du compte | `User` (id, email, nom, mot de passe scrypt) | inchangée par les offices |
| État du compte | `User.status` (ACTIVE \| SUSPENDED) | indépendant des offices |
| Rôle de base | `User.role` (CLIENT \| VENDEUR \| ADMIN) | **jamais modifié** par une attribution |
| Compte vendeur | `Store` (une boutique par propriétaire) | indépendant des offices |
| Offices attribués | `UserRole` (unique userId+role, statut, permissions JSON, mention, attribution) | AJOUT de capacités |
| Permissions | catalogue `PERMISSIONS` (22 clés) + liste effective par office (ajustable par le propriétaire) | exécutées côté serveur |
| Tâches | `StaffTask` (responsable, adjoint, priorité, échéance, état, horodatage) | données réelles |
| Traçabilité | `AuditLog` (STAFF_OFFICE_ASSIGNED / UPDATED / REVOKED / ALREADY_ACTIVE, STAFF_TASK_*, USER_STATUS_BY_OFFICER) | conservation intégrale |

Idempotence : `@@unique([userId, role])` — ré-attribuer un office déjà actif renvoie l'état courant (aucun doublon) ; un office suspendu est réactivé si une place est libre.

Plafond d'effectif : `MAX_ADJOINTS_PER_ROLE = 5` adjoints **actifs** par poste (création et réactivation en transaction → 409 au-delà ; suspendre ou retirer libère la place).

## Les 21 postes et leurs permissions de départ

Clés des permissions : `users.read` (consulter les comptes), `users.manage` (suspendre/réactiver les comptes non propriétaires), `stores.read`, `stores.manage`, `products.read`, `products.moderate`, `orders.read`, `finance.read` (rapports CA/commissions), `finance.reconcile` (préparer rapprochements soumis à approbation), `withdrawals.read`, `reviews.read`, `reviews.moderate`, `audit.read`, `security.read`, `privacy.read`, `dev.read`, `infra.read`, `community.manage`, `content.manage`, `publicity.manage`, `tasks.work`, `tasks.delegate` (déléguer aux adjoints du même poste).

| # | Poste (clé) | Mission | Espace | Permissions de départ |
|---|---|---|---|---|
| 1 | Greffier principal (`GREFFIER_PRINCIPAL`) | Assister le propriétaire, coordonner l'administration | configuré | users.read, users.manage, stores.read, tasks.work, tasks.delegate |
| 2 | Directeur général (`DIRECTEUR_GENERAL`) | Piloter les activités et coordonner les équipes | configuré | orders.read, stores.read, users.read, reviews.read, tasks.work, tasks.delegate |
| 3 | Programmeur (`PROGRAMMEUR`) | Concevoir, corriger et maintenir les fonctionnalités | à configurer | dev.read, tasks.work |
| 4 | Développeur backend (`BACKEND_DEVELOPER`) | Logique serveur, API et intégrations | à configurer | dev.read, tasks.work |
| 5 | Ingénieur DevOps (`DEVOPS_ENGINEER`) | Environnements et déploiements | à configurer | infra.read, tasks.work |
| 6 | Testeur qualité et sécurité (`QA_SECURITY_TESTER`) | Vérifier qualité et sécurité | à configurer | dev.read, tasks.work |
| 7 | Responsable cybersécurité (`RESPONSABLE_CYBERSECURITE`) | Surveiller risques, accès, incidents | configuré | security.read, audit.read, tasks.work |
| 8 | Responsable confidentialité des données (`DATA_PRIVACY_OFFICER`) | Confidentialité et protection des informations | à configurer | privacy.read, tasks.work |
| 9 | Responsable des incidents (`INCIDENT_MANAGER`) | Coordonner le traitement des incidents | à configurer | orders.read, tasks.work, tasks.delegate |
| 10 | Responsable des sauvegardes (`BACKUP_MANAGER`) | Suivi des sauvegardes et restauration | à configurer | infra.read, tasks.work |
| 11 | Auditeur interne (`INTERNAL_AUDITOR`) | Constats indépendants sur les opérations | configuré | audit.read, finance.read, tasks.work |
| 12 | Responsable financier (`FINANCE_MANAGER`) | Suivi financier, décisions autorisées | configuré | finance.read, finance.reconcile, withdrawals.read, orders.read, tasks.work |
| 13 | Comptable (`COMPTABLE`) | Suivi comptable, rapprochements | configuré | finance.read, finance.reconcile, orders.read, withdrawals.read, tasks.work |
| 14 | Contrôleur des opérations (`OPERATIONS_CONTROLLER`) | Suivi des activités et contrôles internes | configuré | orders.read, products.read, stores.read, tasks.work |
| 15 | Responsable des vendeurs (`SELLER_MANAGER`) | Accompagner les vendeurs | configuré | users.read, stores.read, orders.read, reviews.read, tasks.work |
| 16 | Support client (`CUSTOMER_SUPPORT`) | Résoudre les demandes clients | configuré | orders.read, reviews.read, tasks.work |
| 17 | Community manager (`COMMUNITY_MANAGER`) | Communications et interactions | à configurer | community.manage, reviews.read, tasks.work |
| 18 | Responsable des contenus (`CONTENT_MANAGER`) | Contenus et ressources éditoriales | à configurer | content.manage, tasks.work |
| 19 | Responsable publicité (`RESPONSABLE_PUBLICITE`) | Campagnes publicitaires | à configurer | publicity.manage, tasks.work |
| 20 | Monteur vidéo (`MONTEUR_VIDEO`) | Production audiovisuelle | à configurer | tasks.work |
| 21 | Secrétariat (`SECRETARIAT`) | Documents, communications, tâches administratives | à configurer | users.read, tasks.work |

**Espace « configuré »** = l'espace professionnel affiche déjà des modules réels branchés sur la base (comptes, commandes, finances, audit, sécurité, boutiques) selon les permissions. **Espace « à configurer »** = le poste s'affiche normalement (mission, tâches réelles, permissions actives) avec une mention explicite « Espace de travail à configurer » — le compte n'est JAMAIS bloqué et l'espace vendeur reste accessible. Le propriétaire identifie ces manques depuis l'onglet Équipe (badge par poste).

## Interdictions structurelles (vérifiées côté serveur)

- Personne ne devient SUPER_ADMIN : le rôle ADMIN n'est attribuable par aucune API ; le compte propriétaire ne reçoit pas d'office (409).
- Un officier ne peut pas s'attribuer un office ni modifier les rôles de base (routes admin réservées au propriétaire).
- `users.manage` permet uniquement la suspension/réactivation des comptes **non propriétaires** — jamais les rôles, jamais les offices, jamais le compte propriétaire, jamais son propre compte.
- La délégation de tâches (`tasks.delegate`) ne dépasse jamais les droits du délégant : uniquement à soi-même ou aux titulaires actifs du même poste.
- Le journal d'audit est immuable : aucune route de suppression ou de réécriture n'existe.
- Un office suspendu ou retiré cesse de contribuer aux permissions **immédiatement** (contrôle à chaque requête) ; le compte et l'espace vendeur restent inchangés.

## Tests de non-régression

Suite automatisée : `bun scripts/e2e41.ts` (46 vérifications, secrets fournis par variables d'environnement — jamais écrits dans le fichier). Couverture : Test A (vendeur sans office), B (attribution sans écrasement du rôle ni création de compte), C (actualisation + reconnexion), D (offices multiples, idempotence, tâches, délégation), E (retrait d'office), F (sécurité), plafond 5 adjoints, G (conservation des comptes et des données). Les comptes de test sont supprimés en fin d'exécution ; l'audit reste conservé.
