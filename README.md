# BILLOGRAPH

Plateforme e-commerce SaaS multi-vendeurs pour les entrepreneurs du **Bénin et de l'Afrique francophone** : créez votre boutique en ligne, vendez des **produits numériques** (ebooks, formations, logiciels, fichiers) et **physiques**, encaissez en **FCFA (XOF)**.

> **Statut : MVP fonctionnel, paiements réels.** L'ensemble des parcours est réellement implémenté et testé de bout en bout. Le mode démo a été **supprimé** : les paiements passent par l'agrégateur **FedaPay** (MTN MoMo, Moov Money, cartes en FCFA) et s'activent dès que les clés marchandes sont configurées (voir § Paiements).

---

## 1. Démarrage rapide

```bash
bun install                # dépendances
bun run db:generate        # génère le client Prisma
bun run db:migrate:deploy   # applique les migrations PostgreSQL
bun prisma/seed.ts         # crée le compte PROPRIÉTAIRE (mot de passe via OWNER_PASSWORD)
bun run dev                # serveur de développement sur le port 3000
bun run lint               # ESLint
```

### Base PostgreSQL sur Vercel (test en ligne)

Le projet utilise PostgreSQL via Prisma. Dans Vercel, ajoutez l'intégration Neon
depuis le Marketplace, puis configurez ces variables pour les environnements
**Production**, **Preview** et **Development** :

| Variable Vercel | Valeur |
|---|---|
| `DATABASE_URL` | URL PostgreSQL pooled de Neon (hôte contenant `-pooler`) |
| `DIRECT_URL` | URL PostgreSQL directe de Neon (hôte sans `-pooler`) |
| `APP_SECRET` | La même clé secrète que dans votre `.env` local |
| `OWNER_PASSWORD` | Mot de passe fort initial du compte propriétaire |
| `ADMIN_CODE_1` / `ADMIN_CODE_2` | Deux codes secrets uniques pour le challenge administrateur |

Ne collez jamais ces valeurs dans Git. Pour appliquer le schéma à la base distante
avant le premier déploiement, placez les deux URL dans votre `.env` local, puis
exécutez `bun run db:migrate:deploy`. Le build Vercel génère le client Prisma ;
les migrations sont une étape séparée et ne doivent pas être exécutées avec
`db:push --accept-data-loss` sur une base de production.

Vercel n'offre pas de disque persistant aux fonctions : les fichiers envoyés
dans `storage/uploads/` ne constituent donc pas un stockage durable en ligne.
Configurez un stockage objet (S3 compatible) avant de tester durablement les
téléversements et téléchargements de fichiers.

### Compte propriétaire (bootstrap)

Le seed crée **uniquement** le compte propriétaire (`hjbilede@05`, rôle ADMIN) : `OWNER_PASSWORD="…" bun prisma/seed.ts` — **aucune valeur par défaut**, refus de création sans variable. Son hash scrypt est stocké en base, jamais le mot de passe. Vendeurs et clients s'inscrivent eux-mêmes depuis l'interface : aucune donnée de démonstration n'est injectée.

### Identité visuelle (logo officiel)

Le logo officiel BILLOGRAPH (fond noir, « B » + panier Afrique, wordmark bleu/orange) est intégré partout : favicon, en-tête, pied de page, page de connexion, hero de l'accueil et aperçus réseaux sociaux.

```bash
bun scripts/build-brand-assets.mjs   # régénère tous les assets depuis upload/billograph-logo.png
```

Assets générés (source unique : le logo officiel, analyse + recadrage automatiques) :

| Fichier | Usage |
|---|---|
| `public/brand/logo-full.png` | Logo complet (512×512) — hero accueil, page de connexion |
| `public/brand/logo-emblem.png` | Emblème seul (512×512) — en-tête, pied de page (`Logo`) |
| `src/app/favicon.ico` | Favicon multi-tailles (16→256 px) |
| `src/app/icon.png` / `apple-icon.png` | Icônes navigateur / iOS (192 / 180 px) |
| `src/app/opengraph-image.png` + `twitter-image.png` | Bannières sociales **1200×630** (og:image, twitter:card `summary_large_image`) |

