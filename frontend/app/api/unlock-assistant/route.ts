import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getUserFromRequest } from "@/lib/auth";
import { getDb } from "@/lib/mongo";

const ASSISTANT_COST = 0.4; // SOL

export async function POST(request: Request) {
  try {
    const session = await getUserFromRequest(request);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const db = await getDb();
    const userId = new ObjectId(session.userId);

    // Get user
    const user = await db.collection("users").findOne({ _id: userId });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const userBalance = user.balance || 0;

    // Check sufficient balance
    if (userBalance < ASSISTANT_COST) {
      return NextResponse.json({ 
        error: `Insufficient balance. You have ${userBalance.toFixed(4)} SOL, need ${ASSISTANT_COST.toFixed(2)} SOL` 
      }, { status: 400 });
    }

    // Deduct payment
    const newBalance = userBalance - ASSISTANT_COST;
    await db.collection("users").updateOne(
      { _id: userId },
      { 
        $set: { 
          balance: newBalance,
          assistant_unlocked_at: new Date()
        },
        $inc: { assistant_purchases: 1 }
      }
    );

    return NextResponse.json({
      status: "unlocked",
      cost: ASSISTANT_COST,
      new_balance: newBalance,
      message: "Assistant unlocked! You can now use AI features."
    }, { status: 200 });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("unlock-assistant error:", errorMsg);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
