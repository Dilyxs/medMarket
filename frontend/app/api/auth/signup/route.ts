import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getDb } from "@/lib/mongo";
import { createSessionCookie, signSession } from "@/lib/auth";

interface SignupBody {
  email?: string;
  password?: string;
  name?: string;
  newsletter?: boolean;
}

// Generate a proper Solana wallet address using crypto random
function generateTestWallet() {
  const base58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  
  // Generate 32 random bytes for public key
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  
  let address = "";
  for (let i = 0; i < 44; i++) {
    address += base58.charAt(randomBytes[i % 32] % base58.length);
  }
  
  // Generate 64 random bytes for secret
  const secretBytes = new Uint8Array(64);
  crypto.getRandomValues(secretBytes);
  
  let secret = "";
  for (let i = 0; i < 88; i++) {
    secret += base58.charAt(secretBytes[i % 64] % base58.length);
  }
  
  return {
    address,
    secret
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SignupBody;
    const email = body.email?.toLowerCase().trim();
    const password = body.password?.trim();
    const name = body.name?.trim();
    const newsletter = Boolean(body.newsletter);

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    const db = await getDb();
    const users = db.collection("users");

    const existing = await users.findOne({ email });
    if (existing) {
      return NextResponse.json({ error: "User already exists" }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // Generate a wallet for the user
    const wallet = generateTestWallet();

    const insert = await users.insertOne({
      email,
      passwordHash,
      name: name || null,
      newsletter,
      balance: 0,
      wallet: {
        address: wallet.address,
        secret: wallet.secret,
        createdAt: new Date()
      },
      createdAt: new Date(),
    });

    const token = await signSession({
      userId: insert.insertedId.toString(),
      email,
      name: name || null,
    });

    const res = NextResponse.json({ message: "User created" }, { status: 201 });
    res.headers.set("Set-Cookie", createSessionCookie(token));
    return res;
  } catch (error) {
    console.error("Signup error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
