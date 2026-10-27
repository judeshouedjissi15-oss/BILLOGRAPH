"use client";

// Carte de témoignage vendeur — section « Témoignages » de la page d'accueil,
// réutilisée en aperçu intégral dans Admin → Réglages → Témoignages.

import { Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { deriveInitials, TESTIMONIAL_STYLE, type Testimonial } from "@/lib/testimonials";

export function TestimonialCard({ testimonial }: { testimonial: Testimonial }) {
  const style = TESTIMONIAL_STYLE[testimonial.color] ?? TESTIMONIAL_STYLE.blue;
  const initials = deriveInitials(testimonial.name);
  return (
    <Card className="relative h-full transition-shadow hover:shadow-md">
      <CardContent className="flex h-full flex-col p-6">
        <div className="flex items-start justify-between gap-3">
          <span
            className="flex items-center gap-0.5"
            role="img"
            aria-label={`Note : ${testimonial.stars} sur 5`}
          >
            {Array.from({ length: 5 }, (_, i) => (
              <Star
                key={i}
                className={
                  i < testimonial.stars
                    ? "size-4 fill-amber-400 text-amber-400"
                    : "size-4 fill-muted-foreground/25 text-muted-foreground/25"
                }
                aria-hidden="true"
              />
            ))}
          </span>
          <span
            aria-hidden="true"
            className="select-none font-serif text-5xl leading-[0.8] text-muted-foreground/20"
          >
            &rdquo;
          </span>
        </div>

        <blockquote className="mt-4 flex-1 leading-relaxed">
          <p>&ldquo;{testimonial.quote}&rdquo;</p>
        </blockquote>

        <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 border-t pt-4">
          <span
            className={`flex size-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${style.avatar}`}
            aria-hidden="true"
          >
            {initials}
          </span>
          <div className="min-w-0 flex-1 basis-44">
            <p className="text-sm font-semibold">{testimonial.name}</p>
            <p className="text-xs leading-snug text-muted-foreground">
              {testimonial.role} — {testimonial.location}
            </p>
          </div>
          <Badge
            variant="outline"
            className={`shrink-0 text-xs font-medium ${style.badge}`}
          >
            {testimonial.badge}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
