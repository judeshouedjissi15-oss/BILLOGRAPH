"use client";

// Onglet "Annonce" de l'espace admin : rédiger et publier le message affiché
// dans la barre d'annonce en haut du site. Une seule annonce active à la fois
// — publier (ou activer) désactive automatiquement la précédente.

import { useCallback, useEffect, useState } from "react";
import { Megaphone, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "../lib/api-client";
import { InlineConfirm } from "../inline-confirm";
import { formatDate } from "@/lib/format";
import type { AdminAnnouncement } from "@/types/api";

export function AnnouncementsTab({ readOnly = false }: { readOnly?: boolean } = {}) {
  const { toast } = useToast();

  const [announcements, setAnnouncements] = useState<AdminAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [publishing, setPublishing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await apiFetch<{ announcements: AdminAnnouncement[] }>(
        "/api/admin/announcements",
      );
      setAnnouncements(data.announcements);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de charger les annonces.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  const handlePublish = async () => {
    const trimmed = message.trim();
    if (trimmed.length < 3) {
      toast({
        variant: "destructive",
        title: "Message trop court",
        description: "Rédigez un message d'au moins 3 caractères.",
      });
      return;
    }
    if (link.trim() && !linkLabel.trim()) {
      toast({
        variant: "destructive",
        title: "Libellé du lien manquant",
        description:
          "Indiquez le texte du bouton (ex : « En savoir plus ») ou retirez le lien.",
      });
      return;
    }

    setPublishing(true);
    try {
      await apiFetch<{ announcement: AdminAnnouncement }>("/api/admin/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          link: link.trim() || null,
          linkLabel: linkLabel.trim() || null,
        }),
      });
      setMessage("");
      setLink("");
      setLinkLabel("");
      toast({
        title: "Annonce publiée",
        description:
          "Elle est maintenant visible en haut du site. La précédente a été désactivée.",
      });
      await load();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Publication impossible",
        description: err instanceof Error ? err.message : "Réessayez dans un instant.",
      });
    } finally {
      setPublishing(false);
    }
  };

  const patchAnnouncement = async (
    announcement: AdminAnnouncement,
    patch: Record<string, unknown>,
    successTitle: string,
  ) => {
    try {
      await apiFetch<{ announcement: AdminAnnouncement }>(
        `/api/admin/announcements/${announcement.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        },
      );
      toast({ title: successTitle });
      await load();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Action impossible",
        description: err instanceof Error ? err.message : "Réessayez dans un instant.",
      });
    }
  };

  const deleteAnnouncement = async (announcement: AdminAnnouncement) => {
    try {
      await apiFetch<{ deleted: boolean }>(`/api/admin/announcements/${announcement.id}`, {
        method: "DELETE",
      });
      toast({ title: "Annonce supprimée" });
      await load();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Suppression impossible",
        description: err instanceof Error ? err.message : "Réessayez dans un instant.",
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Formulaire de publication */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Megaphone className="size-5 text-primary" aria-hidden="true" />
            Publier une annonce
          </CardTitle>
          <CardDescription>
            Le message s&apos;affiche dans une barre en haut du site, pour tous les visiteurs.
            Publier une nouvelle annonce remplace automatiquement l&apos;annonce active.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="announcement-message">Message</Label>
            <Textarea
              id="announcement-message"
              required
              minLength={3}
              maxLength={300}
              rows={3}
              placeholder="Ex : Soldes de fin d'année — -20 % sur toutes les formations jusqu'au 31 décembre."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {message.length}/300 caractères
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="announcement-link">Lien (optionnel)</Label>
              <Input
                id="announcement-link"
                type="text"
                placeholder="#/auth ou https://…"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                className="h-11"
              />
              <p className="text-xs text-muted-foreground">
                Page interne (« #/auth ») ou URL https externe.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="announcement-link-label">Libellé du lien</Label>
              <Input
                id="announcement-link-label"
                type="text"
                maxLength={40}
                placeholder="En savoir plus"
                value={linkLabel}
                onChange={(e) => setLinkLabel(e.target.value)}
                className="h-11"
                disabled={!link.trim()}
              />
            </div>
          </div>
          <Button
            type="button"
            className="h-11 w-full sm:w-auto"
            disabled={publishing || readOnly}
            onClick={() => void handlePublish()}
          >
            <Megaphone className="size-4" aria-hidden="true" />
            {publishing ? "Publication…" : "Publier l'annonce"}
          </Button>
        </CardContent>
      </Card>

      {/* Historique */}
      <Card>
        <CardHeader>
          <CardTitle>Annonces enregistrées</CardTitle>
          <CardDescription>
            Une seule annonce est visible à la fois. Activez-en une pour la remettre en barre.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3" aria-busy="true">
              <Skeleton className="h-20 w-full rounded-lg" />
              <Skeleton className="h-20 w-full rounded-lg" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="outline" onClick={() => void load()}>
                Réessayer
              </Button>
            </div>
          ) : announcements.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Aucune annonce pour l&apos;instant.
            </p>
          ) : (
            <div className="max-h-96 space-y-3 overflow-y-auto pr-1">
              {announcements.map((announcement) => (
                <div
                  key={announcement.id}
                  className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-start"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{announcement.message}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      {announcement.link ? (
                        <>
                          Lien : <code className="font-mono">{announcement.link}</code> ·
                        </>
                      ) : null}
                      Publiée le {formatDate(announcement.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {readOnly ? (
                      <span className="text-xs text-muted-foreground">Lecture seule</span>
                    ) : announcement.active ? (
                      <>
                        <Badge
                          variant="outline"
                          className="border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
                        >
                          Active
                        </Badge>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9"
                          onClick={() =>
                            void patchAnnouncement(
                              announcement,
                              { active: false },
                              "Annonce retirée de la barre",
                            )
                          }
                        >
                          Désactiver
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9"
                        onClick={() =>
                          void patchAnnouncement(
                            announcement,
                            { active: true },
                            "Annonce activée — la précédente a été désactivée",
                          )
                        }
                      >
                        Activer
                      </Button>
                    )}
                    <InlineConfirm
                      trigger={
                        <>
                          <Trash2 className="size-4" aria-hidden="true" />
                          Supprimer
                        </>
                      }
                      triggerVariant="ghost"
                      triggerClassName="h-9 text-destructive hover:text-destructive"
                      confirmLabel="Confirmer"
                      pendingLabel="Suppression…"
                      size="sm"
                      warnText="Cette annonce sera définitivement supprimée."
                      onConfirm={() => void deleteAnnouncement(announcement)}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
