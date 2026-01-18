import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getUserFromRequest } from "@/lib/auth";
import { getDb } from "@/lib/mongo";
import { clearSessionCookie } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const session = await getUserFromRequest(request);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const db = await getDb();
    const user = await db
      .collection("users")
      .findOne({ _id: new ObjectId(session.userId) }, { projection: { passwordHash: 0 } });

    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    return NextResponse.json({ user }, { status: 200 });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("user GET error:", errorMsg);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getUserFromRequest(request);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : undefined;
    const newsletter = typeof body.newsletter === "boolean" ? body.newsletter : undefined;

    if (name === undefined && newsletter === undefined) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const db = await getDb();
    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name || null;
    if (newsletter !== undefined) updates.newsletter = newsletter;

    await db.collection("users").updateOne({ _id: new ObjectId(session.userId) }, { $set: updates });

    const user = await db
      .collection("users")
      .findOne({ _id: new ObjectId(session.userId) }, { projection: { passwordHash: 0 } });

    return NextResponse.json({ user }, { status: 200 });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("user PUT error:", errorMsg);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getUserFromRequest(request);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const db = await getDb();
    await db.collection("users").deleteOne({ _id: new ObjectId(session.userId) });

    const res = NextResponse.json({ message: "Account deleted" }, { status: 200 });
    res.headers.set("Set-Cookie", clearSessionCookie());
    return res;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("user DELETE error:", errorMsg);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
