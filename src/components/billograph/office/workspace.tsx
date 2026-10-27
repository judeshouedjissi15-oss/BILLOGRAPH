"use client";

// ESPACE PROFESSIONNEL DE L'OFFICIER (#/professionnel)
// Module « MAGNIFIER SON APPEL » — espace de travail adapté automatiquement
// au rôle (office) et aux permissions effectives de l'utilisateur.
// Chaque section s'appuie sur des données RÉELLES de la base (aucune
// statistique inventée). Un compte CLIENT/VENDEUR conserve intégralement son
// espace existant : l'espace professionnel S'AJOUTE, il ne remplace rien.
// Le PROPRIÉTAIRE (ADMIN) hérite des capacités des officiers : il choisit
// l'office dans lequel opérer (sélecteur en haut à droite).

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  BookOpenCheck,
  CalendarDays,
  ClipboardList,
  Crown,
  Flag,
  HandHeart,
  History,
  LifeBuoy,
  ShieldAlert,
  Target,
  Users,
  Bell,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { apiFetch } from "../lib/api-client";
import { navigateTo } from "../lib/use-hash-route";
import { OFFICE_DEFS } from "@/lib/offices";
import type { OfficeOverview } from "@/types/api";
import type { User } from "@/types/api";
import { OfficeScopeContext, type OfficeScope } from "./office-scope";
import { MissionSection } from "./mission-section";
import { TasksSection } from "./tasks-section";
import { ObjectivesSection } from "./objectives-section";
import { AdjointsSection } from "./adjoints-section";
import { TrainingSection } from "./training-section";
import { CalendarSection } from "./calendar-section";
import { ReportsSection } from "./reports-section";
import { HelpSection } from "./help-section";
import { OfficeNotificationsSection } from "./notifications-section";
import { HistorySection } from "./history-section";

type SectionKey =
  | "mission"
  | "tasks"
  | "objectives"
  | "adjoints"
  | "training"
  | "calendar"
  | "reports"
  | "help"
  | "notifications"
  | "history";

const SECTIONS: { key: SectionKey; label: string; icon: typeof Flag }[] = [
  { key: "mission", label: "Mon appel et ma mission", icon: Flag },
  { key: "tasks", label: "Mes tâches", icon: ClipboardList },
  { key: "objectives", label: "Mes objectifs et mon plan", icon: Target },
  { key: "adjoints", label: "Mon équipe d'office", icon: Users },
  { key: "training", label: "Ma formation", icon: BookOpenCheck },
  { key: "calendar", label: "Mon calendrier", icon: CalendarDays },
  { key: "reports", label: "Mes rapports", icon: BadgeCheck },
  { key: "help", label: "Demander de l'aide", icon: LifeBuoy },
  { key: "notifications", label: "Mes notifications", icon: Bell },
  { key: "history", label: "Mon historique de travail", icon: History },
];

type WorkspaceProps = {
  user: User;
  initialSection?: string | null;
};

