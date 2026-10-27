"use client";

// SECTION AVIS DE LA COMMUNAUTÉ (page d'accueil) — 100 % réelle :
// - affiche les avis APPROVED de la base (auto-synchronisés : un avis approuvé
//   par l'admin apparaît ici sans rechargement) ;
// - formulaire de dépôt EN PAGE (aucun dialog) : nom, profession, ville,
//   note étoilée (1-5), contenu. L'avis part en modération (PENDING) sauf si
//   « Publication automatique » est activée dans Paramètres (admin).

import { useEffect, useState } from "react";
import { MessageSquareQuote, Quote, Send, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "./lib/api-client";
import { usePublicReviews } from "./lib/site-data";
import { reviewAvatarClass } from "@/lib/site-content";
import type { ReviewItem } from "@/types/api";
import { cn } from "@/lib/utils";

type ReviewsSectionProps = {
  title: string;
  subtitle: string;
  userName: string | null;
};

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

function Stars({ rating, className }: { rating: number; className?: string }) {
  return (
    <span className={cn("flex items-center gap-0.5", className)} aria-label={`Note : ${rating} étoiles sur 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn(
            "size-4",
            i < rating ? "fill-amber-400 text-amber-400" : "fill-muted text-muted-foreground/30",
          )}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

function ReviewCard({ review, index }: { review: ReviewItem; index: number }) {
  const location = [review.authorRole, review.authorCity].filter(Boolean).join(" · ");
  return (
    <Card className="flex flex-col transition-shadow hover:shadow-md">
      <CardContent className="flex flex-1 flex-col p-6">
        <div className="flex items-start justify-between gap-4">
          <Stars rating={review.rating} />
          <Quote className="size-8 shrink-0 rotate-180 text-muted-foreground/20" aria-hidden="true" />
        </div>
        <blockquote className="mt-4 flex-1 text-sm leading-relaxed text-foreground/90 sm:text-base">
          « {review.content} »
        </blockquote>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white",
                reviewAvatarClass(index),
              )}
              aria-hidden="true"
            >
              {initialsOf(review.authorName)}
            </span>
            <div className="min-w-0">
              <p className="truncate font-semibold">{review.authorName}</p>
              {location ? (
                <p className="truncate text-xs text-muted-foreground">{location}</p>
              ) : null}
            </div>
          </div>
          {review.authorRole ? (
            <Badge variant="outline" className="shrink-0 border-primary/25 bg-primary/5 text-primary">
              {review.authorRole}
            </Badge>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function ReviewsSection({ title, subtitle, userName }: ReviewsSectionProps) {
  const { toast } = useToast();
  const { reviews, isSyncing } = usePublicReviews();

  // Formulaire de dépôt
  const [name, setName] = useState(userName ?? "");
  const [role, setRole] = useState("");
  const [city, setCity] = useState("");
  const [rating, setRating] = useState(0);
  const [content, setContent] = useState("");
  const [hoveredRating, setHoveredRating] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Pré-remplit le nom quand la session arrive après le montage (non bloquant).
  useEffect(() => {
    if (userName && !name.trim()) setName(userName);
  }, [userName, name]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (rating < 1) {
      toast({
        variant: "destructive",
        title: "Note manquante",
        description: "Sélectionnez une note de 1 à 5 étoiles.",
      });
      return;
    }
    setSubmitting(true);
    try {
      const data = await apiFetch<{ message: string }>("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          role: role.trim() || undefined,
          city: city.trim() || undefined,
          rating,
          content: content.trim(),
        }),
      });
      toast({ title: "Avis envoyé", description: data.message });
      setRole("");
      setCity("");
      setRating(0);
      setContent("");
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Envoi impossible",
        description: error instanceof Error ? error.message : "Réessayez dans un instant.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section id="avis" className="scroll-mt-20 border-t bg-muted/40 py-16 sm:py-20" aria-label="Avis de la communauté">
      <div className="mx-auto max-w-6xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
          <p className="mt-4 text-muted-foreground">{subtitle}</p>
        </div>

        {/* Liste des avis publiés */}
        {isSyncing && reviews.length === 0 ? (
          <div className="mt-12 grid gap-6 lg:grid-cols-2">
            <Skeleton className="h-56 rounded-xl" aria-busy="true" />
            <Skeleton className="h-56 rounded-xl" aria-busy="true" />
          </div>
        ) : reviews.length === 0 ? (
          <div className="mx-auto mt-12 flex max-w-xl flex-col items-center gap-3 rounded-xl border border-dashed bg-card p-10 text-center">
            <MessageSquareQuote className="size-8 text-muted-foreground/50" aria-hidden="true" />
            <p className="font-semibold">Aucun avis publié pour le moment</p>
            <p className="text-sm text-muted-foreground">
              Soyez le premier : déposez votre avis avec le formulaire ci-dessous. Chaque avis est
              vérifié avant publication.
            </p>
          </div>
        ) : (
          <div className="mt-12 grid gap-6 lg:grid-cols-2">
            {reviews.map((review, index) => (
              <ReviewCard key={review.id} review={review} index={index} />
            ))}
          </div>
        )}

        {/* Formulaire de dépôt — en page, pas de dialog */}
        <Card className="mx-auto mt-12 max-w-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquareQuote className="size-5 text-primary" aria-hidden="true" />
              Laissez votre avis
            </CardTitle>
            <CardDescription>
              Vous êtes vendeur, acheteur ou simple visiteur ? Partagez votre expérience avec
              BILLOGRAPH. Les avis sont publiés après vérification.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="review-name">Votre nom *</Label>
                  <Input
                    id="review-name"
                    type="text"
                    required
                    minLength={2}
                    maxLength={60}
                    placeholder="Ex : Aïcha B."
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="review-role">Profession / activité</Label>
                  <Input
                    id="review-role"
                    type="text"
                    maxLength={60}
                    placeholder="Ex : Auteure, Formateur…"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="h-11"
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="review-city">Ville / pays</Label>
                  <Input
                    id="review-city"
                    type="text"
                    maxLength={60}
                    placeholder="Ex : Cotonou, Bénin"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label id="review-rating-label">Votre note *</Label>
                  <div
                    className="flex h-11 items-center gap-1"
                    role="radiogroup"
                    aria-labelledby="review-rating-label"
                  >
                    {[1, 2, 3, 4, 5].map((value) => {
                      const active = value <= (hoveredRating || rating);
                      return (
                        <button
                          key={value}
                          type="button"
                          role="radio"
                          aria-checked={rating === value}
                          aria-label={`${value} étoile${value > 1 ? "s" : ""}`}
                          className={cn(
                            "flex size-10 items-center justify-center rounded-md transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                            active && "scale-105",
                          )}
                          onMouseEnter={() => setHoveredRating(value)}
                          onMouseLeave={() => setHoveredRating(0)}
                          onClick={() => setRating(value)}
                        >
                          <Star
                            className={cn(
                              "size-6",
                              active ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40",
                            )}
                            aria-hidden="true"
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="review-content">Votre avis *</Label>
                  <span className="text-xs text-muted-foreground">{content.length}/600</span>
                </div>
                <Textarea
                  id="review-content"
                  required
                  minLength={10}
                  maxLength={600}
                  rows={4}
                  placeholder="Racontez votre expérience : ce que la plateforme vous a apporté, ce qui vous a plu…"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="min-h-24 resize-y"
                />
                <p className="text-xs text-muted-foreground">
                  10 caractères minimum. Un avis vérifié avant publication — pas de faux avis.
                </p>
              </div>
              <Button type="submit" className="h-11 w-full sm:w-auto" disabled={submitting}>
                <Send className="size-4" aria-hidden="true" />
                {submitting ? "Envoi en cours…" : "Envoyer mon avis"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
