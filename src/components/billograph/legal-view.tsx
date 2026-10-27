"use client";

// PAGES LÉGALES — CGU (#/cgu), Politique de confidentialité (#/confidentialite),
// Politique de remboursement (#/remboursement). Contenu rédigé pour BILLOGRAPH :
// plateforme de marketplace SaaS (vendeurs indépendants), paiements FCFA via
// FedaPay, produits numériques à livraison automatique + produits physiques.

import { ArrowLeft, FileText, ScrollText, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { navigateTo } from "./lib/use-hash-route";
import { useSiteSettings } from "./lib/site-data";

export type LegalDocument = "cgu" | "confidentialite" | "remboursement";

const DOCUMENT_META: Record<
  LegalDocument,
  { title: string; icon: typeof ScrollText; updated: string }
> = {
  cgu: {
    title: "Conditions générales d'utilisation",
    icon: ScrollText,
    updated: "Conditions applicables à toute création de compte ou toute vente/achat sur BILLOGRAPH.",
  },
  confidentialite: {
    title: "Politique de confidentialité",
    icon: ShieldCheck,
    updated: "Comment BILLOGRAPH collecte, utilise et protège vos données.",
  },
  remboursement: {
    title: "Politique de remboursement",
    icon: FileText,
    updated: "Conditions de remboursement des achats réalisés sur BILLOGRAPH.",
  },
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-bold tracking-tight">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

function LegalContent({ document: doc }: { document: LegalDocument }) {
  if (doc === "cgu") {
    return (
      <>
        <Section title="1. Objet et acceptation">
          <p>
            Les présentes Conditions générales d&apos;utilisation (ci-après « CGU ») régissent
            l&apos;accès et l&apos;utilisation de la plateforme BILLOGRAPH, service SaaS
            d&apos;e-commerce qui permet à des vendeurs indépendants de créer une boutique en ligne
            et de vendre des produits numériques (ebooks, formations, logiciels, fichiers) et
            physiques, en franc CFA (XOF). En créant un compte, en publiant une boutique ou en
            passant une commande, vous acceptez sans réserve les présentes CGU.
          </p>
        </Section>
        <Section title="2. Rôles respectifs">
          <p>
            <strong className="text-foreground">BILLOGRAPH</strong> est un intermédiaire technique
            de mise en relation : il héberge les boutiques, encaisse les paiements via son
            prestataire agréé FedaPay (MTN MoMo, Moov Money, cartes bancaires) et reverse aux
            vendeurs le produit de leurs ventes, déduction faite de la commission annoncée sur le
            site.
          </p>
          <p>
            <strong className="text-foreground">Le vendeur</strong> est le seul responsable des
            produits qu&apos;il propose (licéité, qualité, description, livraison, conformité aux
            lois béninoises et, le cas échéant, à ses obligations fiscales). Il garantit détenir
            tous les droits nécessaires sur les fichiers numériques qu&apos;il distribue
            (notamment le droit d&apos;auteur).
          </p>
          <p>
            <strong className="text-foreground">L&apos;acheteur</strong> reconnaît que la relation
            contractuelle de vente le lie au vendeur ; BILLOGRAPH fournit le cadre technique,
            sécurisé et le service de paiement.
          </p>
        </Section>
        <Section title="3. Comptes utilisateurs">
          <p>
            L&apos;inscription requiert un nom, une adresse email valide et un mot de passe d&apos;au
            moins 8 caractères. Vous êtes seul responsable de la confidentialité de vos
            identifiants et de toute activité réalisée via votre compte. Toute utilisation
            frauduleuse ou portant atteinte à la plateforme (contenus illicites, tentatives de
            fraude au paiement, contournement des paiements, usurpation) entraîne la suspension ou
            la suppression immédiate du compte, sans préjudice des actions légales.
          </p>
        </Section>
        <Section title="4. Boutiques et produits">
          <p>
            Chaque vendeur dispose d&apos;une boutique identifiée par un slug public unique. Les
            produits doivent être décrits avec exactitude (prix en FCFA, nature numérique ou
            physique, stock). Les fichiers numériques sont stockés de façon privée et ne sont
            accessibles aux acheteurs qu&apos;après confirmation effective du paiement, via des
            liens de téléchargement sécurisés, limités en nombre (5) et en durée (30 jours), que le
            vendeur ne peut pas contourner.
          </p>
          <p>
            Sont strictement interdits : les contenus pornographiques impliquant des mineurs, les
            contenus incitant à la haine ou à la violence, les produits contrefaits, les logiciels
            malveillants, les documents falsifiés, ainsi que tout produit dont la vente est
            interdite par la loi béninoise.
          </p>
        </Section>
        <Section title="5. Paiements, commissions et retraits">
          <p>
            Les paiements sont encaissés en XOF via FedaPay, prestataire de paiement agréé ;
            BILLOGRAPH ne stocke jamais vos données de paiement (numéro de carte ou de Mobile
            Money). L&apos;acheteur paie le prix affiché du produit, sans frais cachés. La
            commission de la plateforme, affichée publiquement (et configurable par BILLOGRAPH),
            est une commission <strong>tout compris</strong> : elle couvre l&apos;ensemble des
            frais liés à la vente, y compris les frais de traitement du paiement (FedaPay). Elle
            est prélevée sur chaque vente lors de la confirmation du paiement ; le vendeur
            reçoit la totalité du prix de vente moins cette commission unique, sans aucun autre
            frais à sa charge.
          </p>
          <p>
            Le vendeur peut demander le retrait de son solde disponible depuis son portefeuille.
            Le versement est effectué vers le Mobile Money ou le compte bancaire qu&apos;il a
            indiqué, après vérification administrative. Une demande de retrait peut être refusée en
            cas de suspicion de fraude, de litige en cours ou de coordonnées invalides ; le motif
            est alors communiqué au vendeur.
          </p>
        </Section>
        <Section title="6. Responsabilité">
          <p>
            BILLOGRAPH met en œuvre les moyens raisonnables pour assurer la disponibilité de la
            plateforme, mais ne peut garantir une disponibilité ininterrompue (maintenance,
            force majeure, défaillance de prestataires). La responsabilité de BILLOGRAPH ne peut
            être engagée pour les litiges entre acheteurs et vendeurs relatifs à la nature, la
            qualité ou l&apos;usage des produits ; elle intervient toutefois pour sécuriser les
            paiements et les livraisons numériques qu&apos;elle opère.
          </p>
        </Section>
        <Section title="7. Suspension et résiliation">
          <p>
            Vous pouvez fermer votre compte à tout moment, sous réserve du traitement des commandes
            en cours et des retraits en attente. BILLOGRAPH peut suspendre ou résilier un compte en
            cas de violation des CGU, avec information du concerné.
          </p>
        </Section>
        <Section title="8. Droit applicable">
          <p>
            Les présentes CGU sont soumises au droit béninois. Tout litige relève des tribunaux
            compétents du Bénin, après tentative de règlement amiable (contact ci-dessous).
          </p>
        </Section>
      </>
    );
  }

  if (doc === "confidentialite") {
    return (
      <>
        <Section title="1. Données collectées">
          <p>
            <strong className="text-foreground">Comptes</strong> : nom, adresse email, mot de passe
            (stocké uniquement sous forme de hachage scrypt salé — jamais en clair), rôle, date de
            création.
          </p>
          <p>
            <strong className="text-foreground">Boutiques et produits</strong> : nom, slug,
            description, téléphone de contact, images et fichiers que vous téléversez.
          </p>
          <p>
            <strong className="text-foreground">Commandes</strong> : nom, email et téléphone de
            l&apos;acheteur (pour la facturation et la coordination de livraison), articles
            commandés, montant, statut.
          </p>
          <p>
            <strong className="text-foreground">Paiements</strong> : traités par FedaPay ; nous
            conservons uniquement les références de transaction, leur statut et les identifiants
            fournis par FedaPay. Vos numéros de carte ou identifiants Mobile Money ne transitent
            jamais par nos serveurs.
          </p>
          <p>
            <strong className="text-foreground">Retraits</strong> : coordonnées de versement
            (numéro Mobile Money ou coordonnées bancaires) que vous fournissez volontairement.
          </p>
          <p>
            <strong className="text-foreground">Journal technique</strong> : journal d&apos;audit
            des actions sensibles (connexions, paiements, actions administratives) et
            limitations anti-abus par adresse IP, conservées pour la sécurité du service.
          </p>
        </Section>
        <Section title="2. Finalités">
          <p>
            Vos données servent exclusivement à : fournir le service (boutiques, commandes,
            livraison automatique des produits numériques), encaisser et reverser les paiements,
            informer des événements de votre compte (ventes, paiements, retraits), assurer la
            sécurité (prévention de la fraude, journal d&apos;audit) et répondre à vos demandes de
            support via les contacts affichés sur le site.
          </p>
        </Section>
        <Section title="3. Durées de conservation">
          <p>
            Les données de compte sont conservées tant que le compte est actif, puis archivées le
            temps nécessaire aux obligations comptables et légales. Les journaux d&apos;audit sont
            conservés pour une durée limitée. Les jetons de téléchargement expirent automatiquement
            (30 jours, 5 téléchargements maximum).
          </p>
        </Section>
        <Section title="4. Partage avec des tiers">
          <p>
            Vos données ne sont ni vendues ni louées. Elles sont partagées uniquement avec :
            FedaPay (traitement des paiements — dans le cadre de l&apos;exécution de la commande)
            et, si la loi l&apos;exige, les autorités compétentes. L&apos;hébergement technique
            peut impliquer des prestataires d&apos;infrastructure tenus par la confidentialité.
          </p>
        </Section>
        <Section title="5. Sécurité">
          <p>
            Sessions par cookies httpOnly (token aléatoire, seul son hash SHA-256 est stocké),
            mots de passe hachés scrypt, webhooks de paiement authentifiés par signature
            HMAC-SHA256 et re-vérification systématique auprès du prestataire, fichiers numériques
            hors espace public (jamais accessibles par URL directe), limitation de débit
            anti-brute-force sur les points sensibles.
          </p>
        </Section>
        <Section title="6. Vos droits">
          <p>
            Vous pouvez demander l&apos;accès, la rectification ou la suppression de vos données,
            et exercer vos droits conformément à la loi n° 2017-20 portant code du numérique en
            République du Bénin (APDP), en nous écrivant via les contacts affichés en pied de page.
          </p>
        </Section>
      </>
    );
  }

  return (
    <>
      <Section title="1. Principe général">
        <p>
          Chez BILLOGRAPH, chaque vente est une transaction réelle entre un acheteur et un vendeur
          indépendant. La présente politique définit les conditions de remboursement applicables
          aux achats effectués via la plateforme. Elle complète, sans les remplacer, les CGU.
        </p>
      </Section>
      <Section title="2. Produits numériques">
        <p>
          Un produit numérique (ebook, formation, logiciel, fichier) est livré automatiquement dès
          la confirmation du paiement, via un lien de téléchargement sécurisé. Conformément à la
          nature du bien, l&apos;exécution étant immédiate et le contenu accessible dès la
          livraison :
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong className="text-foreground">Aucun remboursement n&apos;est dû</strong> une fois
            le fichier téléchargé, sauf défaut avéré (fichier corrompu, contenu manifestement
            différent de la description du vendeur, fichier inutilisable).
          </li>
          <li>
            Si le téléchargement a échoué ou si le fichier est défectueux, signalez-le depuis votre
            page de commande dans les 14 jours : le vendeur doit fournir un fichier conforme, sinon
            le remboursement intégral est effectué.
          </li>
          <li>
            Une commande numérique payée mais <strong className="text-foreground">jamais
            livrée</strong> (aucun jeton de téléchargement émis, produit retiré indûment) est
            remboursée intégralement.
          </li>
        </ul>
      </Section>
      <Section title="3. Produits physiques">
        <p>
          Pour un produit physique, le remboursement suit les conditions annoncées par le vendeur
          sur sa boutique (délai de rétractation, état du produit retourné, frais de retour). En
          l&apos;absence d&apos;indications contraires sur la fiche produit, s&apos;applique un
          délai de 7 jours ouvrables après réception pour demander un retour, le produit n&apos;ayant
          pas été utilisé et dans son emballage d&apos;origine.
        </p>
      </Section>
      <Section title="4. Commandes non abouties">
        <p>
          Si un paiement est débité mais que la commande ne peut être confirmée (échec du
          prestataire, produit indisponible, boutique suspendue), le montant est intégralement
          remboursé. Le remboursement est opéré via le moyen de paiement d&apos;origine (FedaPay),
          sous 5 à 10 jours ouvrables selon les délais bancaires.
        </p>
      </Section>
      <Section title="5. Procédure et litiges">
        <p>
          Toute demande de remboursement passe d&apos;abord par le support BILLOGRAPH (contacts en
          pied de page) en citant la référence de commande BLG-XXXXXX. La plateforme instruit la
          demande avec le vendeur sur la base des preuves fournies (captures, description du
          défaut, échanges). La décision motivée est notifiée aux parties ; en cas de remboursement,
          il est effectué sur le moyen de paiement d&apos;origine.
        </p>
      </Section>
    </>
  );
}

export function LegalView({ document: doc }: { document: LegalDocument }) {
  const { settings } = useSiteSettings();
  const meta = DOCUMENT_META[doc];
  const Icon = meta.icon;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <Button
        variant="ghost"
        className="-ml-2 h-10 gap-2 text-muted-foreground"
        onClick={() => navigateTo("#/")}
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Retour à l&apos;accueil
      </Button>

      <header className="mt-6 space-y-3">
        <span className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-6" aria-hidden="true" />
        </span>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{meta.title}</h1>
        <p className="text-sm text-muted-foreground">{meta.updated}</p>
        <Badge variant="outline" className="text-xs">
          {settings.siteName} — Documents légaux
        </Badge>
      </header>

      <div className="mt-8 space-y-8">
        <LegalContent document={doc} />
      </div>

      <nav className="mt-12 rounded-xl border bg-muted/30 p-5" aria-label="Autres documents légaux">
        <p className="text-sm font-semibold">Autres documents</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(Object.keys(DOCUMENT_META) as LegalDocument[])
            .filter((key) => key !== doc)
            .map((key) => (
              <Button key={key} variant="outline" size="sm" className="h-9" onClick={() => navigateTo(`#/${key}`)}>
                {DOCUMENT_META[key].title}
              </Button>
            ))}
        </div>
      </nav>
    </div>
  );
}