export function OfficeWorkspace({ user, initialSection }: WorkspaceProps) {
  // PROPRIÉTAIRE (ADMIN) : il choisit l'office dans lequel opérer — il hérite
  // des capacités des officiers (tâches, objectifs, calendrier, rapports…).
  const isOwner = user.role === "ADMIN";
  const [ownerOffice, setOwnerOffice] = useState<string | null>(null);
  const [overview, setOverview] = useState<OfficeOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState<SectionKey>(
    (SECTIONS.find((s) => s.key === initialSection)?.key as SectionKey) ?? "mission",
  );

  // L'office effectif à interroger : celui du propriétaire (choisi) ou le sien.
  const scope: OfficeScope = useMemo(
    () => ({ officeRole: ownerOffice, asOwner: isOwner }),
    [ownerOffice, isOwner],
  );

  const load = useCallback(async () => {
    setError(null);
    try {
      const url = scope.asOwner && scope.officeRole
        ? `/api/office/overview?officeRole=${encodeURIComponent(scope.officeRole)}`
        : "/api/office/overview";
      const data = await apiFetch<OfficeOverview>(url);
      setOverview(data);
    } catch (err) {
      // 403 = aucun office actif : l'espace reste consultable en mode « module
      // manquant » (non bloquant, le compte existant continue de fonctionner).
      // 422 (propriétaire) = choisir un office dans le sélecteur.
      const status = (err as { status?: number }).status;
      if (status !== 403 && status !== 422) {
        setError(err instanceof Error ? err.message : "Erreur de chargement.");
      }
      setOverview(null);
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  const refresh = useCallback(() => load(), [load]);

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8" aria-busy="true">
        <Skeleton className="h-10 w-72" />
        <div className="grid gap-4 md:grid-cols-[240px_1fr]">
          <Skeleton className="h-96 rounded-xl" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </div>
    );
  }

  // ── Aucun office actif : message NON BLOQUANT + signalement au propriétaire.
  if (!overview) {
    // Le propriétaire choisit l'office dans lequel opérer (aucun blocage).
    if (isOwner && !error) {
      return <OwnerOfficeChooser onChoose={(key) => setOwnerOffice(key)} />;
    }
    return <MissingOfficeModule error={error} />;
  }

  const { office, counts } = overview;
  const availableSections = SECTIONS.filter((s) => s.key !== "adjoints" || office.canHaveAdjoints || scope.asOwner);

  const goVendorSpace = () => navigateTo("#/dashboard");

  return (
    <OfficeScopeContext.Provider value={scope}>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold tracking-tight">
              {scope.asOwner ? (
                <Crown className="size-6 text-primary" aria-hidden="true" />
              ) : (
                <HandHeart className="size-6 text-primary" aria-hidden="true" />
              )}
              Espace professionnel — {office.officeName}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {scope.asOwner
                ? `Bonjour ${user.name.split(" ")[0]} — vous agissez dans cet office avec les capacités d'un officier. Toutes vos actions sont réelles et tracées.`
                : `Bonjour ${user.name.split(" ")[0]} — ${office.label}. ${office.welcomeNote}`}
            </p>
          </div>
          {scope.asOwner ? (
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={ownerOffice ?? undefined}
                onValueChange={(value) => setOwnerOffice(value)}
              >
                <SelectTrigger className="h-11 w-64" aria-label="Office dans lequel opérer">
                  <SelectValue placeholder="Choisir un office" />
                </SelectTrigger>
                <SelectContent>
                  {OFFICE_DEFS.map((def) => (
                    <SelectItem key={def.key} value={def.key}>
                      {def.officeName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" className="h-11" onClick={goVendorSpace}>
                Administration
              </Button>
            </div>
          ) : (
            <Button variant="outline" className="h-11" onClick={goVendorSpace}>
              Retour à mon espace {user.role === "VENDEUR" ? "vendeur" : user.role === "ADMIN" ? "administrateur" : "personnel"}
            </Button>
          )}
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-[250px_1fr]">
          {/* Navigation des sections */}
          <nav aria-label="Sections de l'espace professionnel" className="md:sticky md:top-20 md:self-start">
            <div className="flex gap-2 overflow-x-auto pb-2 md:flex-col md:overflow-visible md:pb-0">
              {availableSections.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSection(key)}
                  aria-current={section === key ? "page" : undefined}
                  className={cn(
                    "inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    section === key
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {label}
                  {key === "notifications" && counts.unreadNotifications > 0 && (
                    <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
                      {counts.unreadNotifications}
                    </span>
                  )}
                  {key === "adjoints" && counts.pendingValidations > 0 && (
                    <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold text-white">
                      {counts.pendingValidations}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </nav>

          {/* Contenu de la section — adapté au rôle (office) de l'utilisateur */}
          <div className="min-w-0">
            {section === "mission" && <MissionSection office={office} counts={counts} />}
            {section === "tasks" && <TasksSection office={office} onChanged={refresh} />}
            {section === "objectives" && <ObjectivesSection onChanged={refresh} />}
            {section === "adjoints" && <AdjointsSection />}
            {section === "training" && <TrainingSection />}
            {section === "calendar" && <CalendarSection onChanged={refresh} />}
            {section === "reports" && <ReportsSection onChanged={refresh} />}
            {section === "help" && <HelpSection onChanged={refresh} />}
            {section === "notifications" && <OfficeNotificationsSection onChanged={refresh} />}
            {section === "history" && <HistorySection />}
          </div>
        </div>
      </div>
    </OfficeScopeContext.Provider>
  );
}

/**
 * Sélecteur d'office du PROPRIÉTAIRE : il hérite des capacités de tous les
 * offices — il choisit dans lequel opérer. Aucun office n'est présumé.
 */
function OwnerOfficeChooser({ onChoose }: { onChoose: (key: string) => void }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <Card>
        <CardContent className="flex flex-col items-center gap-5 p-8 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Crown className="size-7" aria-hidden="true" />
          </span>
          <h1 className="text-xl font-bold tracking-tight">Espace professionnel — choisissez l&apos;office</h1>
          <p className="text-sm text-muted-foreground">
            En tant que propriétaire, vous disposez des capacités de tous les officiers : tâches,
            objectifs, calendrier, rapports et demandes d&apos;aide de chaque office. Sélectionnez
            l&apos;office dans lequel vous souhaitez opérer — vos actions restent réelles, nominatives
            et tracées.
          </p>
          <div className="grid w-full gap-2 sm:grid-cols-2">
            {OFFICE_DEFS.map((def) => (
              <button
                key={def.key}
                type="button"
                onClick={() => onChoose(def.key)}
                className="rounded-lg border p-4 text-left transition-colors hover:border-primary/50 hover:bg-primary/5"
              >
                <p className="font-semibold">{def.officeName}</p>
                <p className="mt-1 text-xs text-muted-foreground">{def.label}</p>
              </button>
            ))}
          </div>
          <Button variant="outline" className="h-11" onClick={() => navigateTo("#/admin")}>
            Retour à l&apos;administration
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

/** Module manquant : message clair + signalement réel au propriétaire. */
function MissingOfficeModule({ error }: { error: string | null }) {
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");

  const report = async () => {
    setSending(true);
    try {
      await apiFetch("/api/office/signal-missing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message.trim() || undefined }),
      });
      setSent(true);
    } catch {
      setSent(false);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <Card>
        <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
            <ShieldAlert className="size-7" aria-hidden="true" />
          </span>
          <h1 className="text-xl font-bold tracking-tight">Aucun espace professionnel actif</h1>
          <p className="text-sm text-muted-foreground">
            {error ??
              "Votre compte ne porte pas encore d'office (poste d'officier). Rassurez-vous : votre compte et votre espace actuels continuent de fonctionner normalement. Le propriétaire peut vous attribuer un poste depuis l'administration (Utilisateurs → Poste)."}
          </p>
          {sent ? (
            <p className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
              Votre signalement a bien été transmis au propriétaire. Il a été notifié et reviendra
              vers vous.
            </p>
          ) : (
            <div className="w-full space-y-3">
              <textarea
                className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm"
                placeholder="Précisez éventuellement votre besoin (facultatif)…"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={2000}
              />
              <Button className="h-11 w-full" disabled={sending} onClick={() => void report()}>
                {sending ? "Envoi…" : "Signaler le module manquant au propriétaire"}
              </Button>
            </div>
          )}
          <Button variant="outline" className="h-11" onClick={() => navigateTo("#/dashboard")}>
            Retour à mon tableau de bord
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
