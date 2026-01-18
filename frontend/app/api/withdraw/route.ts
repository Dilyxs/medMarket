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
    let walletAddress = body.walletAddress?.trim();

    if (!amount || amount <= 0 || isNaN(amount)) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    const db = await getDb();
    const userId = new ObjectId(session.userId);

    // Get user and check balance
    const user = await db.collection("users").findOne({ _id: userId });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // If no wallet address provided, use user's own wallet
    if (!walletAddress) {
      walletAddress = user.wallet?.address;
      if (!walletAddress) {
        return NextResponse.json({ error: "User wallet not found" }, { status: 400 });
      }
    }

    const currentBalance = user.balance || 0;
    const WITHDRAWAL_FEE = 0.00005; // SOL transaction fee
    const totalRequired = amount + WITHDRAWAL_FEE;
    
    if (totalRequired > currentBalance) {
      return NextResponse.json({ 
        error: `Insufficient balance. You have ${currentBalance.toFixed(4)} SOL, need ${totalRequired.toFixed(4)} SOL (including ${WITHDRAWAL_FEE} fee)` 
      }, { status: 400 });
    }

    // Call Go backend to sign and send transaction
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080';
    console.log(`[Withdraw API] Calling backend at: ${backendUrl}/api/withdraw`);
    console.log(`[Withdraw API] Payload:`, { user_id: userId.toString(), amount: amount.toString(), to_address: walletAddress });
    
    const solanaResponse = await fetch(`${backendUrl}/api/withdraw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId.toString(),
        amount: amount.toString(),
        to_address: walletAddress
      })
    });

    console.log(`[Withdraw API] Backend response status:`, solanaResponse.status);

    if (!solanaResponse.ok) {
      const errorData = await solanaResponse.json().catch(() => ({ error: "Unknown error" }));
      console.error(`[Withdraw API] Backend error:`, errorData);
      return NextResponse.json({ 
        error: errorData.error || "Failed to process withdrawal" 
      }, { status: 500 });
    }

    const solanaData = await solanaResponse.json();
    console.log(`[Withdraw API] Backend success:`, solanaData);

    // Deduct amount + fee from balance
    const newBalance = currentBalance - totalRequired;
    
    await db.collection("users").updateOne(
      { _id: userId },
      { 
        $set: { balance: newBalance }
      }
    );

    // Create withdrawal record
    const withdrawal = {
      userId: userId,
      amount,
      fee: WITHDRAWAL_FEE,
      walletAddress,
      signature: solanaData.signature,
      status: "completed",
      createdAt: new Date(),
    };

    await db.collection("withdrawals").insertOne(withdrawal);

    return NextResponse.json({ 
      success: true, 
      message: `Withdrawal successful! ${amount} SOL sent to ${walletAddress}`,
      signature: solanaData.signature,
      new_balance: newBalance,
      withdrawal 
    }, { status: 200 });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error("[Withdraw API] Exception caught:", errorMsg);
    console.error("[Withdraw API] Stack trace:", errorStack);
    return NextResponse.json({ 
      error: "Internal server error",
      details: errorMsg 
    }, { status: 500 });
  }
}
