// Palette d'accent proposée aux vendeurs pour personnaliser leur boutique.
// Aucun bleu/indigo : on reste sur l'identité chaude & végétale de BILLOGRAPH.

export type StoreColorPreset = { value: string; label: string };

export const STORE_COLOR_PRESETS: StoreColorPreset[] = [
  { value: "#0B7A6B", label: "Vert profond" },
  { value: "#D97706", label: "Ambre" },
  { value: "#C2410C", label: "Terracotta" },
  { value: "#9F1239", label: "Framboise" },
  { value: "#4D7C0F", label: "Olive" },
  { value: "#6D28D9", label: "Prune" },
];

export function normalizeHexColor(input: string, fallback = "#0B7A6B"): string {
  const value = input.trim();
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}
