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

    if (!amount || amount <= 0 || isNaN(amount)) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    const db = await getDb();
    const userId = new ObjectId(session.userId);

    // Get current user
    const user = await db.collection("users").findOne({ _id: userId });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const currentBalance = user.balance || 0;
    const newBalance = currentBalance + amount;

    // Add test deposit to user balance
    await db.collection("users").updateOne(
      { _id: userId },
      { 
        $set: { balance: newBalance }
      }
    );

    // Record the test deposit
    await db.collection("deposits").insertOne({
      userId,
      signature: `test-deposit-${Date.now()}`,
      walletAddress: "TEST-MODE",
      amount,
      status: "completed",
      test_mode: true,
      createdAt: new Date()
    });

    return NextResponse.json({
      success: true,
      message: `Test deposit of ${amount} SOL credited successfully`,
      amount,
      new_balance: newBalance,
      test_mode: true
    }, { status: 200 });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("test-deposit error:", errorMsg);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
