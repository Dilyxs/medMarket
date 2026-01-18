import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getUserFromRequest } from "@/lib/auth";
import { getDb } from "@/lib/mongo";

export async function POST(request: Request) {
  try {
    const session = await getUserFromRequest(request);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const amount = parseFloat(body.amount);
    const walletAddress = body.walletAddress?.trim();

    if (!amount || amount <= 0 || isNaN(amount)) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    if (!walletAddress) {
      return NextResponse.json({ error: "Wallet address required" }, { status: 400 });
    }

    const db = await getDb();
    const userId = new ObjectId(session.userId);

    // Get user and check balance
    const user = await db.collection("users").findOne({ _id: userId });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const currentBalance = user.balance || 0;
    if (amount > currentBalance) {
      return NextResponse.json({ error: "Insufficient balance" }, { status: 400 });
    }

    // Deduct amount from balance
    await db.collection("users").updateOne(
      { _id: userId },
      { $inc: { balance: -amount } }
    );

    // Create withdrawal record
    const withdrawal = {
      userId: userId,
      amount,
      walletAddress,
      status: "pending", // pending, completed, failed
      createdAt: new Date(),
    };

    await db.collection("withdrawals").insertOne(withdrawal);

    // TODO: In production, integrate with Solana backend to actually send SOL
    // For now, we just record the withdrawal request

    return NextResponse.json({ 
      success: true, 
      message: "Withdrawal request submitted",
      withdrawal 
    }, { status: 200 });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("withdraw POST error:", errorMsg);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
