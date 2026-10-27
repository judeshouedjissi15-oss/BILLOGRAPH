"use client";

// Onboarding vendeur : création de la boutique (POST /api/stores).
// Le slug est auto-suggéré depuis le nom et reste éditable.

import { useState } from "react";
import { Check, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "../lib/api-client";
import { STORE_COLOR_PRESETS } from "../lib/store-colors";
import type { Store } from "@/types/api";
import { cn } from "@/lib/utils";

export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

type StoreCreateFormProps = {
  onCreated: (store: Store) => void;
};

export function StoreCreateForm({ onCreated }: StoreCreateFormProps) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(STORE_COLOR_PRESETS[0].value);
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleNameChange = (value: string) => {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const data = await apiFetch<{ store: Store }>("/api/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim() || undefined,
          description: description.trim() || undefined,
          color,
          phone: phone.trim() || undefined,
        }),
      });
      toast({
        title: "Boutique créée !",
        description: `Votre boutique « ${data.store.name} » est prête. Vous êtes maintenant vendeur.`,
      });
      onCreated(data.store);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Création impossible",
        description: error instanceof Error ? error.message : "Réessayez dans un instant.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="text-center">
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Rocket className="size-7" aria-hidden="true" />
        </span>
        <h1 className="mt-5 text-3xl font-bold tracking-tight">Créez votre boutique</h1>
        <p className="mt-2 text-muted-foreground">
          Deux minutes, aucune compétence technique. Vous pourrez tout modifier plus tard.
        </p>
      </div>

      <Card className="mt-8">
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="store-name">Nom de la boutique *</Label>
              <Input
                id="store-name"
                required
                minLength={2}
                maxLength={60}
                placeholder="Ex : Librairie Noun"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                className="h-11"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="store-slug">Adresse (slug)</Label>
              <div className="flex items-center gap-2">
                <span className="hidden shrink-0 text-sm text-muted-foreground sm:inline">
                  billograph.bj/#/boutique/
                </span>
                <Input
                  id="store-slug"
                  type="text"
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  title="Lettres minuscules, chiffres et tirets uniquement"
                  maxLength={48}
                  placeholder="genere-automatiquement"
                  value={slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setSlug(slugify(e.target.value));
                  }}
                  className="h-11 flex-1"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Laissez tel quel ou personnalisez. L&apos;adresse devient : billograph.bj/#/boutique/
                <span className="font-medium text-foreground">{slug || "…"}</span>
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="store-description">Description</Label>
              <Textarea
                id="store-description"
                maxLength={400}
                rows={3}
                placeholder="Dites à vos clients ce que vous vendez…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <fieldset>
              <legend className="text-sm font-medium">Couleur d&apos;accent</legend>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                {STORE_COLOR_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    role="radio"
                    aria-checked={color === preset.value}
                    aria-label={`Couleur ${preset.label}`}
                    onClick={() => setColor(preset.value)}
                    className={cn(
                      "flex size-11 items-center justify-center rounded-full transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                      color === preset.value && "ring-2 ring-ring ring-offset-2",
                    )}
                    style={{ backgroundColor: preset.value }}
                  >
                    {color === preset.value && (
                      <Check className="size-5 text-white" aria-hidden="true" />
                    )}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="space-y-2">
              <Label htmlFor="store-phone">Téléphone / WhatsApp (optionnel)</Label>
              <Input
                id="store-phone"
                type="tel"
                maxLength={30}
                placeholder="+229 01 97 00 00 00"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="h-11"
              />
            </div>

            <Button type="submit" className="h-12 w-full text-base" disabled={submitting}>
              {submitting ? "Création en cours…" : "Créer ma boutique"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
