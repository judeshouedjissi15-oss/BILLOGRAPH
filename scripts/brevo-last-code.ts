// LECTURE DU JOURNAL BREVO — récupère le DERNIER email de confirmation envoyé
// à une adresse donnée et en extrait le code à 6 chiffres réellement envoyé.
// Utilisé UNIQUEMENT pour la vérification E2E (le destinataire de test est une
// adresse alias du fondateur — aucun accès tiers à des boîtes réelles).
//
// Usage :
//   bun --conditions react-server scripts/brevo-last-code.ts --email=…@gmail.com
import { getBrevoConfig } from "../src/lib/smtp";

async function main() {
  const arg = process.argv.find((a) => a.startsWith("--email="));
  const target = (arg?.slice("--email=".length) ?? "").trim().toLowerCase();
  if (!target) {
    console.error("[brevo-last-code] Usage : --email=adresse@exemple.com");
    process.exit(1);
  }

  const config = await getBrevoConfig();
  if (!config) {
    console.error("[brevo-last-code] Aucune configuration Brevo active.");
    process.exit(1);
  }

  // Derniers emails transactionnels pour cette adresse (le plus récent d'abord).
  const listRes = await fetch(`https://api.brevo.com/v3/smtp/emails?limit=20&email=${encodeURIComponent(target)}`, {
    headers: { "api-key": config.apiKey, accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!listRes.ok) {
    console.error(`[brevo-last-code] Journal inaccessible : HTTP ${listRes.status}`);
    process.exit(1);
  }
  const list = (await listRes.json()) as {
    transactionalEmails?: Array<{
      uuid: string;
      subject: string;
      to?: unknown;
      date?: string;
    }>;
  };

  const toContainsAddress = (to: unknown): boolean => {
    if (typeof to === "string") return to.toLowerCase().includes(target);
    if (Array.isArray(to)) {
      return to.some(
        (t) =>
          (typeof t === "string" && t.toLowerCase().includes(target)) ||
          (t && typeof t === "object" && "email" in t && String((t as { email: string }).email).toLowerCase().includes(target)),
      );
    }
    return false;
  };

  // Le filtre `email` a déjà été appliqué côté Brevo ; on ne s'appuie que sur
  // le sujet (le champ `to` n'est pas toujours exposé dans le listing).
  const match = (list.transactionalEmails ?? []).find(
    (m) => (m.subject ?? "").toLowerCase().includes("code de confirmation"),
  );

  // Voie alternative si le listing ne retourne rien (le filtre `email` de
  // Brevo ne matche pas toujours les alias « +tag ») : le journal
  // d'événements fournit le messageId de l'envoi réel. Fenêtres candidates
  // (robuste aux fuseaux et à la fenêtre de rétention Brevo).
  let identifier = match?.uuid ?? null;
  if (!identifier) {
    // Brevo compare les dates en UTC : toujours décaler de la date UTC.
    const day = (offset: number) => {
      const now = new Date();
      now.setUTCDate(now.getUTCDate() + offset);
      return now.toISOString().slice(0, 10);
    };
    const windows = [
      [day(-1), day(0)],
      [day(0), day(0)],
      [day(-2), day(-1)],
    ] as const;

    const events = { events: [] as Array<{ email?: string; event?: string; messageId?: string; subject?: string }> };
    for (const [start, end] of windows) {
      const evRes = await fetch(
        `https://api.brevo.com/v3/smtp/statistics/events?startDate=${start}&endDate=${end}&limit=100`,
        {
          headers: { "api-key": config.apiKey, accept: "application/json" },
          signal: AbortSignal.timeout(15_000),
        },
      );
      if (!evRes.ok) continue;
      const data = (await evRes.json()) as typeof events;
      if ((data.events ?? []).length > 0) {
        events.events = data.events!;
        break;
      }
    }
    const ev = (events.events ?? []).find(
      (e) => {
        const email = (e.email ?? "").toLowerCase();
        // Brevo peut NORMALISER les alias « +tag » (ex. judeshouedjissi2+nav42
        // enregistré sous judeshouedjissi+nav42) : on apparie donc de façon
        // tolérante — même étiquette « +tag » et même domaine, ou égalité exacte.
        const tagOf = (addr: string) => {
          const [local, domain] = addr.split("@");
          const plus = local.indexOf("+");
          return { tag: plus >= 0 ? local.slice(plus + 1) : null, domain: domain ?? "" };
        };
        const a = tagOf(email);
        const b = tagOf(target);
        const sameTag =
          a.domain === b.domain && a.tag !== null && a.tag === b.tag;
        return (
          email === target || sameTag
        ) &&
          (e.subject ?? "").toLowerCase().includes("code de confirmation") &&
          !!e.messageId;
      },
    );
    if (!ev) {
      console.error(`[brevo-last-code] Aucun email « code de confirmation » trouvé pour ${target}.`);
      process.exit(1);
    }
    identifier = ev.messageId!.replace(/^<|>$/g, "");
  }

  // Détail de l'email (contenu complet) — identifiant = uuid ou messageId.
  const detailRes = await fetch(`https://api.brevo.com/v3/smtp/emails/${encodeURIComponent(identifier)}`, {
    headers: { "api-key": config.apiKey, accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!detailRes.ok) {
    console.error(`[brevo-last-code] Détail inaccessible : HTTP ${detailRes.status}`);
    process.exit(1);
  }
  const detail = (await detailRes.json()) as { body?: string; subject?: string };

  // Le code est dans le bloc stylé du HTML (letter-spacing 10px, couleur #063bb6).
  const html = detail.body ?? "";
  const htmlMatch = html.match(/letter-spacing:10px[^>]*>(\d{6})</);
  let code: string | null = htmlMatch?.[1] ?? null;

  if (!code) {
    // Repli : un chiffre isolé sur sa propre ligne dans le HTML/texte.
    const line = html
      .split("\n")
      .map((l) => l.trim().replace(/<[^>]+>/g, ""))
      .find((l) => /^\d{6}$/.test(l));
    code = line ?? null;
  }

  if (!code) {
    console.error("[brevo-last-code] Impossible d'extraire le code du contenu de l'email.");
    console.error(`[brevo-last-code] Sujet : ${detail.subject ?? "(non exposé)"}`);
    process.exit(1);
  }

  // Lien de confirmation contenu dans l'email (voie de secours).
  const linkMatch = html.match(/https?:\/\/[^"'\s]+\/#\/verifier-email\/[0-9a-f]+/);
  const lien = linkMatch?.[0] ?? null;

  console.log(JSON.stringify({ ok: true, to: target, subject: detail.subject ?? "Votre code de confirmation BILLOGRAPH", code, lien }));
  process.exit(0);
}

main().catch((e) => {
  console.error("[brevo-last-code] Erreur :", e instanceof Error ? e.message : e);
  process.exit(1);
});
