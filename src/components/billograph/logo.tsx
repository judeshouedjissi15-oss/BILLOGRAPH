import { cn } from "@/lib/utils";

// Logo BILLOGRAPH : emblème officiel (sac + panier + badge SALE, généré depuis le
// logo officiel via scripts/build-brand-assets.mjs) + wordmark typographique aux
// couleurs échantillonnées du logo (bleu #063bb6, accent vert #09c237 sur le « A »).
// En mode sombre, le bleu trop profond passe sur un tint clair pour garder le contraste.

export function Logo({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <img
        src="/brand/logo-emblem.png"
        alt="Logo BILLOGRAPH"
        className="size-9 shrink-0 rounded-lg"
        aria-hidden="true"
      />
      {!compact && (
        <span className="text-lg font-bold tracking-tight select-none">
          <span className="text-[#063bb6] dark:text-[#8ab0ff]">BILLOGR</span>
          <span className="text-[#09a12f]">A</span>
          <span className="text-[#063bb6] dark:text-[#8ab0ff]">PH</span>
        </span>
      )}
    </span>
  );
}
