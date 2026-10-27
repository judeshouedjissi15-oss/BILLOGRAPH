# BILLOGRAPH — Contrats d'API (source de vérité)

Toutes les routes sont des **API routes Next.js 16 App Router** sous `src/app/api/`.
- Réponses JSON. Erreur : `{ "error": "message" }` + code HTTP (401/403/404/422/429/500).
- Authentification : cookie httpOnly `blg_session` (posé par /api/auth/login|register).
- **Params dynamiques Next 16 : `params` est ASYNCHRONE → `const { id } = await params;`**
- Helpers à utiliser : `@/lib/api` (jsonOk, jsonError, handleApiError, readJson),
  `@/lib/auth` (requireUser, requireRole, getSessionUser, HttpError), `@/lib/db` (db), `@/lib/validation`.

Codes d'erreur : 401 non connecté · 403 rôle/ownership insuffisant · 404 introuvable · 422 validation · 429 rate-limit.

---

## AUTH

### POST /api/auth/register
Body: `{ name, email, password }` → **201** `{ emailVerificationRequired: true, email, name }`.
CONFIRMATION D'EMAIL RÉELLE ET OBLIGATOIRE :
- Le compte est créé NON vérifié (`emailVerified: false`) : la connexion reste bloquée (403).
- Un email de confirmation RÉEL part automatiquement via le SMTP configuré en admin
  (Admin → Paramètres → « Emails réels — configuration SMTP ») — lien `#/verifier-email/{jeton}` valable 24 h.
- SMTP absent ou envoi en échec → le compte est supprimé et l'inscription répond **503**
  (message clair) : la plateforme n'ouvre jamais de compte impossible à confirmer.
Erreurs: 409 si email déjà utilisé (message générique, anti-énumération). Rate-limit: 5/min par IP.
Audit: `USER_REGISTERED` (confirmation: envoyée) / `EMAIL_SEND_FAILED`.

