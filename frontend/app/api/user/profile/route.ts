import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { getDb } from "@/lib/mongo";
import { ObjectId } from "mongodb";

export async function GET(request: Request) {
  try {
    const session = await getUserFromRequest(request);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const db = await getDb();
    const user = await db.collection("users").findOne({ _id: new ObjectId(session.userId) });

    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    return NextResponse.json({
      userId: session.userId,
      email: user.email,
      name: user.name,
      balance: user.balance || 0,
      tokens: user.tokens || 0,
      wallet: {
        address: user.wallet?.address || null,
      },
      createdAt: user.createdAt,
    });
  } catch (error) {
    console.error("Profile error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
