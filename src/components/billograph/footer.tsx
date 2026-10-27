"use client";

// Footer collant en bas : le shell (page.tsx) applique min-h-screen flex flex-col
// et ce footer utilise mt-auto. Respecte les safe-area iOS (paddingBottom env()).
// Colonnes : Marque | Navigation | Auteur (présentation brève, modifiable dans
// l'admin via Paramètres) + documents légaux, puis barre de copyright.
// L'ancienne section « Informations » (contacts / lignes paiement) a été
// supprimée à la demande du propriétaire.

import { Facebook, FileText, Instagram, Music2, Scale, ShieldCheck, Twitter, Youtube } from "lucide-react";
import { Logo } from "./logo";
import { goToFeatures, goToReviews, navigateTo } from "./lib/use-hash-route";
import { useSiteSettings } from "./lib/site-data";

const NAV_LINKS: { label: string; action: () => void }[] = [
  { label: "Accueil", action: () => navigateTo("#/") },
  { label: "Fonctionnalités", action: goToFeatures },
  { label: "Créer ma boutique", action: () => navigateTo("#/auth") },
  { label: "Avis de la communauté", action: goToReviews },
  { label: "Mes achats", action: () => navigateTo("#/mes-achats") },
];

export function Footer() {
  const { settings } = useSiteSettings();

  const socials = [
    { label: "Facebook", url: settings.socialFacebook, icon: Facebook },
    { label: "Instagram", url: settings.socialInstagram, icon: Instagram },
    { label: "TikTok", url: settings.socialTiktok, icon: Music2 },
    { label: "YouTube", url: settings.socialYoutube, icon: Youtube },
    { label: "X (Twitter)", url: settings.socialTwitter, icon: Twitter },
  ].filter((s): s is { label: string; url: string; icon: typeof Facebook } => Boolean(s.url));

  return (
    <footer
      className="mt-auto border-t bg-muted/40"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:grid-cols-2 lg:grid-cols-3">
        {/* Marque */}
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
            {settings.footerText}
          </p>
          {socials.length > 0 && (
            <div className="mt-5 flex flex-wrap items-center gap-2">
              {socials.map((social) => (
                <a
                  key={social.label}
                  href={social.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${settings.siteName} sur ${social.label}`}
                  title={social.label}
                  className="flex size-10 items-center justify-center rounded-lg border bg-card text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <social.icon className="size-4.5" aria-hidden="true" />
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav aria-label="Navigation pied de page">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Navigation
          </h2>
          <ul className="mt-4 space-y-1">
            {NAV_LINKS.map((link) => (
              <li key={link.label}>
                <button
                  type="button"
                  onClick={link.action}
                  className="inline-flex h-9 w-full items-center rounded-md px-1 text-left text-sm text-foreground/90 transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {link.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* AUTEUR — remplace l'ancienne section « Informations » (supprimée) */}
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Auteur
          </h2>
          <p className="mt-4 text-sm font-semibold text-foreground">{settings.authorName}</p>
          {settings.authorRole ? (
            <p className="text-xs text-muted-foreground">{settings.authorRole}</p>
          ) : null}
          {settings.authorBio ? (
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {settings.authorBio}
            </p>
          ) : null}

          {/* Documents légaux */}
          <ul className="mt-4 space-y-1 border-t pt-4 text-sm">
            <li>
              <button
                type="button"
                onClick={() => navigateTo("#/cgu")}
                className="inline-flex items-center gap-2 rounded-md px-1 py-1.5 text-foreground/90 transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <Scale className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                Conditions générales d&apos;utilisation
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => navigateTo("#/confidentialite")}
                className="inline-flex items-center gap-2 rounded-md px-1 py-1.5 text-foreground/90 transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <ShieldCheck className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                Politique de confidentialité
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => navigateTo("#/remboursement")}
                className="inline-flex items-center gap-2 rounded-md px-1 py-1.5 text-foreground/90 transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                Politique de remboursement
              </button>
            </li>
          </ul>
        </div>
      </div>

      {/* Barre de copyright — pleine largeur, sous les colonnes */}
      <div className="border-t">
        <p className="mx-auto max-w-6xl px-4 py-5 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} {settings.siteName} — Tous droits réservés.
        </p>
      </div>
    </footer>
  );
}
