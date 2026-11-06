"use client";

export type CampaignAttribution = {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
  referrer?: string;
};

const STORAGE_KEY = "blg:campaign-attribution";

function clean(value: string | null | undefined, max: number): string | undefined {
  const result = value?.trim().slice(0, max);
  return result || undefined;
}

function readCurrentAttribution(): CampaignAttribution {
  if (typeof window === "undefined") return {};
  const hash = window.location.hash;
  const queryIndex = hash.indexOf("?");
  const hashParams = new URLSearchParams(queryIndex >= 0 ? hash.slice(queryIndex + 1) : "");
  const searchParams = new URLSearchParams(window.location.search);
  const read = (key: string, max: number) =>
    clean(hashParams.get("utm_" + key) ?? searchParams.get("utm_" + key), max);

  return {
    source: read("source", 120),
    medium: read("medium", 120),
    campaign: read("campaign", 180),
    content: read("content", 180),
    term: read("term", 180),
    referrer: clean(document.referrer, 500),
  };
}

function readSavedAttribution(): CampaignAttribution {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      source: typeof parsed.source === "string" ? clean(parsed.source, 120) : undefined,
      medium: typeof parsed.medium === "string" ? clean(parsed.medium, 120) : undefined,
      campaign: typeof parsed.campaign === "string" ? clean(parsed.campaign, 180) : undefined,
      content: typeof parsed.content === "string" ? clean(parsed.content, 180) : undefined,
      term: typeof parsed.term === "string" ? clean(parsed.term, 180) : undefined,
      referrer: typeof parsed.referrer === "string" ? clean(parsed.referrer, 500) : undefined,
    };
  } catch {
    return {};
  }
}

export function captureCampaignAttribution(): void {
  if (typeof window === "undefined") return;
  const current = readCurrentAttribution();
  if (!current.source && !current.medium && !current.campaign && !current.content && !current.term) return;
  const saved = readSavedAttribution();
  const merged = Object.fromEntries(
    Object.entries({ ...saved, ...current }).filter(([, value]) => Boolean(value)),
  ) as CampaignAttribution;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // Le parcours d'achat reste disponible si le stockage du navigateur est désactivé.
  }
}

export function getCampaignAttribution(): CampaignAttribution {
  if (typeof window === "undefined") return {};
  const saved = readSavedAttribution();
  const current = readCurrentAttribution();
  return Object.fromEntries(
    Object.entries({ ...saved, ...current }).filter(([, value]) => Boolean(value)),
  ) as CampaignAttribution;
}
