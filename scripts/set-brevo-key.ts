// AMORÇAGE BREVO — enregistre la clé API Brevo RÉELLE (chiffrée AES-256-GCM)
// dans PlatformSettings.smtpConfig avec le fournisseur « brevo ».
//
// Usage (la clé n'est JAMAIS écrite dans un fichier ni dans le shell historisé
// autrement que via la variable d'environnement) :
//   BREVO_API_KEY=xkeysib-… bun --conditions react-server scripts/set-brevo-key.ts
//
// Options :
//   BREVO_FROM_EMAIL (défaut : judeshouedjissi2@gmail.com — expéditeur validé)
//   BREVO_FROM_NAME  (défaut : BILLOGRAPH)
import { db } from "../src/lib/db";
import { saveBrevoConfig, getBrevoConfig, maskBrevoKey } from "../src/lib/smtp";

async function main() {
  const apiKey = (process.env.BREVO_API_KEY ?? "").trim();
  if (!apiKey) {
    console.error("[set-brevo-key] BREVO_API_KEY manquante (variable d'environnement requise).");
    process.exit(1);
  }
  if (!apiKey.startsWith("xkeysib-")) {
    console.error("[set-brevo-key] Refusé : une clé API Brevo commence par « xkeysib- ».");
    process.exit(1);
  }

  const fromEmail = (process.env.BREVO_FROM_EMAIL ?? "judeshouedjissi2@gmail.com").trim();
  const fromName = (process.env.BREVO_FROM_NAME ?? "BILLOGRAPH").trim();

  await saveBrevoConfig({ apiKey, fromName, fromEmail, siteUrl: null });

  const saved = await getBrevoConfig();
  if (!saved) {
    console.error("[set-brevo-key] ÉCHEC : la configuration n'est pas relisible après écriture.");
    process.exit(1);
  }
  console.log(`[set-brevo-key] Clé enregistrée (chiffrée) : ${maskBrevoKey(apiKey)}`);
  console.log(`[set-brevo-key] Expéditeur : « ${saved.fromName} » <${saved.fromEmail}>`);
  const settings = await db.platformSettings.findUnique({ where: { id: "main" } });
  console.log(`[set-brevo-key] Fournisseur actif : brevo — siteUrl=${settings?.siteUrl ?? "(non défini)"}`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error("[set-brevo-key] Erreur :", e instanceof Error ? e.message : e);
  process.exit(1);
});
