export function hashRouteUrl(route: string): string {
  const hashRoute = route.startsWith("#") ? route : `#${route}`;
  return `${window.location.origin}/${hashRoute}`;
}

export async function copyShareUrl(url: string): Promise<void> {
  if (!navigator.clipboard?.writeText) {
    throw new Error("La copie automatique n'est pas disponible dans ce navigateur.");
  }
  await navigator.clipboard.writeText(url);
}

export function openWhatsAppShare(message: string): void {
  window.open(
    `https://wa.me/?text=${encodeURIComponent(message)}`,
    "_blank",
    "noopener,noreferrer",
  );
}
