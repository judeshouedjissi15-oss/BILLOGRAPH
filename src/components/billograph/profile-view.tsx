"use client";

// MON PROFIL (#/profil) — gestion RÉELLE du compte pour TOUS les rôles
// (client, vendeur, admin, officiers) :
//   1. Photo de profil — import réel (stockage privé, servie via /api/images),
//      retrait, aperçu immédiat ;
//   2. Mes informations — nom, téléphone + PROFIL PUBLIC librement
//      personnalisable (titre, présentation, ville) ;
//   3. Mot de passe — changement (mot de passe actuel requis, les autres
//      sessions du compte sont fermées par le serveur) ;
//   4. Mon compte — rôle, statut, date d'inscription (lecture seule) +
//      accès à la page publique.
// AUCUNE donnée inventée : tout part de la session serveur et des vraies APIs.

import { useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  Camera,
  Eye,
  KeyRound,
  Laptop,
  Loader2,
  Mail,
  Pencil,
  Phone,
  ShieldCheck,
  Trash2,
  UserRound,
  UserRoundPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "./lib/api-client";
import { cleanupPrivateBlobs, uploadPrivateBlob } from "./lib/blob-upload";
import { navigateTo } from "./lib/use-hash-route";
import { UserAvatar } from "./user-avatar";
import type { User } from "@/types/api";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5 Mo — miroir du contrôle serveur

const ROLE_LABELS: Record<User["role"], string> = {
  CLIENT: "Client",
  VENDEUR: "Vendeur",
  ADMIN: "Administrateur",
};

type ProfileViewProps = {
  user: User;
  refreshUser: () => Promise<void>;
};

export function ProfileView({ user, refreshUser }: ProfileViewProps) {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Mon profil</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Votre photo, vos informations et votre profil public — pour tous les rôles.
        </p>
      </div>

      <AvatarCard user={user} refreshUser={refreshUser} />
      <InfoCard user={user} refreshUser={refreshUser} />
      <PasswordCard user={user} />
      <PrivacyCard />
      <SessionsCard />
      <EmailChangeCard user={user} />
      {user.role !== "ADMIN" && <DeletionRequestCard />}
      <AccountCard user={user} />
    </div>
  );
}

