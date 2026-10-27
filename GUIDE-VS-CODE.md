# BILLOGRAPH — Guide d'ouverture du projet dans VS Code

Bienvenue ! Cette archive contient le **code source complet** de votre plateforme
BILLOGRAPH (marché multi-vendeurs de produits numériques et physiques, FCFA, UI française),
prête à être ouverte dans **Visual Studio Code** sur votre propre machine.

---

## 1. Contenu de l'archive

| Dossier / fichier | Rôle |
|---|---|
| `src/` | Code source complet : interface (React/Next.js) + API (routes `/api/...`) |
| `prisma/` | Schéma de la base de données (`schema.prisma`) + scripts (`seed.ts`, `purge-demo.ts`) |
| `public/` | Logo, favicon, `og-image`, manifest — assets publics |
| `scripts/` | Scripts de génération des assets de marque |
| `DATABASE_URL` / `DIRECT_URL` | Connexions à la base PostgreSQL (application / migrations) |
| `storage/uploads/` | Stockage local temporaire des fichiers en développement |
| `.env` | Variables d'environnement (⚠️ contient des secrets — à ne jamais partager ni publier) |
| `.git/` | **Historique Git complet** (tous les commits, la possibilité de revenir en arrière) |
| `.vscode/` | **Réglages VS Code préconfigurés** : à l'ouverture, VS Code vous proposera d'installer les 4 extensions recommandées (ESLint, Tailwind, Prisma, Prettier) en un clic |
| `package.json` + `bun.lock` | Liste exacte des dépendances |
| `GUIDE-VS-CODE.md` | Ce guide |
| `README.md`, `API_CONTRACTS.md` | Documentation du projet |

> 💡 **L'archive extrait un UNIQUE dossier nommé `billograph`** : tout est dedans,
> rien ne se disperse. Ouvrez ce dossier dans VS Code et c'est parti.

---

## 2. Prérequis (à installer une seule fois)

