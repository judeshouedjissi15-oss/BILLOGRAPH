"use client";

import { Copy, MessageCircle, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

type ShareMenuProps = {
  path: string;
  title: string;
  description?: string;
  label?: string;
  iconOnly?: boolean;
};

function buildPublicUrl(path: string): string {
  const route = path.startsWith("#")
    ? `/${path}`
    : path.startsWith("/")
      ? path
      : `/${path}`;
  return `${window.location.origin}${route}`;
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const field = document.createElement("textarea");
  field.value = value;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.select();
  const copied = document.execCommand("copy");
  field.remove();
  if (!copied) throw new Error("Copie indisponible dans ce navigateur.");
}

export function ShareMenu({
  path,
  title,
  description,
  label = "Partager",
  iconOnly = false,
}: ShareMenuProps) {
  const { toast } = useToast();

  const getShareContent = () => {
    const url = buildPublicUrl(path);
    const message = description?.trim() || `Découvrez ${title} sur BILLOGRAPH.`;
    return { url, message, text: `${message}\n${url}` };
  };

  const handleCopy = async () => {
    try {
      const { text } = getShareContent();
      await copyText(text);
      toast({
        title: "Lien copié",
        description: "Vous pouvez maintenant le partager avec vos clients.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Copie impossible",
        description: error instanceof Error ? error.message : "Réessayez dans un instant.",
      });
    }
  };

  const handleWhatsApp = () => {
    const { text } = getShareContent();
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleNativeShare = async () => {
    const { url, message } = getShareContent();
    if (!navigator.share) {
      await handleCopy();
      return;
    }

    try {
      await navigator.share({ title, text: message, url });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      await handleCopy();
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size={iconOnly ? "icon" : "sm"}
          className={iconOnly ? "size-11 shrink-0" : "h-11"}
          aria-label={iconOnly ? `Partager ${title}` : undefined}
        >
          <Share2 className="size-4" aria-hidden="true" />
          {!iconOnly && label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => void handleWhatsApp()}>
          <MessageCircle className="size-4" aria-hidden="true" />
          Partager sur WhatsApp
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void handleNativeShare()}>
          <Share2 className="size-4" aria-hidden="true" />
          Autres applications
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void handleCopy()}>
          <Copy className="size-4" aria-hidden="true" />
          Copier le lien
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
