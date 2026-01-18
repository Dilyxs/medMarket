import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getUserFromRequest } from "@/lib/auth";
import { getDb } from "@/lib/mongo";

const DEPOSIT_FEE = 0.00005; // SOL

export async function POST(request: Request) {
  try {
    const session = await getUserFromRequest(request);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const amount = parseFloat(body.amount);
    const signature = body.signature; // Transaction signature from user's wallet transfer

    if (!amount || amount <= 0 || isNaN(amount)) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    if (!signature || typeof signature !== 'string') {
      return NextResponse.json({ error: "Transaction signature required" }, { status: 400 });
    }

    const db = await getDb();
    const userId = new ObjectId(session.userId);
    const user = await db.collection("users").findOne({ _id: userId });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Add deposit to user balance (minus fee)
    const amountAfterFee = amount - DEPOSIT_FEE;
    const currentBalance = user.balance || 0;
    const newBalance = currentBalance + amountAfterFee;

    await db.collection("users").updateOne(
      { _id: userId },
      { $set: { balance: newBalance } }
    );

    // Record the deposit
    await db.collection("deposits").insertOne({
      userId,
      signature,
      walletAddress: user.wallet?.address || "unknown",
      amount,
      fee: DEPOSIT_FEE,
      creditedAmount: amountAfterFee,
      status: "completed",
      createdAt: new Date(),
    });

    return NextResponse.json({
      success: true,
      message: `Deposit of ${amount} SOL received (${DEPOSIT_FEE} SOL fee)`,
      credited: amountAfterFee,
      new_balance: newBalance,
      fee: DEPOSIT_FEE,
    }, { status: 200 });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("deposit error:", errorMsg);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
