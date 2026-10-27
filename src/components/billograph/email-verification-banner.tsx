"use client";

// BANNIÈRE DE CONFIRMATION D'EMAIL — affichée dans le tableau de bord tant que
// l'utilisateur n'a pas confirmé son adresse email. Bouton « Renvoyer l'email »
// (rate-limit serveur : 3 / 10 min) avec retour honnête sur l'état de l'envoi :
// SENT (parti via SMTP), PENDING (SMTP non configuré — l'admin transmettra le
// lien), FAILED (échec).

import { useState } from "react";
import { AlertTriangle, MailWarning, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "./lib/api-client";
import { useToast } from "@/hooks/use-toast";
import type { User } from "@/types/api";

type ResendResponse = {
  resent: true;
  email: string;
  emailConfirmation: { status: "SENT" | "PENDING" | "FAILED" };
};

export function EmailVerificationBanner({ user }: { user: User }) {
  const { toast } = useToast();
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  if (user.emailVerified) return null;

  const resend = async () => {
    setSending(true);
    try {
      const data = await apiFetch<ResendResponse>("/api/auth/resend-verification", {
        method: "POST",
      });
      setDone(true);
      const s = data.emailConfirmation.status;
      toast({
        title: s === "SENT" ? "Email envoyé" : s === "PENDING" ? "Email enregistré en attente" : "Envoi impossible",
        description:
          s === "SENT"
            ? `Un nouvel email de confirmation a été envoyé à ${data.email}.`
            : s === "PENDING"
              ? "L'envoi automatique n'est pas encore activé (SMTP non configuré) : l'administrateur peut vous transmettre le lien de confirmation directement."
              : "Une erreur est survenue côté serveur. Réessayez dans quelques minutes.",
        variant: s === "FAILED" ? "destructive" : undefined,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Renvoi impossible",
        description: error instanceof Error ? error.message : "Réessayez dans quelques minutes.",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-3">
        <MailWarning className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden="true" />
        <div>
          <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-900">
            <AlertTriangle className="size-3.5" aria-hidden="true" />
            Confirmez votre adresse email
          </p>
          <p className="mt-0.5 text-sm text-amber-800">
            Un email de confirmation a été envoyé à <strong>{user.email}</strong>. Ouvrez le lien
            qu&apos;il contient pour activer pleinement votre compte (valable 24 h).
          </p>
        </div>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="h-9 shrink-0 border-amber-600/50 text-amber-900 hover:bg-amber-500/20"
        onClick={resend}
        disabled={sending || done}
      >
        <Send className="size-3.5" aria-hidden="true" />
        {done ? "Email renvoyé" : sending ? "Envoi…" : "Renvoyer l'email"}
      </Button>
    </div>
  );
}
