"use client";

// Avatar utilisateur partagé — affiche la photo de profil réelle si présente,
// sinon les initiales. Utilisé par le header et la page « Mon profil ».
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export function UserAvatar({
  name,
  avatarUrl,
  className,
}: {
  name: string;
  avatarUrl: string | null;
  className?: string;
}) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <Avatar className={cn("size-9", className)}>
      {avatarUrl ? <AvatarImage src={avatarUrl} alt={`Photo de profil de ${name}`} /> : null}
      <AvatarFallback className="text-xs font-semibold">{initials}</AvatarFallback>
    </Avatar>
  );
}
