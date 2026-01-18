"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useState } from "react";
import { Button } from "./ui/button";

// Check if receiver address is configured
const RECEIVER_ADDRESS = process.env.NEXT_PUBLIC_SOL_RECEIVER || "";
const isConfigured = RECEIVER_ADDRESS && RECEIVER_ADDRESS !== "YOUR_MAINNET_WALLET_ADDRESS_HERE";

export function SolanaDeposit() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [amount, setAmount] = useState("0.01");
  const [isDepositing, setIsDepositing] = useState(false);
  const [message, setMessage] = useState("");

  // Show configuration warning if not set up
  if (!isConfigured) {
    return (
      <div className="flex flex-col gap-4 p-6 bg-card border border-border rounded-lg">
        <h2 className="text-xl font-semibold text-foreground">Deposit SOL</h2>
        <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-md">
          <p className="text-sm text-yellow-600 dark:text-yellow-500 font-semibold">⚠️ Configuration Required</p>
          <p className="text-xs text-muted-foreground mt-2">
            Set NEXT_PUBLIC_SOL_RECEIVER in frontend/.env.local with your Solana wallet address, then restart the dev server.
          </p>
        </div>
      </div>
    );
  }

  const RECIPIENT = new PublicKey(RECEIVER_ADDRESS);

  const deposit = async () => {
    if (!publicKey) {
      setMessage("Please connect your wallet first");
      return;
    }

    setIsDepositing(true);
    setMessage("");

    try {
      const solAmount = parseFloat(amount);
      if (isNaN(solAmount) || solAmount <= 0) {
        throw new Error("Invalid amount");
      }

      const lamports = Math.round(solAmount * LAMPORTS_PER_SOL);

      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: RECIPIENT,
          lamports,
        })
      );

      const sig = await sendTransaction(tx, connection);
      setMessage(`Transaction sent: ${sig.slice(0, 8)}...`);

      // Wait for confirmation
      await connection.confirmTransaction(sig, "confirmed");
      setMessage(`Confirming transaction...`);

      // Send to backend for verification + credit
      const response = await fetch("http://localhost:8080/verify_deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signature: sig,
          expected_lamports: lamports,
          receiver: RECIPIENT.toBase58(),
          user_wallet: publicKey.toBase58(),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Verification failed");
      }

      const result = await response.json();
      setMessage(`✓ Deposit successful! Credited: ${result.credited_lamports / LAMPORTS_PER_SOL} SOL`);
    } catch (error) {
      console.error("Deposit error:", error);
      const msg = error instanceof Error ? error.message : "Transaction failed";
      setMessage(`Error: ${msg}`);
    } finally {
      setIsDepositing(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-6 bg-card border border-border rounded-lg">
      <h2 className="text-xl font-semibold text-foreground">Deposit SOL</h2>
      
      <div className="flex flex-col gap-2">
        <WalletMultiButton className="!bg-primary !text-primary-foreground hover:!bg-primary/90" />
      </div>

      {publicKey && (
        <>
          <div className="flex flex-col gap-2">
            <label className="text-sm text-muted-foreground">Amount (SOL)</label>
            <input
              type="number"
              step="0.001"
              min="0.001"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="px-3 py-2 bg-background border border-border rounded-md text-foreground"
              disabled={isDepositing}
            />
          </div>

          <Button
            onClick={deposit}
            disabled={isDepositing || !publicKey}
            className="w-full"
          >
            {isDepositing ? "Processing..." : `Deposit ${amount} SOL`}
          </Button>
        </>
      )}

      {message && (
        <p className={`text-sm ${message.includes("Error") ? "text-red-500" : "text-green-500"}`}>
          {message}
        </p>
      )}
    </div>
  );
}
