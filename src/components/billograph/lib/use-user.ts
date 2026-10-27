"use client";

// Hook de session : charge GET /api/auth/me une seule fois,
// expose refresh() et logout() (avec toast français).

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "./api-client";
import { useToast } from "@/hooks/use-toast";
import type { User } from "@/types/api";

export function useUser() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const refresh = useCallback(async () => {
    try {
      const data = await apiFetch<{ user: User | null }>("/api/auth/me");
      setUser(data.user ?? null);
    } catch {
      setUser(null); // 401 ou erreur réseau → invité
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    try {
      await apiFetch<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
      toast({
        title: "Déconnexion réussie",
        description: "À bientôt sur BILLOGRAPH !",
      });
    } catch {
      toast({
        title: "Déconnexion",
        description: "Votre session locale a été fermée.",
      });
    }
    setUser(null);
  }, [toast]);

  return { user, loading, refresh, logout };
}
