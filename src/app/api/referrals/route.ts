import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { handleApiError, jsonOk } from "@/lib/api";
import { requireUser } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    let referral = await db.buyerReferralCode.findUnique({ where: { userId: user.id } });
    if (!referral) {
      for (let attempt = 0; attempt < 5 && !referral; attempt += 1) {
        try {
          referral = await db.buyerReferralCode.create({
            data: {
              userId: user.id,
              code: randomBytes(6).toString("hex").toUpperCase(),
            },
          });
        } catch (error) {
          if (
            !(error instanceof Prisma.PrismaClientKnownRequestError) ||
            error.code !== "P2002"
          ) {
            throw error;
          }
          referral = await db.buyerReferralCode.findUnique({ where: { userId: user.id } });
        }
      }
    }
    if (!referral) throw new Error("Impossible de créer votre code de parrainage.");

    const [earned, redeemed, referralCount] = await Promise.all([
      db.referralCredit.aggregate({
        where: { userId: user.id },
        _sum: { amountXOF: true },
        _count: { _all: true },
      }),
      db.referralCreditRedemption.aggregate({
        where: { userId: user.id },
        _sum: { amountXOF: true },
      }),
      db.referralCredit.count({ where: { userId: user.id } }),
    ]);
    const earnedXOF = earned._sum.amountXOF ?? 0;
    const redeemedXOF = redeemed._sum.amountXOF ?? 0;

    return jsonOk({
      code: referral.code,
      shareUrl: `${new URL(request.url).origin}/#/market?buyer_ref=${encodeURIComponent(referral.code)}`,
      earnedXOF,
      redeemedXOF,
      balanceXOF: Math.max(0, earnedXOF - redeemedXOF),
      successfulReferrals: referralCount,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
