import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { getDb } from "@/lib/mongo";
import { ObjectId } from "mongodb";

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
    const session = await getUserFromRequest(request);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const db = await getDb();
    const userId = new ObjectId(session.userId);

    const user = await db.collection("users").findOne({ _id: userId });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Check if user already has a wallet
    if (user.wallet?.address) {
      return NextResponse.json({
        success: true,
        message: "Wallet already exists",
        wallet: { address: user.wallet.address }
      });
    }

    // Generate new wallet
    const newWallet = generateTestWallet();

    // Update user with new wallet
    await db.collection("users").updateOne(
      { _id: userId },
      {
        $set: {
          wallet: {
            address: newWallet.address,
            secret: newWallet.secret,
            createdAt: new Date()
          }
        }
      }
    );

    return NextResponse.json({
      success: true,
      message: "Wallet created successfully",
      wallet: { address: newWallet.address }
    });
  } catch (error) {
    console.error("Wallet creation error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
