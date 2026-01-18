import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getDb } from "@/lib/mongo";
import { createSessionCookie, signSession } from "@/lib/auth";
import { ObjectId } from "mongodb";

interface SigninBody {
  email?: string;
  password?: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SigninBody;
    const email = body.email?.toLowerCase().trim();
    const password = body.password?.trim();

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    const db = await getDb();
    const users = db.collection("users");

    const user = await users.findOne<{ _id: ObjectId; passwordHash: string; name?: string | null }>({ email });
    if (!user) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const token = await signSession({
      userId: user._id.toString(),
      email,
      name: user.name || null,
    });

    const res = NextResponse.json({ message: "Signed in" }, { status: 200 });
    res.headers.set("Set-Cookie", createSessionCookie(token));
    return res;
  } catch (error) {
    console.error("Signin error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