### POST /api/auth/verify-email
Body: `{ token }` — jeton du lien reçu par email (usage unique, TTL 24 h).
→ **200** `{ verified: true, email, name }` : `emailVerified = true` (l'utilisateur peut se connecter).
Erreurs: 400 `Ce lien de confirmation est invalide, expiré (24 h) ou déjà utilisé`
(jeton inconnu / expiré / consommé — un renvoi invalide les jetons précédents).
Rate-limit: 10/min par IP. Audit: `EMAIL_VERIFIED`.

### POST /api/auth/resend-verification
Body: `{ email }` → **200** TOUJOURS générique `{ ok: true, message }` (anti-énumération),
SAUF SMTP non configuré → **503**. Envoi réel si le compte existe, n'est pas confirmé et est actif.
Rate-limit: 3/10 min par IP. Audit: `EMAIL_VERIFICATION_RESENT`.

### POST /api/auth/login
Body: `{ email, password }` (identifiant tolérant : email OU identifiant propriétaire).
- **Email non confirmé** → **403** `{ error, emailVerificationRequired: true }` : VERROU — aucune session
  avant confirmation du lien réel (le frontend affiche le panneau « Confirmez votre adresse email »
  avec bouton de renvoi). Bypass ADMIN (comptes propriétaires pré-confirmés par le script d'amorçage).
- **Utilisateur normal (email confirmé)** → **200** `{ user }` : session ouverte immédiatement (cookie httpOnly).
- **Administrateur (propriétaire)** → **200** `{ challengeRequired: true, challengeToken, step: 1, steps: 2 }` :
  AUCUNE session n'est ouverte. Le client doit valider les DEUX codes secrets
  via `/api/auth/admin-challenge` (étape 1 puis étape 2) pour obtenir la session ADMIN.
  Invisible pour les utilisateurs normaux (aucun élément admin sur #/auth).
Rate-limit: 8/min par IP + 6/min par identifiant (brute-force).
Échec: 401 `Email ou mot de passe incorrect` (message volontairement générique).
Audit: `USER_LOGIN` / `USER_LOGIN_FAILED` (email non confirmé tracé) / `ADMIN_CHALLENGE_ISSUED`.

### POST /api/auth/admin-challenge
Body: `{ token, code }` — token opaque remis par /api/auth/login, code du challenge.
- Étape 1 validée → **200** `{ verified: true, step: 2, steps: 2, challengeToken }` (token ROTATÉ).
- Étape 2 validée → **200** `{ verified: true, user }` : session ADMIN ouverte (cookie httpOnly).
Erreurs: 401 `Code incorrect. Tentatives restantes : N` · 401 `Trop de tentatives. Veuillez vous reconnecter.`
(max 5 échecs cumulés → challenge invalidé) · 401 `Vérification expirée ou invalide` (TTL 10 min) · 429 rate-limit (12/min par IP).
Sécurité: codes vérifiés 100 % serveur (hachages scrypt, jamais en clair côté client ni dans les journaux).
Audit: `ADMIN_CHALLENGE_STEP_PASSED` / `ADMIN_CHALLENGE_FAILED` / `ADMIN_CHALLENGE_INVALIDATED` / `ADMIN_LOGIN`.

### POST /api/auth/logout → 200 `{ ok: true }` (détruit la session)

### GET /api/auth/me → 200 `{ user }` | 401 `{ error }`
`user = { id, name, email, role, status }`

---

## BOUTIQUES

### GET /api/stores/mine  🔒
→ 200 `{ store | null }`. `store = { id, name, slug, description, color, phone, status, createdAt }`
Créer une boutique passe automatiquement l'utilisateur au rôle VENDEUR (côté serveur).

### POST /api/stores  🔒
Body: `{ name, slug?, description?, color?, phone? }` → **201** `{ store }`.
- Si `slug` absent → généré depuis `name` (unicité garantie serveur via `uniqueSlug`).
- 409 si slug déjà pris. Un utilisateur possède UNE seule boutique (409 sinon).
- Audit: `STORE_CREATED`.

### PATCH /api/stores/:slug  🔒 (propriétaire uniquement → 403 sinon)
Body partiel: `{ name?, description?, color?, phone? }` → 200 `{ store }`. Le slug est immuable.

### GET /api/stores/:slug  🌐 public
→ 200 `{ store, products: [...] }` — boutique ACTIVE uniquement (404 si suspendue/inconnue).
`products` = produits PUBLISHED uniquement, triés par createdAt desc:
`{ id, title, slug, description, type, category, priceXOF, imageUrl, hasFile, stock, createdAt }`
(`hasFile: boolean` — ne JAMAIS exposer fileKey).

---

## PRODUITS

### GET /api/products/mine  🔒 vendeur
→ 200 `{ products }` (tous statuts, avec fileKey masqué: `hasFile` + `fileName` + `fileSize` autorisés).

### POST /api/products  🔒 vendeur — **multipart/form-data**
Champs: `title, description?, type(DIGITAL|PHYSICAL), category, priceXOF, status(DRAFT|PUBLISHED), stock?`
+ `file?` (fichier numérique : PDF/ZIP/MP3/MP4/APK… max 25 Mo) + `image?` (image de couverture, max 5 Mo).
→ **201** `{ product }`. Le fichier est stocké hors /public via `saveUpload` (clé en base, jamais renvoyée).
- Produit PHYSICAL: `stock` requis si publié (sinon 422).
- Produit DIGITAL publié sans fichier → 422 `Ajoutez le fichier numérique avant publication`.
- Audit: `PRODUCT_CREATED`.

### PATCH /api/products/:id  🔒 vendeur propriétaire — **JSON**
Body partiel: mêmes champs texte + `status: DRAFT|PUBLISHED|ARCHIVED`. → 200 `{ product }`.
Règles identiques (publication digitale exige un fichier ; ARCHIVED masque le produit).

### DELETE /api/products/:id  🔒 vendeur propriétaire
→ 200 `{ ok: true }`. Suppression refusée (409) si le produit apparaît dans une commande payée → suggérer ARCHIVED.

### GET /api/products/slug/:slug  🌐 public
→ 200 `{ product: { id, title, slug, description, type, category, priceXOF, imageUrl, hasFile, fileName, fileSize, stock, createdAt }, store: { name, slug, color, phone? } }`
Publié uniquement (404 sinon).

---

## COMMANDES & CHECKOUT

### POST /api/orders  🌐 public (achat invité)
Body: `{ slug, quantity, customer: { name, email, phone? }, paymentMethod: "FEDAPAY" }` → **201**:
```json
{
  "order": { "reference": "BLG-XXXXXX", "status": "PENDING", "totalXOF": 5000, "paymentMethod": "FEDAPAY" },
  "checkout": { "flow": "redirect", "redirectUrl": "https://sandbox-checkout.fedapay.com/{token}?locale=fr", "reference": "BLG-XXXXXX" }
}
```
Logique serveur :
1. Paiements non configurés (aucune clé FedaPay) → **422** `Les paiements ne sont pas encore activés…`.
2. Produit PUBLISHED requis (404 sinon). Stock décrémenté **atomiquement** pour PHYSICAL
   (updateMany `stock >= quantity` → 409 `Stock insuffisant` si échec). DIGITAL: stock ignoré.
3. Client upsert par email. Commande PENDING + Payment INITIATED (transaction Prisma).
4. Commission calculée = `total * settings.commissionPercent / 100` (arrondi entier).
5. Produit **gratuit** (total 0) : aucun prestataire → provider `FREE`, commande directement
   PAID via confirmOrderPayment, checkout `{ flow: "free", reference }`.
6. Produit payant : transaction FedaPay créée (`POST /v1/transactions`, devise XOF,
   callback_url = `{origin}/#/commande/{reference}`) → checkout `{ flow: "redirect", redirectUrl }`.
7. Idempotence anti double-clic : si une commande PENDING < 10 min existe pour le même
   email+produit → **réutilisée** (200) avec une NOUVELLE transaction FedaPay (nouveau token).
- Rate-limit: 10/min par IP. Audit: `ORDER_CREATED` (jamais de secret dans les metadata).

### GET /api/orders/:reference  🌐 public (statut restreint)
→ 200 `{ order: { reference, status, totalXOF, paymentMethod, createdAt, paidAt, items: [{ titleSnapshot, quantity, unitPriceXOF }], customerEmail } }`
Utilisé par le polling du client après paiement.

### GET /api/orders/mine  🔒 vendeur — query: `?status=&q=&limit=`
→ 200 `{ orders: [{ reference, status, totalXOF, commissionXOF, paymentMethod, createdAt, paidAt, customer: { name, email, phone }, items: [{ titleSnapshot, quantity, unitPriceXOF }], downloadTokens: [{ token, expiresAt, downloadCount, maxDownloads }] }] }`
Tri desc. `q` = recherche reference/email client (insensible à la casse).

### PATCH /api/orders/:reference  🔒 vendeur propriétaire
Body: `{ action: "MARK_DELIVERED" | "CANCEL" }` → 200 `{ order }`.
- MARK_DELIVERED: autorisé si PAID (livraison physique confirmée) → status DELIVERED.
- CANCEL: autorisé si PENDING → status CANCELLED + **restock** de la quantité.
- Audit: `ORDER_MARK_DELIVERED` / `ORDER_CANCELLED`.

---

## PAIEMENTS (FedaPay — intégration réelle)

Config : clés FedaPay via Admin → Réglages → Paiements (colonne `PlatformSettings.paymentConfig`)
ou variables d'environnement prioritaires `FEDAPAY_SECRET_KEY`, `FEDAPAY_WEBHOOK_SECRET`,
`FEDAPAY_ENVIRONMENT`. La confirmation ne passe JAMAIS par le client : uniquement
`confirmOrderPayment` (source de vérité unique, idempotente), déclenchée par le webhook
vérifié + re-vérification API, ou par le polling serveur.

### GET /api/payments/status  🌐 public (no-store)
→ `{ configured: boolean, provider: "FEDAPAY" | null, environment: "sandbox" | "live" | null }`
Utilisé par le checkout pour afficher l'état d'activation des paiements.

### POST /api/payments/verify  🌐 public — rate-limit 30/min/IP
Body: `{ reference }` → 200 `{ order: { reference, status } }`.
Si la commande est PENDING : re-vérifie le statut réel de la transaction chez FedaPay
(`GET /v1/transactions/{id}`) et confirme via confirmOrderPayment (approved → PAID,
declined/canceled → FAILED, sinon reste PENDING). Idempotent. Statut terminal → réponse directe.

### POST /api/webhooks/payment  🌐 — **signature FedaPay obligatoire**
Header: `X-FEDAPAY-SIGNATURE: t=<timestamp>,s=<hex>` — hex = HMAC-SHA256(`{t}.{body brut}`,
FEDAPAY_WEBHOOK_SECRET), comparaison à temps constant (repli : HMAC simple du corps).
Flow : corps brut lu avant parsing → signature vérifiée (sinon **403** + PaymentEvent
`signatureValid:false` + audit `WEBHOOK_REJECTED`) → extraction défensive de l'id de
transaction (`entity.id ?? data.id ?? transaction.id ?? id`) → **re-vérification du statut
via l'API FedaPay (jamais de confiance au payload)** → confirmOrderPayment (appel unique).
→ 200 `{ ok: true, order: { reference, status } }`.

---

## TÉLÉCHARGEMENTS (produits numériques)

### GET /api/downloads/my?email=...  🌐 (récupération d'achats par email — MVP)
→ 200 `{ orders: [{ reference, status, createdAt, items: [{ title, productId, download: { token, expiresAt, downloadCount, maxDownloads } | null }] }] }`
Commandes PAYÉE/DELIVERED uniquement, produits DIGITAL uniquement. Si `email` absent/invalide → 422.

### GET /api/downloads?token=...  🌐
Vérifie: token existe, non expiré, downloadCount < maxDownloads, commande PAYÉE/DELIVERED, produit a un fichier.
→ **200 binaire** (`Content-Disposition: attachment; filename="..."`) + incrément downloadCount.
Sinon 404/410 `{ error }`. Ne JAMAIS servir via /public.

---

## STATISTIQUES VENDEUR

### GET /api/stats/vendor  🔒 vendeur
→ 200:
```json
{
  "totals": { "revenueXOF": 0, "commissionXOF": 0, "netXOF": 0, "ordersCount": 0, "customersCount": 0 },
  "period": { "revenueXOF": 0, "ordersCount": 0, "days": 30 },
  "series": [{ "date": "2026-02-01", "revenueXOF": 0, "ordersCount": 0 }],
  "topProducts": [{ "title": "...", "units": 0, "revenueXOF": 0 }],
  "latestOrders": [{ "reference", "status", "totalXOF", "createdAt", "customerName" }]
}
```
- Base de calcul: commandes **PAID/DELIVERED uniquement** (jamais les PENDING/FAILED).
- `series` = 30 derniers jours (jours sans vente = 0).
- `netXOF` = revenue - commission (solde disponible, avant reversement).
- `customersCount` = clients distincts de la boutique.

---

## ADMIN  🔒 rôle ADMIN (403 sinon)

### GET /api/admin/stats
→ 200 `{ users, stores, products, orders: { count, pendingCount, paidCount }, gmvXOF, commissionXOF, recentAudit: [AuditLog] }`

### GET /api/admin/users — query `?q=` → `{ users: [{ id, name, email, role, status, createdAt, storeSlug | null }] }`
### PATCH /api/admin/users/:id — body `{ role?, status? }` → 200 `{ user }`
Auto-protection: impossible de se suspendre soi-même ou de se retirer son rôle ADMIN (409).

### GET /api/admin/stores → `{ stores: [{ id, name, slug, status, ownerEmail, productsCount, createdAt }] }`
### PATCH /api/admin/stores/:id — body `{ status: "ACTIVE"|"SUSPENDED" }` → 200 `{ store }` (suspendre masque la boutique publique)

### GET /api/admin/orders — query `?status=&q=&limit=` (toutes boutiques)
### GET /api/admin/audit — query `?limit=100` → `{ logs: [...] }` (desc)
### GET /api/admin/settings → `{ settings: { commissionPercent, siteName, reviewsAutoPublish, siteTagline, heroTitle, heroSubtitle, featuresTitle, featuresSubtitle, audienceTitle, audienceSubtitle, reviewsTitle, reviewsSubtitle, ctaTitle, ctaText, contactEmail, contactPhone, whatsappNumber, socialFacebook, socialInstagram, socialTiktok, socialYoutube, socialTwitter, footerText (tous string|null — null = valeur par défaut) }, payments: { provider: "FEDAPAY", configured, environment, secretKeyMasked, webhookSecretMasked, webhookUrl } }`
(secrets toujours masqués — jamais renvoyés en clair ; `webhookUrl` = `{origin}/api/webhooks/payment`)
### PATCH /api/admin/settings — body partiel `{ commissionPercent?, siteName?, reviewsAutoPublish?, siteTagline?, heroTitle?, heroSubtitle?, featuresTitle?, featuresSubtitle?, audienceTitle?, audienceSubtitle?, reviewsTitle?, reviewsSubtitle?, ctaTitle?, ctaText?, contactEmail?, contactPhone?, whatsappNumber?, socialFacebook?, socialInstagram?, socialTiktok?, socialYoutube?, socialTwitter?, footerText?, fedapaySecretKey?, fedapayWebhookSecret?, fedapayEnvironment? }`
(textes : null/chaîne vide = retour à la valeur par défaut du code — voir `src/lib/site-content.ts`) → 200 même shape que GET (audit `SETTINGS_UPDATED` sans valeurs sensibles). Après PATCH, le frontend invalide « site-settings » → **synchronisation automatique** de tout le site (polling 15 s + focus + invalidation instantanée).

Toutes les mutations admin → AuditLog (actorUserId, action, entity, entityId, metadata).

### GET /api/admin/smtp → `{ configured, host, port, secure, user, fromName, fromEmail, passwordSet, siteUrl }`
Le mot de passe n'est JAMAIS renvoyé (`passwordSet` seulement) — stocké CHIFFRÉ AES-256-GCM (clé dérivée de `APP_SECRET`).

### PATCH /api/admin/smtp — body `{ host, port, secure, user, password?, fromName, fromEmail, siteUrl? }`
→ 200 `{ ok, message }`. `password` vide = conserver l'actuel (requis à la première configuration — 422 sinon). Audit `SMTP_CONFIG_UPDATED` (jamais le mot de passe).

### POST /api/admin/smtp/test — body `{ to }` → **200** `{ sent: true, message }` : envoi d'un VRAI email de test.
Erreurs honnêtes : 503 SMTP non configuré · 500 avec le message réel du serveur SMTP (refus d'auth, hôte injoignable…). Audit `SMTP_TEST_SENT`.

---

## AVIS DE LA COMMUNAUTÉ

### GET /api/reviews  🌐 public
→ 200 `{ reviews: [{ id, authorName, authorRole, authorCity, rating, content, createdAt }] }`
Avis **APPROVED** uniquement, 24 max, triés par modération/dépôt desc. Interrogé en continu par la page d'accueil (polling 30 s + focus) → un avis approuvé apparaît automatiquement.

### POST /api/reviews  🌐 public (connecté optionnel)
Body: `{ name (2-60), role?, city?, rating (1-5), content (10-600) }` → **201** `{ review: { id, status }, message }`.
- Statut : **PENDING** (modération admin) sauf si `reviewsAutoPublish` activé → **APPROVED**.
- Si l'auteur est connecté, l'avis est lié à son compte (userId, jamais affiché).
- Rate-limit : 5/10 min par IP (anti-spam). Audit : `REVIEW_SUBMITTED` / `REVIEW_PUBLISHED`.

### GET /api/admin/reviews  🔒 — query `?status=PENDING|APPROVED|REJECTED`
→ 200 `{ reviews: [AdminReview], counts: { total, pending, approved, rejected } }` (200 max, desc)

### PATCH /api/admin/reviews/:id  🔒 — body `{ status: "APPROVED"|"REJECTED" }` → 200 `{ review }` (horodate moderatedAt ; audit `REVIEW_MODERATED`)
### DELETE /api/admin/reviews/:id  🔒 → 200 `{ ok: true }` (suppression définitive ; audit `REVIEW_DELETED`)
Après modération, le frontend invalide « public-reviews » → la page d'accueil se met à jour automatiquement.

---

## Conventions transverses
- **Ownership vérifié en base** (userId → store → product), jamais depuis le client.
- Montants = entiers FCFA. Aucune donnée carte bancaire ne transite ni n'est stockée.
- Les mots de passe, hash de session et fileKey ne sont jamais renvoyés par les API.

## PORTEFEUILLE VENDEUR & RETRAITS

### GET /api/vendor/wallet  🔒 vendeur (ou admin pourvu qu'il ait une boutique) — 404 sans boutique
→ 200 `{ wallet: { grossXOF, commissionXOF, netXOF, pendingXOF, paidOutXOF, availableXOF }, withdrawals: [{ id, amountXOF, method, destination, status, providerRef, adminNote, requestedAt, processedAt }] }` (50 derniers retraits)
- `wallet` : dérivé 100 % de la base — revenus nets = Σ (total − commission) des commandes PAID/DELIVERED ; disponible = nets − retraits (PENDING+APPROVED+PAID).

### POST /api/vendor/withdrawals  🔒 vendeur — rate-limit 5/min/IP
- Body `{ amountXOF: int ≥ MIN_WITHDRAWAL_XOF (2 000), method: "MOBILE_MONEY"|"BANK_TRANSFER", destination: 6..120 }`
- → 201 `{ ok, withdrawal }` (statut PENDING — montant bloqué) · 422 solde insuffisant / montant invalide · 403 boutique suspendue · 404 sans boutique
- Le solde est re-vérifié DANS la transaction (anti course concurrente). Audit `WITHDRAWAL_REQUESTED` + notification `WITHDRAWAL_REQUEST` à tous les admins actifs.

### GET /api/admin/withdrawals  🔒 admin — query `?status=PENDING|APPROVED|PAID|REJECTED`
→ 200 `{ counts: { total, pending, approved, paid, rejected }, withdrawals: [{ …withdrawal, processedByName, store: { name, slug, ownerName, ownerEmail } }] }` (100 max, PENDING/APPROVED d'abord)

### POST /api/admin/withdrawals/:id  🔒 admin
- Body `{ action: "approve"|"mark_paid"|"reject", providerRef?, adminNote? }`
- Transitions : approve (PENDING→APPROVED) · mark_paid (PENDING/APPROVED→PAID, **providerRef obligatoire** = référence du transfert réel effectué hors plateforme) · reject (PENDING/APPROVED→REJECTED, **adminNote obligatoire**, fonds libérés)
- → 200 `{ ok, withdrawal }` · 404 inconnu · 409 déjà traité (PAID/REJECTED) ou transition invalide · 422 champs manquants
- Audits `WITHDRAWAL_APPROVED` / `WITHDRAWAL_PAID` / `WITHDRAWAL_REJECTED` + notification `WITHDRAWAL` au vendeur (titre/body selon la décision).

## NOTIFICATIONS (in-app)

### GET /api/notifications  🔒 tout utilisateur connecté
→ 200 `{ unreadCount: number, items: [{ id, type: "SALE"|"PAYMENT"|"WITHDRAWAL"|"WITHDRAWAL_REQUEST"|"SYSTEM", title, body, link, read, createdAt }] }` (20 plus récentes)

### POST /api/notifications/read  🔒 tout utilisateur connecté
- Body `{ all: true }` ou `{ ids: ["…"] }` — seules les notifications de l'utilisateur sont touchées.
- → 200 `{ ok: true, marked: number }`

Événements générateurs (côté serveur, jamais bloquants) :
- `confirmOrderPayment` (webhook authentifié, polling verify, ou produit gratuit) → notification `SALE`/`PAYMENT` au propriétaire de la boutique (lien vers `#/dashboard/commande/{ref}`).
- Demande de retrait → `WITHDRAWAL_REQUEST` à tous les admins actifs.
- Décision admin sur un retrait → `WITHDRAWAL` au vendeur.
- Lectures : cloche du header (polling 30 s + focus), POST read, navigation vers `link`.

## PAGES LÉGALES (vues hash, sans API)
- `#/cgu` — Conditions générales d'utilisation (rôles, commissions/retraits, interdits, droit béninois).
- `#/confidentialite` — Politique de confidentialité (données collectées, finalités, conservation, tiers=FedaPay, sécurité, droits APDP — loi n° 2017-20).
- `#/remboursement` — Politique de remboursement (numériques : pas de remboursement après téléchargement sauf défaut avéré / non-livraison ; physiques : 7 jours ouvrables par défaut ; commandes non abouties remboursées).
- Liens en pied de page (section Informations) + navigation croisée entre documents.

## RECHMIAL IA (assistante d'analyse — SDK serveur z-ai-web-dev-sdk)

Sécurité transverse : session ACTIVE obligatoire (tous rôles) · rate limit 20 msg/10 min/utilisateur (429) · messages 1–2000 caractères nettoyés (422) · contexte injecté au modèle = agrégats du SEUL compte connecté (vendeur : ses ventes/produits ; admin : agrégats plateforme ; client : ses achats) — aucune donnée personnelle d'autrui, aucun secret · prompt système protégé (l'IA refuse de le révéler) · audit `AI_CHAT` SANS contenu · rendu frontend en texte/markdown React échappé (jamais de HTML brut). L'IA conseille et analyse — elle n'exécute aucune action. L'auteur du site (HOUEDJISSI Judes B.) est présenté brièvement si demandé, sans invention.

### POST /api/ai/chat  🔒 tout utilisateur connecté
- Body `{ message: string (1–2000), conversationId?: string }`
- → 200 `{ conversationId, reply }` — conversation créée au 1er message (titre = début du message).
- → 401 non connecté · 404 conversation inexistante ou d'autrui (anti-énumération) · 422 invalide · 429 quota · 502 modèle indisponible · 504 délai (>60 s).

### GET /api/ai/conversations  🔒 tout utilisateur connecté
→ 200 `{ conversations: [{ id, title, updatedAt }] }` (30 dernières, SES conversations uniquement)

### GET /api/ai/conversations/[id]  🔒 propriétaire uniquement
→ 200 `{ id, title, messages: [{ id, role: "user"|"assistant", content, createdAt }] }` · 404 sinon

### DELETE /api/ai/conversations/[id]  🔒 propriétaire uniquement
→ 200 `{ ok: true }` + audit `AI_CONVERSATION_DELETED` · 404 sinon

Vue : `#/rechmial` (entrées : navigation header connectés, menu compte, menu mobile).