1. **Visual Studio Code** — https://code.visualstudio.com
2. **Bun** (fortement recommandé, c'est l'outil utilisé par le projet) :
   - Windows (PowerShell) : `powershell -c "irm bun.sh/install.ps1 | iex"`
   - macOS / Linux : `curl -fsSL https://bun.sh/install | bash`
   - *(Alternative : Node.js 20+ depuis https://nodejs.org fonctionne aussi — voir §6.)*
3. **Git** (optionnel, pour conserver l'historique) : https://git-scm.com

### Extensions VS Code (installables en 1 clic à l'ouverture du projet)
Le projet inclut le fichier `.vscode/extensions.json` : dès l'ouverture du dossier,
VS Code propose d'installer automatiquement :
- **ESLint** (qualité du code) · **Tailwind CSS IntelliSense** (autocomplétion CSS)
- **Prisma** (schéma de base) · **Prettier** (formatage automatique)
- Le formatage à l'enregistrement est déjà activé (`.vscode/settings.json`).

---

## 3. Démarrage rapide (7 étapes, ~5 minutes)

1. **Dézippez l'archive** (clic droit → « Extraire tout… ») : un seul dossier
   **`billograph`** est créé.
2. **Ouvrez ce dossier dans VS Code** : `Fichier` → `Ouvrir le dossier…` → `billograph`.
   - 💡 VS Code détecte automatiquement les extensions recommandées : acceptez
     l'installation proposée en bas à droite (ESLint, Tailwind CSS IntelliSense,
     Prisma, Prettier) — tout est déjà configuré dans le dossier `.vscode/`.
3. Ouvrez un terminal dans VS Code (`Terminal` → `Nouveau terminal`) :

```bash
# 4. Installer les dépendances (une seule fois, ~1 minute)
bun install

# 5. Générer le client Prisma (accélérateur d'accès à la base)
bunx prisma generate

# 6. Lancer le serveur de développement
bun run dev

# 7. Ouvrir le site dans votre navigateur
#    → http://localhost:3000
```

Pour lancer l'application, configurez d'abord `DATABASE_URL` et `DIRECT_URL`
dans `.env` avec les URL de votre base PostgreSQL, puis appliquez le schéma :

```bash
bun run db:migrate:deploy
```

Le stockage local `storage/uploads/` sert au développement. Sur Vercel, utilisez
un stockage objet durable avant de tester les téléversements.

---

## 4. Commandes utiles

| Commande | Rôle |
|---|---|
| `bun run dev` | Serveur de développement (http://localhost:3000) |
| `bun run lint` | Vérifier la qualité du code |
| `bun run db:migrate` | Créer/appliquer les migrations en développement |
| `bun run db:migrate:deploy` | Appliquer les migrations existantes (déploiement) |
| `bun run db:push` | Synchroniser le schéma en prototypage uniquement |
| `bun run db:generate` | Régénérer le client Prisma après un changement de schéma |
| `bun run build` | Build de production |

> Après chaque changement de schéma, générez le client (`bun run db:generate`) et
> redémarrez le serveur (`Ctrl+C` puis `bun run dev`)
> pour que le nouveau schéma soit pris en compte.

---

## 5. Notes de sécurité importantes

- **`.env` contient des secrets** (identifiants propriétaires, clés). Il est déjà
  listé dans `.gitignore` : il ne sera **jamais** envoyé sur GitHub par accident.
  Ne le copiez jamais dans un e-mail, une capture d'écran ou un dépôt public.
- **La base PostgreSQL et `storage/uploads/` contiennent vos données réelles**.
  Les fichiers locaux ne sont pas versionnés par Git et ne sont pas persistants sur Vercel.
- **Moyens de paiement** (FedaPay, MTN MoMo, Moov Money, Celtiis Cash) : les clés
  configurées dans `Admin → Réglages` sont celles de production. Pour tester localement,
  utilisez les **clés de test (sandbox)** de FedaPay depuis votre tableau de bord FedaPay.
- Pour **repartir d'une base de test vide**, créez une base PostgreSQL distincte
  et appliquez les migrations avec `bun run db:migrate:deploy`.

---

## 6. Dépannage

| Problème | Solution |
|---|---|
| `bun` n'est pas reconnu | Fermez et rouvrez le terminal après l'installation ; sinon utilisez `npm` (voir ci-dessous) |
| `npm run dev` échoue sous Windows | Le script utilise `tee` (absent de l'invite Windows). Utilisez Bun, Git Bash, WSL, ou lancez directement `npx next dev -p 3000` |
| Le port 3000 est occupé | Lancez `npx next dev -p 3001` puis ouvrez http://localhost:3001 |
| Erreur Prisma au démarrage | Relancez `bunx prisma generate` puis redémarrez le serveur |
| La page est vide / erreur au chargement | Vérifiez le terminal : les erreurs s'y affichent ; relancez `bun install` |
| Mot de passe propriétaire oublié | Le mot de passe n'est pas récupérable ; utilisez une procédure de réinitialisation sécurisée. |

---

## 7. Structure du code (pour vous repérer)

```
src/
├── app/
│   ├── page.tsx              ← point d'entrée (application à onglets #/)
│   └── api/                  ← backend (auth, produits, commandes, paiements,
│                                portefeuille, avis, admin, réglages…)
├── components/
│   ├── billograph/           ← TOUTE l'interface métier
│   │   ├── landing.tsx       ← page d'accueil
│   │   ├── storefront/       ← boutique, tunnel de vente, checkout, commande
│   │   ├── vendor/           ← tableau de bord vendeur
│   │   ├── admin/            ← back-office administrateur
│   │   └── lib/              ← hooks partagés (réglages, session, hash-route)
│   └── ui/                   ← composants shadcn/ui prêts à l'emploi
├── lib/                      ← logique serveur (auth, paiements, portefeuille,
│                                tunnel de vente, validation, limites de débit…)
└── types/                    ← types TypeScript partagés
```

**Navigation du site** (routage par hash) : `#/` accueil · `#/auth` connexion ·
`#/dashboard` vendeur · `#/admin` administrateur · `#/produit/{slug}` tunnel de vente ·
`#/mes-achats` acheteur · `#/commande/{reference}` confirmation de commande.

Bon développement ! 🚀
