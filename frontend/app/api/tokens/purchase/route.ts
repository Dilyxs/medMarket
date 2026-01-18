import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { getDb } from "@/lib/mongo";
import { ObjectId } from "mongodb";

export async function POST(req: NextRequest) {
  try {
    const session = await getUserFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.userId;
    const { solAmount } = await req.json();

    if (!solAmount || solAmount <= 0) {
      return NextResponse.json(
        { error: "Invalid SOL amount" },
        { status: 400 }
      );
    }

    const db = await getDb();
    const usersCollection = db.collection("users");

    // Check user's SOL balance
    const user = await usersCollection.findOne({ _id: new ObjectId(userId) });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const currentBalance = user.balance || 0;
    if (currentBalance < solAmount) {
      return NextResponse.json(
        { error: "Insufficient SOL balance" },
        { status: 400 }
      );
    }

    // Convert SOL to tokens (1 SOL = 200 tokens)
    const tokenAmount = solAmount * 200;

    await usersCollection.updateOne(
      { _id: new ObjectId(userId) },
      {
        $inc: {
          balance: -solAmount,
          tokens: tokenAmount,
        },
        $set: {
          updated_at: new Date(),
        },
      }
    );

    const updatedUser = await usersCollection.findOne({ _id: new ObjectId(userId) });

    return NextResponse.json({
      success: true,
      sol_converted: solAmount,
      tokens_received: tokenAmount,
      new_sol_balance: updatedUser?.balance || 0,
      new_token_balance: updatedUser?.tokens || 0,
    });
  } catch (error) {
    console.error("Token purchase error:", error);
    return NextResponse.json(
      { error: "Failed to purchase tokens" },
      { status: 500 }
    );
  }
}

// Get conversion rate and balances
export async function GET(req: NextRequest) {
  try {
    const session = await getUserFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.userId;

    const db = await getDb();
    const usersCollection = db.collection("users");

    const user = await usersCollection.findOne({ _id: new ObjectId(userId) });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      sol_balance: user.balance || 0,
      token_balance: user.tokens || 0,
      conversion_rate: 200, // 1 SOL = 200 tokens
    });
  } catch (error) {
    console.error("Get tokens error:", error);
    return NextResponse.json(
      { error: "Failed to get token info" },
      { status: 500 }
    );
  }
}
