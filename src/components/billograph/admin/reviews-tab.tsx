"use client";

// ONGLET AVIS (espace administrateur) — modération des avis déposés sur la
// page d'accueil : filtre par statut, Approuver / Rejeter, Suppression
// (confirmation EN PAGE via InlineConfirm — aucun dialog). Après chaque action
// : rafraîchissement de la liste + invalidation des avis publics → la page
// d'accueil se met à jour automatiquement.

import { useCallback, useEffect, useState } from "react";
import { Check, MessageSquareQuote, Star, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "../lib/api-client";
import { invalidatePublicReviews } from "../lib/site-data";
import { InlineConfirm } from "../inline-confirm";
import { reviewAvatarClass } from "@/lib/site-content";
import { formatDate } from "@/lib/format";
import type { AdminReview, AdminReviewsResponse } from "@/types/api";
import { cn } from "@/lib/utils";

type StatusFilter = "ALL" | "PENDING" | "APPROVED" | "REJECTED";

const STATUS_BADGES: Record<AdminReview["status"], { label: string; className: string }> = {
  PENDING: {
    label: "En attente",
    className:
      "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
  },
  APPROVED: {
    label: "Publié",
    className:
      "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  },
  REJECTED: {
    label: "Rejeté",
    className:
      "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300",
  },
};

function Stars({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`Note : ${rating} sur 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn(
            "size-3.5",
            i < rating ? "fill-amber-400 text-amber-400" : "fill-muted text-muted-foreground/30",
          )}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

function initialsOf(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((word) => word[0] ?? "")
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

export function ReviewsTab({ readOnly = false }: { readOnly?: boolean } = {}) {
  const { toast } = useToast();
  const [filter, setFilter] = useState<StatusFilter>("ALL");
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [counts, setCounts] = useState<AdminReviewsResponse["counts"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const query = filter === "ALL" ? "" : `?status=${filter}`;
      const data = await apiFetch<AdminReviewsResponse>(`/api/admin/reviews${query}`);
      setReviews(data.reviews);
      setCounts(data.counts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de charger les avis.");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  const moderate = async (review: AdminReview, status: "APPROVED" | "REJECTED") => {
    setBusyId(review.id);
    try {
      await apiFetch(`/api/admin/reviews/${review.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      // Synchronisation : la page d'accueil reflète la décision automatiquement.
      invalidatePublicReviews();
      toast({
        title: status === "APPROVED" ? "Avis publié" : "Avis rejeté",
        description:
          status === "APPROVED"
            ? `L'avis de ${review.authorName} est maintenant visible sur la page d'accueil.`
            : `L'avis de ${review.authorName} n'apparaîtra pas sur le site.`,
      });
      await load();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Action impossible",
        description: err instanceof Error ? err.message : "Réessayez dans un instant.",
      });
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (review: AdminReview) => {
    setBusyId(review.id);
    try {
      await apiFetch(`/api/admin/reviews/${review.id}`, { method: "DELETE" });
      invalidatePublicReviews();
      toast({
        title: "Avis supprimé",
        description: `L'avis de ${review.authorName} a été définitivement supprimé.`,
      });
      await load();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Suppression impossible",
        description: err instanceof Error ? err.message : "Réessayez dans un instant.",
      });
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return <Skeleton className="h-96 rounded-xl" aria-busy="true" />;
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" onClick={() => void load()}>
            Réessayer
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Compteurs + filtre */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex flex-wrap items-center gap-2">
          {counts && (
            <>
              <Badge variant="secondary" className="h-7 px-3">
                {counts.total} au total
              </Badge>
              <Badge className="h-7 border-amber-300 bg-amber-50 px-3 text-amber-800 hover:bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                {counts.pending} en attente
              </Badge>
              <Badge className="h-7 border-emerald-300 bg-emerald-100 px-3 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
                {counts.approved} publiés
              </Badge>
              <Badge className="h-7 border-rose-300 bg-rose-50 px-3 text-rose-800 hover:bg-rose-50 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
                {counts.rejected} rejetés
              </Badge>
            </>
          )}
        </div>
        <div className="w-full sm:w-56">
          <Select value={filter} onValueChange={(value) => setFilter(value as StatusFilter)}>
            <SelectTrigger className="h-11" aria-label="Filtrer les avis par statut">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tous les statuts</SelectItem>
              <SelectItem value="PENDING">En attente</SelectItem>
              <SelectItem value="APPROVED">Publiés</SelectItem>
              <SelectItem value="REJECTED">Rejetés</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {reviews.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <MessageSquareQuote className="size-8 text-muted-foreground/50" aria-hidden="true" />
            <p className="font-semibold">Aucun avis pour ce filtre</p>
            <p className="text-sm text-muted-foreground">
              Les avis déposés par les visiteurs depuis la page d&apos;accueil apparaissent ici
              pour validation.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {reviews.map((review, index) => {
            const badge = STATUS_BADGES[review.status];
            const location = [review.authorRole, review.authorCity].filter(Boolean).join(" · ");
            return (
              <Card key={review.id}>
                <CardContent className="p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                    <span
                      className={cn(
                        "flex size-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white",
                        reviewAvatarClass(index),
                      )}
                      aria-hidden="true"
                    >
                      {initialsOf(review.authorName)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <p className="font-semibold">{review.authorName}</p>
                        <Stars rating={review.rating} />
                        <Badge variant="outline" className={cn("h-6", badge.className)}>
                          {badge.label}
                        </Badge>
                      </div>
                      {location ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">{location}</p>
                      ) : null}
                      <p className="mt-3 text-sm leading-relaxed text-foreground/90">
                        « {review.content} »
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Déposé le {formatDate(review.createdAt)}
                        {review.moderatedAt ? ` · modéré le ${formatDate(review.moderatedAt)}` : ""}
                        {review.userId ? " · auteur connecté" : ""}
                      </p>
                    </div>
                    {/* Actions (en page, jamais en dialog) */}
                    <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-col sm:items-stretch">
                      {readOnly ? (
                        <span className="text-xs text-muted-foreground">Lecture seule</span>
                      ) : (
                        <>
                        {review.status !== "APPROVED" && (
                        <Button
                          size="sm"
                          className="h-9"
                          disabled={busyId === review.id}
                          onClick={() => void moderate(review, "APPROVED")}
                        >
                          <Check className="size-3.5" aria-hidden="true" />
                          Approuver
                        </Button>
                      )}
                      {review.status !== "REJECTED" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-9"
                          disabled={busyId === review.id}
                          onClick={() => void moderate(review, "REJECTED")}
                        >
                          <X className="size-3.5" aria-hidden="true" />
                          Rejeter
                        </Button>
                      )}
                      <InlineConfirm
                        trigger={
                          <>
                            <Trash2 className="size-3.5" aria-hidden="true" />
                            Supprimer
                          </>
                        }
                        triggerVariant="ghost"
                        triggerClassName="h-9 text-destructive hover:text-destructive"
                        confirmLabel="Confirmer la suppression"
                        pendingLabel="Suppression…"
                        size="sm"
                        busy={busyId === review.id}
                        onConfirm={() => remove(review)}
                      />
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
