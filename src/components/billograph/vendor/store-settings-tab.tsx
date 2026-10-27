"use client";

// Onglet "Ma boutique" : modification des informations (PATCH /api/stores/:slug),
// aperçu couleur en direct, lien vers la boutique publique.

import { useEffect, useState } from "react";
import { Check, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "../lib/api-client";
import { navigateTo } from "../lib/use-hash-route";
import { STORE_COLOR_PRESETS, normalizeHexColor } from "../lib/store-colors";
import type { Store } from "@/types/api";
import { cn } from "@/lib/utils";

type StoreSettingsTabProps = {
  store: Store;
  onSaved: (store: Store) => void;
};

export function StoreSettingsTab({ store, onSaved }: StoreSettingsTabProps) {
  const { toast } = useToast();
  const [name, setName] = useState(store.name);
  const [description, setDescription] = useState(store.description ?? "");
  const [color, setColor] = useState(normalizeHexColor(store.color));
  const [phone, setPhone] = useState(store.phone ?? "");
  const [saving, setSaving] = useState(false);

  // Resynchroniser le formulaire si la boutique change (après sauvegarde).
  useEffect(() => {
    setName(store.name);
    setDescription(store.description ?? "");
    setColor(normalizeHexColor(store.color));
    setPhone(store.phone ?? "");
  }, [store]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      const data = await apiFetch<{ store: Store }>(`/api/stores/${store.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          color,
          phone: phone.trim() || undefined,
        }),
      });
      toast({
        title: "Boutique mise à jour",
        description: "Vos clients voient les nouvelles informations immédiatement.",
      });
      onSaved(data.store);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Enregistrement impossible",
        description: error instanceof Error ? error.message : "Réessayez dans un instant.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <Card>
        <CardHeader>
          <CardTitle>Informations de la boutique</CardTitle>
          <CardDescription>
            Ces informations apparaissent sur votre boutique publique.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="settings-slug">Adresse de la boutique (non modifiable)</Label>
              <Input id="settings-slug" value={store.slug} readOnly disabled className="h-11 font-mono text-sm" />
              <p className="text-xs text-muted-foreground">
                Le slug est immuable : c&apos;est l&apos;identifiant public de votre boutique.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="settings-name">Nom</Label>
              <Input
                id="settings-name"
                required
                minLength={2}
                maxLength={60}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-11"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="settings-description">Description</Label>
              <Textarea
                id="settings-description"
                rows={3}
                maxLength={400}
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
              <Label htmlFor="settings-phone">Téléphone / WhatsApp</Label>
              <Input
                id="settings-phone"
                type="tel"
                maxLength={30}
                placeholder="+229 01 97 00 00 00"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="h-11"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" className="h-11" disabled={saving}>
                {saving ? "Enregistrement…" : "Enregistrer les modifications"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11"
                onClick={() => navigateTo(`#/boutique/${store.slug}`)}
              >
                <ExternalLink className="size-4" aria-hidden="true" />
                Voir ma boutique
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Aperçu live */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">Aperçu en direct</p>
        <div className="overflow-hidden rounded-xl border shadow-sm">
          <div
            className="flex h-28 items-end p-4 transition-colors"
            style={{ backgroundColor: color }}
          >
            <p className="text-lg font-bold text-white drop-shadow">{name || "Nom de la boutique"}</p>
          </div>
          <div className="space-y-2 bg-card p-4">
            <p className="line-clamp-3 min-h-10 text-sm text-muted-foreground">
              {description || "Votre description apparaîtra ici pour présenter votre activité."}
            </p>
            <p className="text-xs text-muted-foreground">
              billograph.bj/#/boutique/{store.slug}
            </p>
            {phone && <p className="text-xs text-muted-foreground">Contact : {phone}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
