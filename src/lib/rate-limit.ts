// Limitation de débit en mémoire (MVP mono-instance).
// Utilisée notamment pour protéger /api/auth/login contre le brute-force.
import { HttpError } from "@/lib/auth";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

// Nettoyage périodique pour éviter une croissance illimitée.
const SWEEP_INTERVAL = 5 * 60 * 1000;
let lastSweep = Date.now();

function sweep() {
  if (Date.now() - lastSweep < SWEEP_INTERVAL) return;
  lastSweep = Date.now();
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt < now) buckets.delete(key);
  }
}

/**
 * Applique une fenêtre glissante simple.
 * @param key identifiant unique (ex: "login:ip-1.2.3.4")
 * @param max nombre maximal de requêtes
 * @param windowMs fenêtre en millisecondes
 * @throws HttpError 429 si la limite est dépassée
 */
export function rateLimit(key: string, max: number, windowMs: number): void {
  sweep();
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  bucket.count += 1;
  if (bucket.count > max) {
    const retryIn = Math.ceil((bucket.resetAt - now) / 1000);
    throw new HttpError(429, `Trop de tentatives. Réessayez dans ${retryIn} s.`);
  }
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "inconnu";
}