function PrivacyCard() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [discoverable, setDiscoverable] = useState(true);
  const [friendRequests, setFriendRequests] = useState(true);

  useEffect(() => {
    apiFetch<{ profileDiscoverable: boolean; friendRequestsEnabled: boolean }>("/api/me/preferences")
      .then((data) => {
        setDiscoverable(data.profileDiscoverable);
        setFriendRequests(data.friendRequestsEnabled);
      })
      .catch((err) => toast({
        variant: "destructive",
        title: "Réglages de confidentialité indisponibles",
        description: err instanceof Error ? err.message : "Réessayez.",
      }))
      .finally(() => setLoading(false));
  }, [toast]);

  const updatePreference = async (field: "profileDiscoverable" | "friendRequestsEnabled", value: boolean) => {
    setSaving(true);
    try {
      await apiFetch("/api/me/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (field === "profileDiscoverable") setDiscoverable(value);
      else setFriendRequests(value);
      toast({ title: "Réglage enregistré" });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Modification impossible",
        description: err instanceof Error ? err.message : "Réessayez.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Eye className="size-4 text-primary" aria-hidden="true" />
          Confidentialité et demandes d&apos;amis
        </CardTitle>
        <CardDescription>Choisissez si les autres membres peuvent vous trouver et vous inviter.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Label htmlFor="profile-discoverable">Profil découvrable</Label>
            <p className="mt-1 text-xs text-muted-foreground">Désactivé : votre profil public et votre compte sont exclus de la recherche de membres.</p>
          </div>
          <Switch id="profile-discoverable" checked={discoverable} disabled={loading || saving} onCheckedChange={(value) => void updatePreference("profileDiscoverable", value)} />
        </div>
        <Separator />
        <div className="flex items-start justify-between gap-4">
          <div>
            <Label htmlFor="friend-requests">Recevoir des demandes d&apos;amis</Label>
            <p className="mt-1 text-xs text-muted-foreground">Désactivé : les membres ne peuvent pas vous envoyer de nouvelle invitation.</p>
          </div>
          <Switch id="friend-requests" checked={friendRequests} disabled={loading || saving} onCheckedChange={(value) => void updatePreference("friendRequestsEnabled", value)} />
        </div>
      </CardContent>
    </Card>
  );
}

function SessionsCard() {
  const { toast } = useToast();
  const [sessions, setSessions] = useState<Array<{ id: string; createdAt: string; expiresAt: string; current: boolean; device: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    try {
      const result = await apiFetch<{ sessions: typeof sessions }>("/api/me/sessions");
      setSessions(result.sessions);
    } catch (err) {
      toast({ variant: "destructive", title: "Sessions indisponibles", description: err instanceof Error ? err.message : "Réessayez." });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, []);

  const revoke = async (id: string) => {
    setBusyId(id);
    try {
      await apiFetch("/api/me/sessions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: id }),
      });
      await load();
      toast({ title: "Session fermée" });
    } catch (err) {
      toast({ variant: "destructive", title: "Révocation impossible", description: err instanceof Error ? err.message : "Réessayez." });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Laptop className="size-4 text-primary" aria-hidden="true" />
          Sessions actives
        </CardTitle>
        <CardDescription>Fermez une session que vous ne reconnaissez plus. Le changement de mot de passe ferme aussi les autres sessions.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? <p className="text-sm text-muted-foreground">Chargement…</p> : sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune session active.</p>
        ) : sessions.map((session) => (
          <div key={session.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{session.current ? "Cet appareil" : session.device || "Appareil non identifié"}</p>
              <p className="text-xs text-muted-foreground">Ouverte le {new Date(session.createdAt).toLocaleString("fr-FR")} · expire le {new Date(session.expiresAt).toLocaleDateString("fr-FR")}</p>
            </div>
            {!session.current && <Button variant="outline" size="sm" disabled={busyId === session.id} onClick={() => void revoke(session.id)}>{busyId === session.id ? "Fermeture…" : "Fermer"}</Button>}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function EmailChangeCard({ user }: { user: User }) {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    setSaving(true);
    try {
      const result = await apiFetch<{ message: string }>("/api/me/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      setEmail("");
      setPassword("");
      toast({ title: "Email de confirmation envoyé", description: result.message });
    } catch (err) {
      toast({ variant: "destructive", title: "Changement d’email impossible", description: err instanceof Error ? err.message : "Réessayez." });
    } finally {
      setSaving(false);
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Mail className="size-4 text-primary" aria-hidden="true" />Changer d&apos;adresse email</CardTitle>
        <CardDescription>Adresse actuelle : {user.email}. Un lien à usage unique sera envoyé à la nouvelle adresse et expirera après 24 heures.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-3">
        <Input type="email" autoComplete="email" maxLength={254} placeholder="Nouvelle adresse email" value={email} onChange={(event) => setEmail(event.target.value)} />
        <Input type="password" autoComplete="current-password" placeholder="Mot de passe actuel" value={password} onChange={(event) => setPassword(event.target.value)} />
        <Button type="button" disabled={saving || !email || !password} onClick={() => void submit()}>{saving ? "Envoi…" : "Envoyer la confirmation"}</Button>
      </CardContent>
    </Card>
  );
}

function DeletionRequestCard() {
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [requested, setRequested] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    apiFetch<{ deletionRequestedAt: string | null }>("/api/me/preferences")
      .then((data) => setRequested(Boolean(data.deletionRequestedAt)))
      .catch((err) => toast({ variant: "destructive", title: "État du compte indisponible", description: err instanceof Error ? err.message : "Réessayez." }));
  }, [toast]);
  const submit = async () => {
    setBusy(true);
    try {
      await apiFetch("/api/me/deletion-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      setRequested(true);
      setPassword("");
      toast({ title: "Demande transmise à l’administration", description: "La suppression est soumise à un examen manuel." });
    } catch (err) {
      toast({ variant: "destructive", title: "Demande impossible", description: err instanceof Error ? err.message : "Réessayez." });
    } finally {
      setBusy(false);
    }
  };
  const cancel = async () => {
    setBusy(true);
    try {
      await apiFetch("/api/me/deletion-request", { method: "DELETE" });
      setRequested(false);
      toast({ title: "Demande annulée" });
    } catch (err) {
      toast({ variant: "destructive", title: "Annulation impossible", description: err instanceof Error ? err.message : "Réessayez." });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base text-destructive"><Trash2 className="size-4" aria-hidden="true" />Demander la suppression du compte</CardTitle>
        <CardDescription>Votre demande sera examinée par l&apos;administration. Si elle est approuvée, les données personnelles du profil seront anonymisées; les historiques financiers et les messages signalés pourront être conservés pour les obligations légales et de modération.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {requested ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium">Une demande de suppression est en cours.</p>
            <Button type="button" variant="outline" disabled={busy} onClick={() => void cancel()}>{busy ? "Annulation…" : "Annuler la demande"}</Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-3">
            <Input type="password" autoComplete="current-password" placeholder="Mot de passe pour confirmer" value={password} onChange={(event) => setPassword(event.target.value)} className="max-w-sm" />
            <Button type="button" variant="destructive" disabled={busy || !password} onClick={() => void submit()}>{busy ? "Envoi…" : "Soumettre ma demande"}</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ── Photo de profil ─────────────────────────────────────────────────── */

function AvatarCard({ user, refreshUser }: ProfileViewProps) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (file: File) => {
    if (file.size > MAX_AVATAR_BYTES) {
      toast({ variant: "destructive", title: "Image trop lourde", description: "5 Mo maximum." });
      return;
    }
    setBusy(true);
    let uploadedKey: string | null = null;
    try {
      const directUpload = await uploadPrivateBlob(file, "avatar");
      if (directUpload) {
        uploadedKey = directUpload.key;
        await apiFetch("/api/me/avatar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(directUpload),
        });
      } else {
        const form = new FormData();
        form.append("avatar", file);
        await apiFetch("/api/me/avatar", { method: "POST", body: form });
      }
      await refreshUser();
      toast({ title: "Photo de profil mise à jour" });
    } catch (err) {
      if (uploadedKey) await cleanupPrivateBlobs([uploadedKey]);
      toast({
        variant: "destructive",
        title: "Import impossible",
        description: err instanceof Error ? err.message : "Réessayez.",
      });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await apiFetch("/api/me/avatar", { method: "DELETE" });
      await refreshUser();
      toast({ title: "Photo retirée" });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Retrait impossible",
        description: err instanceof Error ? err.message : "Réessayez.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Camera className="size-4 text-primary" aria-hidden="true" />
          Ma photo de profil
        </CardTitle>
        <CardDescription>
          JPG, PNG, WebP ou GIF — 5 Mo maximum. Le contenu est vérifié côté serveur ; l&apos;ancienne
          photo est supprimée au remplacement.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-4">
        <UserAvatar name={user.name} avatarUrl={user.avatarUrl} className="size-20 border-2 border-primary/20" />
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="sr-only"
            aria-label="Choisir une photo de profil"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = "";
            }}
          />
          <Button type="button" className="h-10" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Pencil className="size-4" aria-hidden="true" />}
            {user.avatarUrl ? "Remplacer" : "Importer une photo"}
          </Button>
          {user.avatarUrl && (
            <Button type="button" variant="ghost" className="h-10 text-destructive hover:text-destructive" disabled={busy} onClick={() => void remove()}>
              <Trash2 className="size-4" aria-hidden="true" />
              Retirer
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Mes informations + PROFIL PUBLIC ────────────────────────────────── */

function InfoCard({ user, refreshUser }: ProfileViewProps) {
  const { toast } = useToast();
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone ?? "");
  // PROFIL PUBLIC — personnalisation libre (titre, présentation, ville).
  const [headline, setHeadline] = useState(user.headline ?? "");
  const [bio, setBio] = useState(user.bio ?? "");
  const [city, setCity] = useState(user.city ?? "");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (name.trim().length < 2) {
      toast({ variant: "destructive", title: "Nom trop court", description: "Au moins 2 caractères." });
      return;
    }
    if (bio.trim().length > 2000) {
      toast({ variant: "destructive", title: "Présentation trop longue", description: "2 000 caractères maximum." });
      return;
    }
    setSaving(true);
    try {
      await apiFetch("/api/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim() || null,
          headline: headline.trim() || null,
          bio: bio.trim() || null,
          city: city.trim() || null,
        }),
      });
      await refreshUser();
      toast({ title: "Informations enregistrées" });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Enregistrement impossible",
        description: err instanceof Error ? err.message : "Réessayez.",
      });
    } finally {
      setSaving(false);
    }
  };

  const dirty =
    name !== user.name ||
    phone !== (user.phone ?? "") ||
    headline !== (user.headline ?? "") ||
    bio !== (user.bio ?? "") ||
    city !== (user.city ?? "");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UserRound className="size-4 text-primary" aria-hidden="true" />
          Mes informations
        </CardTitle>
        <CardDescription>
          Votre identité et votre profil public — personnalisez-le à votre image : titre,
          présentation, ville. Visible sur votre page publique et dans vos boutiques.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="pr-name">Nom complet *</Label>
            <Input id="pr-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pr-phone">Téléphone</Label>
            <div className="relative">
              <Phone className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                id="pr-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                maxLength={30}
                className="h-11 pl-9"
                placeholder="+229 …"
              />
            </div>
          </div>
        </div>

        {/* PROFIL PUBLIC — personnalisable librement */}
        <Separator />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="pr-headline">Titre public</Label>
            <Input
              id="pr-headline"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              maxLength={120}
              className="h-11"
              placeholder="ex. Auteure & formatrice en digital"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pr-city">Ville / pays</Label>
            <Input
              id="pr-city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              maxLength={120}
              className="h-11"
              placeholder="ex. Cotonou, Bénin"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pr-bio">Présentation publique</Label>
          <Textarea
            id="pr-bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={2000}
            className="min-h-24"
            placeholder="Présentez-vous comme vous le souhaitez : votre parcours, vos créations, votre boutique… (2 000 caractères max)"
          />
          <p className="text-xs text-muted-foreground">{bio.length} / 2 000 caractères</p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            className="h-10"
            onClick={() => navigateTo(`#/membre/${user.id}`)}
          >
            Voir ma page publique
          </Button>
          <Button type="button" className="h-11" disabled={saving || !dirty} onClick={() => void submit()}>
            {saving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Mot de passe ────────────────────────────────────────────────────── */

function PasswordCard({ user }: { user: User }) {
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (newPassword.length < 8) {
      toast({ variant: "destructive", title: "Mot de passe trop court", description: "8 caractères minimum." });
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch<{ autresSessionsFermees: number }>("/api/me/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword("");
      setNewPassword("");
      toast({
        title: "Mot de passe modifié",
        description:
          res.autresSessionsFermees > 0
            ? `${res.autresSessionsFermees} autre(s) session(s) ont été fermée(s) par sécurité.`
            : "Vos autres sessions restent actives sur cet appareil.",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Changement impossible",
        description: err instanceof Error ? err.message : "Vérifiez votre mot de passe actuel.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="size-4 text-primary" aria-hidden="true" />
          Mon mot de passe
        </CardTitle>
        <CardDescription>
          Votre mot de passe actuel est requis (preuve d&apos;identité). Toutes les autres sessions du
          compte sont fermées par sécurité.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="pr-current">Mot de passe actuel *</Label>
            <Input
              id="pr-current"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="h-11"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pr-new">Nouveau mot de passe *</Label>
            <Input
              id="pr-new"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              maxLength={128}
              className="h-11"
              placeholder="8 caractères minimum"
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button
            type="button"
            className="h-11"
            disabled={saving || currentPassword === "" || newPassword.length < 8}
            onClick={() => void submit()}
          >
            {saving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            {saving ? "Modification…" : "Modifier le mot de passe"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Mon compte (lecture seule) ──────────────────────────────────────── */

function AccountCard({ user }: { user: User }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
          Mon compte
        </CardTitle>
        <CardDescription>Informations gérées par la plateforme (lecture seule).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-muted-foreground">Adresse email</span>
          <span className="font-medium">{user.email}</span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-muted-foreground">Rôle</span>
          <Badge variant="outline">{ROLE_LABELS[user.role]}</Badge>
        </div>
        {user.officeActive && user.officeLabel && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-muted-foreground">Poste (office)</span>
            <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary">
              {user.officeLabel}
            </Badge>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-muted-foreground">Statut</span>
          <Badge
            variant="outline"
            className={
              user.status === "ACTIVE"
                ? "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
                : "border-red-300 bg-red-100 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
            }
          >
            {user.status === "ACTIVE" ? "Actif" : "Suspendu"}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-1 text-muted-foreground">
            <CalendarDays className="size-3.5" aria-hidden="true" />
            Membre depuis
          </span>
          <span className="font-medium">{new Date(user.createdAt).toLocaleDateString("fr-FR")}</span>
        </div>
      </CardContent>
    </Card>
  );
}
