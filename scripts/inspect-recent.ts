// Inspection ponctuelle (fondateur) — audit récent, configuration, utilisateurs/tokens.
import { db } from "../src/lib/db";
const settings = await db.platformSettings.findUnique({ where: { id: "main" } });
console.log("=== PlatformSettings ===");
console.log("paymentConfig:", settings?.paymentConfig ? settings.paymentConfig.slice(0, 160) : null);
console.log("smtpConfig:", settings?.smtpConfig ? settings.smtpConfig.slice(0, 160) : null);
console.log("siteUrl:", settings?.siteUrl);
const audits = await db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 25, include: { actor: { select: { email: true } } } });
console.log("\n=== Audit (25 derniers) ===");
for (const a of audits) {
  console.log(`${a.createdAt.toISOString()} | ${a.action} | ${a.entity} | actor=${a.actor?.email ?? "système"}${a.metadata ? " | " + a.metadata.slice(0, 160) : ""}`);
}
const users = await db.user.findMany({ orderBy: { createdAt: "desc" }, take: 10, select: { email: true, role: true, status: true, emailVerified: true, createdAt: true } });
console.log("\n=== Users (10 derniers) ===");
for (const u of users) console.log(`${u.createdAt.toISOString()} | ${u.email} | ${u.role}/${u.status} | verified=${u.emailVerified}`);
const tokens = await db.emailVerificationToken.findMany({ orderBy: { createdAt: "desc" }, take: 10, select: { expiresAt: true, usedAt: true, createdAt: true, user: { select: { email: true } } } });
console.log("\n=== Tokens vérification (10 derniers) ===");
for (const t of tokens) console.log(`${t.createdAt.toISOString()} | user=${t.user.email} | used=${t.usedAt ? t.usedAt.toISOString() : "non"} | exp=${t.expiresAt.toISOString()}`);
await db.$disconnect();
