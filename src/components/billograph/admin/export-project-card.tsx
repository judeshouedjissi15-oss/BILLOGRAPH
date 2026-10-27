"use client";

// ADMIN → Paramètres — EXPORT DU PROJET VERS VS CODE.
// Télécharge l'archive ZIP complète du SaaS (code source + base de données
// réelle + migrations + fichiers des produits + guides) via l'API sécurisée
// /api/admin/export/project (session ADMIN obligatoire — l'archive n'est
// JAMAIS exposée publiquement), puis affiche les étapes exactes pour ouvrir
// le projet dans VS Code sur son propre ordinateur.

import { useState } from "react";
import { Code2, Copy, Download, Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

// Commandes exactes à exécuter dans le terminal intégré de VS Code,
// après décompression de l'archive (la base est incluse : pas de migration
// à lancer ; le .env local doit être créé avant le premier démarrage).
const COMMANDES_TERMINAL = `cp .env.example .env      # puis éditez .env (voir GUIDE-VS-CODE.md)
bun install
bunx prisma generate
bun run dev               # → http://localhost:3000`;

export function ExportProjectCard() {
  const { toast } = useToast();
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Téléchargement via fetch + blob (et non un simple <a href>) afin de
  // présenter proprement les erreurs (session expirée, archive absente)
  // au lieu d'afficher un JSON brut dans le navigateur.
  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await fetch("/api/admin/export/project", { credentials: "same-origin" });
      if (!res.ok) {
        let message = "Téléchargement impossible. Réessayez dans un instant.";
        try {
          const body = (await res.json()) as { error?: string };
          if (body?.error) message = body.error;
        } catch {
          // corps non JSON — message par défaut conservé
        }
        throw new Error(message);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "billograph-saas.zip";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast({
        title: "Téléchargement lancé",
        description: "Enregistrez le ZIP, décompressez-le, puis suivez les 3 étapes ci-dessous.",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Téléchargement impossible",
        description: err instanceof Error ? err.message : "Réessayez dans un instant.",
      });
    } finally {
      setDownloading(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(COMMANDES_TERMINAL);
      setCopied(true);
      toast({
        title: "Commandes copiées",
        description: "Collez-les dans le terminal intégré de VS Code (Ctrl+Maj+ù).",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        variant: "destructive",
        title: "Copie impossible",
        description: "Sélectionnez les commandes et copiez-les manuellement.",
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <Code2 className="size-5 text-primary" aria-hidden="true" />
          Exporter le projet — l&apos;ouvrir dans VS Code
        </CardTitle>
        <CardDescription>
          Téléchargez l&apos;intégralité de votre SaaS dans une seule archive ZIP : code source,
          base de données réelle, migrations, fichiers des produits, README et guide pas à pas.
          Vous continuez ensuite à le développer sur votre ordinateur, sans rien reconstruire.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <Button
          type="button"
          className="h-11 w-full sm:w-auto"
          disabled={downloading}
          onClick={() => void handleDownload()}
        >
          {downloading ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Download className="size-4" aria-hidden="true" />
          )}
          {downloading ? "Préparation du téléchargement…" : "Télécharger le projet complet (ZIP)"}
        </Button>

        <div className="rounded-lg border p-4">
          <p className="text-sm font-medium">Ouvrir le projet dans VS Code — 3 étapes</p>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
            <li>
              Décompressez le fichier ZIP téléchargé : un dossier{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">billograph</code>{" "}
              est créé.
            </li>
            <li>
              Dans VS Code : <span className="text-foreground">Fichier → Ouvrir le dossier…</span>{" "}
              puis sélectionnez le dossier{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">billograph</code>.
              (Vous pouvez aussi glisser-déposer le dossier sur la fenêtre VS Code.)
            </li>
            <li>
              Ouvrez le terminal intégré (Terminal → Nouveau terminal) et exécutez les commandes
              ci-dessous — le SaaS démarre sur{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                http://localhost:3000
              </code>
              .
            </li>
          </ol>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start">
            <pre className="min-w-0 flex-1 overflow-x-auto rounded-md bg-muted/60 p-3 font-mono text-xs leading-relaxed">
              {COMMANDES_TERMINAL}
            </pre>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 shrink-0"
              onClick={() => void handleCopy()}
            >
              <Copy className="size-3.5" aria-hidden="true" />
              {copied ? "Copié !" : "Copier"}
            </Button>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-4">
          <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <p className="text-xs text-muted-foreground">
            L&apos;archive ne contient <strong className="text-foreground">aucun mot de passe ni clé
            API</strong> : à la première ouverture, créez votre fichier{" "}
            <code className="font-mono">.env</code> à partir de{" "}
            <code className="font-mono">.env.example</code> (APP_SECRET, codes administrateur) — le
            mode d&apos;emploi complet est dans{" "}
            <strong className="text-foreground">GUIDE-VS-CODE.md</strong> à la racine du ZIP. La clé
            Brevo enregistrée ici est chiffrée avec le secret de ce serveur : si votre APP_SECRET
            local diffère, re-saisissez-la dans Admin → Paramètres (2 minutes).
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
