import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getUserFromRequest } from "@/lib/auth";
import { getDb } from "@/lib/mongo";

export async function POST(request: Request) {
  try {
    const session = await getUserFromRequest(request);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const side = body.side; // "yes" or "no"
    const amount = parseFloat(body.amount);

    if (!side || (side !== "yes" && side !== "no")) {
      return NextResponse.json({ error: "Invalid side. Must be 'yes' or 'no'" }, { status: 400 });
    }

    if (!amount || amount <= 0 || isNaN(amount)) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
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

    // Create bet record
    const bet = {
      userId: userId,
      side,
      amount,
      status: "pending", // pending, won, lost
      createdAt: new Date(),
    };

    await db.collection("bets").insertOne(bet);

    return NextResponse.json({ success: true, bet }, { status: 200 });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("bets POST error:", errorMsg);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const session = await getUserFromRequest(request);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const db = await getDb();
    const userId = new ObjectId(session.userId);

    const bets = await db
      .collection("bets")
      .find({ userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();

    return NextResponse.json({ bets }, { status: 200 });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("bets GET error:", errorMsg);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
