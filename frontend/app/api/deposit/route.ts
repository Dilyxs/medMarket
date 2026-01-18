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
    const signature = body.signature?.trim();
    const walletAddress = body.walletAddress?.trim();

    if (!amount || amount <= 0 || isNaN(amount)) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    if (!signature) {
      return NextResponse.json({ error: "Transaction signature required" }, { status: 400 });
    }

    if (!walletAddress) {
      return NextResponse.json({ error: "Wallet address required" }, { status: 400 });
    }

    const db = await getDb();
    const userId = new ObjectId(session.userId);

    // Check if this signature was already processed (prevent replay)
    const existingDeposit = await db.collection("deposits").findOne({ signature });
    if (existingDeposit) {
      return NextResponse.json({ error: "This deposit has already been processed" }, { status: 400 });
    }

    // Credit user balance
    await db.collection("users").updateOne(
      { _id: userId },
      { 
        $inc: { balance: amount },
        $setOnInsert: { balance: amount }
      },
      { upsert: false }
    );

    // Record the deposit
    await db.collection("deposits").insertOne({
      userId,
      signature,
      amount,
      walletAddress,
      status: "completed",
      createdAt: new Date(),
    });

    // Get updated balance
    const user = await db.collection("users").findOne({ _id: userId });
    const newBalance = user?.balance || 0;

    return NextResponse.json({ 
      success: true, 
      balance: newBalance,
      message: `Deposit of ${amount} SOL credited successfully`
    }, { status: 200 });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("deposit POST error:", errorMsg);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