Couleurs de marque échantillonnées du logo : bleu `#0049bf` (« BILLO ») et orange `#fc6a01` (« GRAPH »).

---

## 2. Choix techniques (et pourquoi)

| Sujet | Choix MVP | Cible production | Justification |
|---|---|---|---|
| Framework | **Next.js 16 + TypeScript** (App Router) | idem | SSR/SEO pour les pages publiques, API routes intégrées, écosystème unique |
| UI | **Tailwind CSS 4 + shadcn/ui** (New York) | idem | Composants accessibles, cohérents, maintenables ; palette originale vert profond + ambré |
| Base de données | **PostgreSQL via Prisma** | **PostgreSQL + Prisma** | PostgreSQL hébergé via Neon (intégration Vercel) ; URLs séparées pour les requêtes applicatives et les migrations |
| Auth | Sessions serveur en base + cookie **httpOnly**, hachage **scrypt** (node:crypto) | + vérification email, 2FA, NextAuth | Zéro dépendance crypto externe ; le hash de session (sha256) n'est jamais stocké en clair ; anti brute-force par rate-limit |
| Stockage fichiers | **Système de fichiers local hors `/public`** (`storage/uploads/`) | **S3 / MinIO** avec URLs signées | Les fichiers numériques ne sont JAMAIS servis statiquement : uniquement via `/api/downloads?token=…` (voir § Sécurité). L'interface `src/lib/storage.ts` isole ce choix |
| Emails transactionnels | **Non implémenté (MVP)** | Resend / Mailjet / SMTP local | Le reçu est affiché à l'écran + historique dans « Mes achats ». Point d'extension : `confirmOrderPayment()` est l'endroit unique où brancher l'envoi d'email |
| Tâches asynchrones | Aucune (tout transactionnel, à l'échelle MVP) | File de jobs (BullMQ / cron) | Pas de besoin réel tant que le volume est faible ; les webhooks sont traités en ligne avec idempotence |
| Tests | Vérification manuelle E2E (navigateur) + contrôles API curl | Vitest + Playwright CI | Périmètre MVP — voir § Limites |
| Mono-tenant navigation | **SPA par hash** (`#/`) sur la route `/` | Sous-domaines par boutique (`maboutique.billograph.bj`) | Contrainte de l'environnement de préview (une seule route) ; le routage par hash est encapsulé dans `use-hash-route.ts` pour basculer facilement vers de vraies routes |

**Montants** : tous les montants sont des **entiers FCFA** (pas de décimales → aucune erreur d'arrondi, colonnes `Int`).
**Commission** : configurable par l'admin (`PlatformSettings.commissionPercent`, **10 %** par défaut, affichée en direct sur la page d'accueil), calculée à la création de commande, distinguée du CA dans toutes les statistiques (`revenueXOF` ≠ `netXOF`). **Modèle économique : commission totale tout compris** — elle inclut les frais de paiement (FedaPay) ; l'acheteur paie le prix affiché, le vendeur reçoit le prix moins cette commission unique et ne paie aucun frais supplémentaire.

---

## 3. Architecture

```
src/
├── app/
│   ├── page.tsx                  # SPA unique : routeur par hash + shell (header/footer sticky)
│   ├── layout.tsx                # Metadata FR/SEO, lang="fr"
│   └── api/                      # BACKEND (API routes — la seule source de vérité)
│       ├── auth/                 # register, login (rate-limit), logout, me
│       ├── stores/               # mine, CRUD, page publique [slug]
│       ├── products/             # mine, POST multipart, PATCH/DELETE, page publique, images
│       ├── orders/               # checkout public, mine (vendeur), [reference] GET/PATCH
│       ├── payments/             # status (public), verify (polling serveur)
│       ├── webhooks/payment/     # webhook FedaPay signé (re-vérification API obligatoire)
│       ├── downloads/            # my?email= + ?token= (livraison sécurisée)
│       ├── stats/vendor/         # KPIs vendeur (base: commandes PAYÉES uniquement)
│       ├── admin/                # stats, users, stores, orders, audit, settings
│       └── images/[...key]/      # service d'images publiques (whitelist extensions)
├── components/billograph/        # UI BILLOGRAPH (landing, auth, vendeur, boutique, admin…)
├── lib/                          # auth, storage, payments (providers), validation Zod, audit…
├── types/api.ts                  # types partagés frontend/backend
prisma/
├── schema.prisma                 # User, Session, Store, Product, Customer, Order, OrderItem,
│                                 # Payment, PaymentEvent, DownloadToken, PlatformSettings, AuditLog
└── seed.ts                       # bootstrap admin uniquement (aucune donnée de démonstration)
storage/uploads/                  # fichiers numériques PRIVÉS (jamais dans /public)
```

Contrat d'API complet : **`API_CONTRACTS.md`** (shapes exactes, codes d'erreur, règles de sécurité).

