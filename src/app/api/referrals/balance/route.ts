import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { handleApiError, jsonOk } from "@/lib/api";

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return jsonOk({ available: false, balanceXOF: 0 });

    const [earned, redeemed] = await Promise.all([
      db.referralCredit.aggregate({
        where: { userId: user.id },
        _sum: { amountXOF: true },
      }),
      db.referralCreditRedemption.aggregate({
        where: { userId: user.id },
        _sum: { amountXOF: true },
      }),
    ]);

    return jsonOk({
      available: true,
      balanceXOF: Math.max(0, (earned._sum.amountXOF ?? 0) - (redeemed._sum.amountXOF ?? 0)),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
