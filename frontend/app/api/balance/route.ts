import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getUserFromRequest } from "@/lib/auth";
import { getDb } from "@/lib/mongo";

export async function GET(request: Request) {
  try {
    const session = await getUserFromRequest(request);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const db = await getDb();
    const user = await db
      .collection("users")
      .findOne({ _id: new ObjectId(session.userId) }, { projection: { passwordHash: 0 } });

    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Get balance from user document, default to 0
    const balance = user.balance || 0;

    return NextResponse.json({ balance }, { status: 200 });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("balance GET error:", errorMsg);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
