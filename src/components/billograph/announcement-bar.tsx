"use client";

// BARRE D'ANNONCE PUBLIQUE — affichée en haut du site (au-dessus du header)
// lorsqu'une annonce est active. Le visiteur peut la fermer : son choix est
// mémorisé par identifiant d'annonce (localStorage) — une NOUVELLE annonce
// réapparaît toujours. Contenu 100 % réel : GET /api/announcements/active.

import { useEffect, useState } from "react";
import { Megaphone, X } from "lucide-react";
import { apiFetch } from "./lib/api-client";
import { navigateTo } from "./lib/use-hash-route";
import type { ActiveAnnouncement } from "@/types/api";

const DISMISS_KEY = "blg-annonce-dismissed-id";

function readDismissedId(): string | null {
  try {
    return window.localStorage.getItem(DISMISS_KEY);
  } catch {
    return null; // navigation privée / stockage bloqué : on affiche l'annonce
  }
}

export function AnnouncementBar() {
  const [announcement, setAnnouncement] = useState<ActiveAnnouncement | null>(null);
  const [dismissed, setDismissed] = useState(true); // true tant que le chargement n'est pas fait (anti-flash)

  useEffect(() => {
    let cancelled = false;
    void apiFetch<{ announcement: ActiveAnnouncement | null }>("/api/announcements/active")
      .then((data) => {
        if (cancelled) return;
        if (data.announcement && readDismissedId() !== data.announcement.id) {
          setAnnouncement(data.announcement);
          setDismissed(false);
        } else {
          setAnnouncement(null);
        }
      })
      .catch(() => {
        // Annonce indisponible : la barre reste silencieuse (jamais bloquante).
        if (!cancelled) setAnnouncement(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = () => {
    setDismissed(true);
    if (announcement) {
      try {
        window.localStorage.setItem(DISMISS_KEY, announcement.id);
      } catch {
        // stockage indisponible : fermeture pour la session courante seulement
      }
    }
  };

  if (!announcement || dismissed) return null;

  return (
    <aside
      role="region"
      aria-label="Annonce de la plateforme"
      className="w-full bg-primary text-primary-foreground"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-center gap-3 px-4 py-2.5 text-center sm:justify-between">
        <p className="flex min-w-0 items-center justify-center gap-2 text-sm font-medium sm:justify-start">
          <Megaphone className="size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0">{announcement.message}</span>
        </p>
        <div className="flex shrink-0 items-center gap-1">
          {announcement.link ? (
            announcement.link.startsWith("http") ? (
              <a
                href={announcement.link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 items-center rounded-md px-2 text-sm font-semibold underline underline-offset-2 hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-foreground"
              >
                {announcement.linkLabel ?? "En savoir plus"}
              </a>
            ) : (
              <button
                type="button"
                onClick={() => navigateTo(announcement.link as string)}
                className="inline-flex h-8 items-center rounded-md px-2 text-sm font-semibold underline underline-offset-2 hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-foreground"
              >
                {announcement.linkLabel ?? "En savoir plus"}
              </button>
            )
          ) : null}
          <button
            type="button"
            aria-label="Fermer l'annonce"
            className="inline-flex size-8 items-center justify-center rounded-md hover:bg-primary-foreground/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-foreground"
            onClick={dismiss}
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </aside>
  );
}