---

## 4. Fonctionnalités implémentées (vérifiées en navigateur)

### Parcours acheteur
- Page de vente publique (`#/produit/{slug}`) : image, badges, prix FCFA, description, réassurance.
- Checkout invité : coordonnées + choix du moyen de paiement + quantité (produits physiques, plafonnée au stock).
- Commande en attente → **confirmation vérifiée serveur** (une seule fois) → page de confirmation avec reçu.
- **Livraison numérique sécurisée** : jeton de téléchargement (30 jours, 5 téléchargements max), fichier privé servi par l'API.
- « Mes achats » : récupération des liens par email (sans compte).

### Parcours vendeur
- **Inscription avec confirmation d'email réelle** : à l'inscription, un email RÉEL part automatiquement (SMTP configuré par l'admin, mot de passe chiffré AES-256-GCM). La CONNEXION RESTE BLOQUÉE tant que l'adresse n'est pas confirmée via le lien reçu (`#/verifier-email/{jeton}`, valable 24 h, usage unique). Panneau dédié sur la page de connexion avec renvoi d'email (anti-énumération, rate-limit 3/10 min). Sans SMTP configuré, l'inscription répond 503 avec un message clair (aucun compte impossible à confirmer).
- Création guidée de boutique (nom, slug unique, description, couleur, téléphone) — rôle promu `VENDEUR` côté serveur.
- Produits : création **multipart** (fichier numérique ≤ 25 Mo, image de couverture ≤ 5 Mo), brouillon/publié/archivé, suppression contrôlée (refusée si commandes liées), garde-fous de publication (PDF requis pour un digital, stock requis pour un physique).
- Commandes : liste filtrable/recherchable, détail, commission, liens de téléchargement, marquage « Livrée », annulation avec **restock**.
- Tableau de bord : revenus totaux / 30 jours, commandes payées, **solde net de commission**, graphique 30 jours, top produits, dernières commandes. Calculs basés **uniquement** sur les commandes payées/livrées.
- **Portefeuille vendeur** (onglet dédié) : solde disponible, revenus nets, commissions plateforme, retraits en cours/versés ; **demande de retrait** (Mobile Money ou virement, minimum 2 000 FCFA, montant bloqué jusqu'à décision, re-vérification du solde dans la transaction anti double-dépense).

### Parcours administrateur
- Accès **fusionné et masqué** : le propriétaire se connecte sur la page de connexion utilisateur standard (#/auth) — aucun élément admin n'y est visible. Après reconnaissance de ses identifiants, le serveur exige une **VÉRIFICATION DE SÉCURITÉ à deux codes secrets** (étape 1 puis étape 2, vérification 100 % serveur, token rotaté, max 5 tentatives, expiration 10 min). La session ADMIN n'est ouverte qu'après le second code → redirection #/admin. Les autres utilisateurs reçoivent leur session directement et ne voient jamais ce flux.
- Stats plateforme (utilisateurs, boutiques, produits, commandes, GMV, commissions), gestion des utilisateurs (rôles, suspension avec auto-protection), gestion des boutiques (suspendre = masquage public), commandes globales, **modération des avis** (approuver / rejeter / supprimer), **retraits vendeurs** (pré-valider / marquer versé avec référence réelle du transfert / rejeter avec motif — fonds libérés), **journal d'audit**. Le rôle ADMIN n'est attribuable par **aucune API** et le compte propriétaire est protégé.
- **Paramètres = tout le site modifiable** : commission (10 % par défaut, tout compris — frais de paiement inclus), nom du site, badge, titre/sous-titre du héros, titres des sections (fonctionnalités, pour qui, avis), CTA final, texte de pied de page, email/téléphone/WhatsApp de contact, réseaux sociaux (Facebook, Instagram, TikTok, YouTube, X), mode de publication des avis, configuration FedaPay. Un champ vide = retour à la valeur par défaut.
- **Emails réels (SMTP)** : carte « Emails réels — configuration SMTP » dans Paramètres — serveur, port, SSL/TLS, utilisateur, mot de passe (CHIFFRÉ AES-256-GCM via `APP_SECRET`, jamais renvoyé ni journalisé), expéditeur, URL publique du site (liens des emails) + **envoi d'un email de test réel** pour valider la configuration. Sans cette configuration, les inscriptions sont en attente (503) et les comptes propriétaires restent accessibles (pré-confirmés).
- **Synchronisation automatique** : chaque enregistrement invalide la requête partagée « site-settings » (TanStack Query) → la page d'accueil, le header et le footer se mettent à jour INSTANTANÉMENT pour l'admin, et en ~15 s maximum pour les autres visiteurs (polling + revalidation au focus), sans aucun rechargement.

### Avis de la communauté
- Les visiteurs (connectés ou non) déposent un avis depuis la page d'accueil : nom, profession, ville, note 1-5 étoiles, texte (600 car. max) — formulaire EN PAGE (aucun dialog), rate-limit anti-spam (5/10 min/IP).
- Modération par défaut : l'avis part en PENDING et n'apparaît qu'après validation dans l'admin (onglet Avis). Option « Publication automatique » dans Paramètres. Les avis approuvés s'affichent automatiquement sur la page d'accueil.

### Notifications in-app
- Cloche dans le header (tous les comptes) : compteur non-lu, liste des 20 dernières, « Tout marquer comme lu », navigation directe vers la commande concernée. Polling léger (30 s) + rafraîchissement au focus.
- Événements notifiés : **nouvelle vente / paiement confirmé** (vendeur), **paiement échoué** (vendeur), **demande de retrait** (admins), **décision de retrait** — pré-validé, versé, refusé (vendeur). Écriture fire-and-forget : une notification ne peut jamais casser un paiement.

### Pages légales
- `#/cgu`, `#/confidentialite`, `#/remboursement` : documents complets rédigés pour la plateforme (rôles vendeurs/acheteurs, commissions et retraits, droit béninois, loi n° 2017-20 / APDP, politique de remboursement différenciée numérique/physique). Liens en pied de page.

### Sécurité
- Validation **Zod côté serveur** sur toutes les entrées ; réponses d'erreur sans fuite interne.
- Autorisation par rôle et **ownership vérifié en base** (produit → boutique → owner) — anti-IDOR.
- Sessions httpOnly + SameSite=Lax ; mots de passe scrypt + sel ; rate-limit login (8/min/IP), register (5/min/IP), checkout (10/min/IP) ; **challenge admin** (2 codes secrets serveur, max 5 tentatives, token rotaté, rate-limit 12/min/IP).
- Webhooks : **HMAC-SHA256 obligatoire** sur le corps brut, événements horodatés (`PaymentEvent.signatureValid`), rejet audité.
- Idempotence des paiements (une commande ne peut être payée deux fois ; re-confirmation sans effet) et anti double-clic au checkout (réutilisation d'une commande PENDING < 10 min).
- Décrément de stock **atomique** (`updateMany stock >= qty`) — anti survente.
- Fichiers numériques : clés privées jamais exposées, service uniquement par jeton lié à une commande payée, protection contre la traversée de répertoires.
- Journal d'audit sur les événements sensibles (login, paiements, publications, actions admin).

---

## 5. Paiements réels — FedaPay

Les paiements sont **réels** et passent par **FedaPay** (fedapay.com), agrégateur basé en Afrique de l'Ouest qui couvre le Bénin : **MTN Mobile Money, Moov Money, Visa/Mastercard**, devise **XOF/FCFA** native. Aucun mode démo n'existe dans la plateforme.

### Architecture
- `src/lib/payments.ts` : provider `FEDAPAY` (création de transaction `POST /v1/transactions`, page de paiement hébergée, vérification `GET /v1/transactions/{id}`) + interface `PaymentProvider` prête pour d'autres prestataires.
- Checkout : l'acheteur est **redirigé vers la page de paiement hébergée FedaPay** puis renvoyé vers `/#/commande/{référence}` (callback).
- Confirmation **jamais côté client** : webhook signé (`X-FEDAPAY-SIGNATURE`, HMAC-SHA256 timing-safe) + **re-vérification systématique du statut via l'API FedaPay**, ou polling serveur `POST /api/payments/verify`. Tout passe par `confirmOrderPayment()` (unique, idempotent).
- Produits gratuits (0 FCFA) : aucune transaction, fournisseur `FREE`, livraison numérique immédiate.
- Les produits des vendeurs restent payables **uniquement** si les paiements sont configurés : sans clés, le checkout affiche « Les paiements ne sont pas encore activés » — aucune commande ne peut être créée (jamais de fausse confirmation).

### Activation (5 minutes, sans code)
1. Créez un compte sur **fedapay.com** (gratuit) — mode **Sandbox** disponible immédiatement pour tester, mode **Live** après validation marchand (KYC entreprise) pour encaisser réellement.
2. Dans l'espace **Admin → Réglages → Paiements** : collez la **clé secrète API** (`sk_sandbox_…` ou `sk_live_…`), le **secret de webhook**, choisissez l'environnement (Sandbox/Live) et enregistrez.
3. Dans le dashboard FedaPay → **Webhooks** : renseignez l'URL affichée dans l'admin (`{votre-domaine}/api/webhooks/payment`).
4. Testez un achat réel en Sandbox (FedaPay fournit des numéros de test Mobile Money), puis basculez en **Live**.

Alternative DevOps : les variables d'environnement `FEDAPAY_SECRET_KEY`, `FEDAPAY_WEBHOOK_SECRET`, `FEDAPAY_ENVIRONMENT` (voir `.env`) **priment** sur la configuration admin.

### Coûts & conditions (à vérifier chez FedaPay avant mise en production)
- Compte marchand + KYC (pièce d'identité, IFU/RCCM pour une entreprise) pour le mode Live.
- Frais par transaction (paris régionales ~2-3 % + plafond de frais) ; versements sur Mobile Money ou banque.
- Prestataires directs alternatifs possibles plus tard (MTN MoMo API, Moov, Flooz via agrégateurs) : l'interface `PaymentProvider` les accueille sans toucher au reste de l'application.

À ne jamais faire (et que la plateforme empêche par construction) : marquer une commande PAYÉE côté client, stocker des données de carte, confirmer sans vérification serveur.

---

## 6. Limites du MVP & feuille de route

**Assumées et documentées :**
- Emails transactionnels non envoyés (reçu écran + « Mes achats ») — branchement prévu dans `confirmOrderPayment()`.
- Vérification email / récupération de mot de passe non implémentées.
- Produits physiques : pas de variantes (taille/couleur) ni frais de livraison configurables — stock simple + suivi manuel (« Livrée »).
- Récupération d'achats par email seul (sans compte) : pratique pour le MVP, à renforcer (code d'accès) avant production.
- Reversements vendeurs (payouts) non implémentés : le « solde disponible » est un calcul net de commission, pas un virement.
- Tests automatisés absents (vérification E2E manuelle documentée).
- Abonnements/coupons : hors périmètre (schéma prêt à accueillir `Subscription`/`Coupon`).

**Roadmap proposée** (suite du cahier des charges) : emails transactionnels → variantes & livraison → coupons → reversements → sous-domaines réels + stockage S3.
